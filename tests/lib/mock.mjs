// A tiny local "world" for the n8n tests: an in-memory Google Sheet, Gmail, Telegram, Gemini and Groq.
// The test copy of a lane talks to it over HTTP, so the lane's own Code nodes run unchanged inside real n8n.
import http from 'node:http';
import { TABS, loadTemplate, headersOf } from './csv.mjs';

const KEYS = { SETTINGS: 'key', BRIEF: 'key', CONTENT: 'content_id', LEADS: 'lead_id', PROSPECTS: 'prospect_id', SEQUENCES: 'step_key', EVENTS_LOG: 'event_id', DASHBOARD: 'metric_key' };
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

export class Mock {
  constructor() { this.reset(); }
  reset() {
    this.tabs = Object.fromEntries(TABS.map((t) => [t, loadTemplate(t).map((r) => ({ ...r }))]));
    this.sent = [];        // Gmail messages
    this.posts = [];       // Telegram messages
    this.ai = [];          // AI requests
    this.writes = [];      // every append/update: { op, tab, row }
    this.reads = [];       // every read: tab
    this.fail = {};        // fault injection, see failNext()
    this.typed = false;    // return numbers/booleans instead of text (as Sheets sometimes does)
    this.aiScript = null;  // function (provider, body) => response or { status, body }
    this.nextThread = 1; this.nextMsg = 100;
  }
  // failNext('gmail', 2) -> the next 2 Gmail calls fail. failNext('sheets:EVENTS_LOG:append', 99).
  failNext(kind, times = 1) { this.fail[kind] = times; }
  shouldFail(kind) { if (this.fail[kind] > 0) { this.fail[kind]--; return true; } return false; }
  setting(key, value) {
    const row = this.tabs.SETTINGS.find((r) => r.key === key);
    if (row) row.value = String(value); else this.tabs.SETTINGS.push({ key, value: String(value), type: 'text', description: '' });
  }
  rows(tab) { return this.tabs[tab]; }
  find(tab, id) { return this.tabs[tab].find((r) => r[KEYS[tab]] === id); }
  // Move "now" forward by pretending every stored timestamp happened `minutes` earlier.
  shiftTime(minutes) {
    const shift = (v) => {
      if (typeof v !== 'string' || !TS.test(v)) return v;
      const d = new Date(new Date(v).getTime() - minutes * 60000);
      const ist = new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 19);
      return `${ist}+05:30`;
    };
    for (const tab of TABS) for (const row of this.tabs[tab]) for (const k of Object.keys(row)) row[k] = shift(row[k]);
  }
  events(type) { return this.tabs.EVENTS_LOG.filter((e) => !type || e.event_type === type).filter((e) => e.execution_id !== 'sample'); }

  coerce(row) {
    if (!this.typed) return row;
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === 'TRUE' ? true : v === 'FALSE' ? false : (/^-?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v) && k !== 'phone' && k !== 'value' ? Number(v) : v)]));
  }

  handle(path, body) {
    if (path === '/sheets') return this.sheets(body);
    if (path === '/gmail') {
      if (this.shouldFail('gmail')) return { status: 500, body: { message: 'Gmail is down (mock)' } };
      const threadId = `T${String(this.nextThread++).padStart(4, '0')}`;
      const msg = { id: `M${this.nextMsg++}`, threadId, ...body };
      this.sent.push(msg);
      return { status: 200, body: { id: msg.id, threadId, labelIds: ['SENT'] } };
    }
    if (path === '/telegram') {
      if (this.shouldFail('telegram')) return { status: 500, body: { ok: false, description: 'Telegram is down (mock)' } };
      const message_id = this.nextMsg++;
      this.posts.push({ ...body, message_id });
      return { status: 200, body: { ok: true, result: { message_id, chat: { id: body.chat_id }, text: body.text } } };
    }
    if (path.startsWith('/gemini') || path === '/groq') {
      const provider = path === '/groq' ? 'groq' : 'gemini';
      this.ai.push({ provider, body });
      const out = this.aiScript ? this.aiScript(provider, body, this) : { status: 500, body: { error: { message: 'no AI in this test' } } };
      return out;
    }
    return { status: 404, body: { message: `unknown mock path ${path}` } };
  }

  sheets({ op, tab, key, row }) {
    if (!this.tabs[tab]) return { status: 400, body: { message: `no tab ${tab}` } };
    if (op === 'read') {
      this.reads.push(tab);
      if (this.shouldFail(`sheets:${tab}:read`)) return { status: 500, body: { message: `Sheets read of ${tab} failed (mock)` } };
      return { status: 200, body: this.tabs[tab].map((r, i) => ({ ...this.coerce(r), row_number: i + 2 })) };
    }
    if (this.shouldFail(`sheets:${tab}:${op}`)) return { status: 500, body: { message: `Sheets ${op} on ${tab} failed (mock)` } };
    const cols = headersOf(tab);
    if (op === 'append') {
      const clean = Object.fromEntries(cols.map((c) => [c, row[c] === undefined || row[c] === null ? '' : String(row[c])]));
      this.tabs[tab].push(clean);
      this.writes.push({ op, tab, row: { ...row } });
      return { status: 200, body: clean };
    }
    if (op === 'update' || op === 'appendOrUpdate') {
      const keyCol = key || KEYS[tab];
      const existing = this.tabs[tab].find((r) => r[keyCol] === String(row[keyCol]));
      this.writes.push({ op, tab, row: { ...row } });
      if (!existing) {
        if (op === 'appendOrUpdate') {
          const clean = Object.fromEntries(cols.map((c) => [c, row[c] === undefined || row[c] === null ? '' : String(row[c])]));
          this.tabs[tab].push(clean);
          return { status: 200, body: clean };
        }
        this.misses = (this.misses || 0) + 1;
        return { status: 200, body: {} };
      }
      for (const c of cols) if (c !== keyCol && row[c] !== undefined && row[c] !== null) existing[c] = String(row[c]);   // only provided columns are written
      return { status: 200, body: { ...existing } };
    }
    return { status: 400, body: { message: `unknown op ${op}` } };
  }

  listen(port = 0) {
    this.server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        let body = {};
        try { body = data ? JSON.parse(data) : {}; } catch { /* leave empty */ }
        const path = req.url.split('?')[0];
        const out = this.handle(path, body);
        res.writeHead(out.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out.body));
      });
    });
    return new Promise((resolve) => this.server.listen(port, '127.0.0.1', () => resolve(this.server.address().port)));
  }
  close() { return new Promise((r) => this.server.close(r)); }
}
