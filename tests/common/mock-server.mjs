// A tiny local stand-in for Google Sheets, Gmail and Telegram, used ONLY by the lane tests.
// The test copy of a lane swaps its Sheets / Gmail / Telegram nodes for HTTP Request nodes that talk to this server.
// It keeps the sheet tabs in memory, applies the same write rules as the real nodes (update only touches the
// columns it is given; an unknown column would create a new sheet column = a violation), and records everything.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TABS = ['SETTINGS', 'BRIEF', 'CONTENT', 'LEADS', 'PROSPECTS', 'SEQUENCES', 'EVENTS_LOG', 'DASHBOARD'];
const header = (tab) => readFileSync(join(ROOT, 'sheets-template', `${tab}.csv`), 'utf8').split('\n')[0].trim().split(',');

export class Mock {
  constructor() { this.server = null; this.port = 0; this.reset(); }

  reset() {
    this.tabs = Object.fromEntries(TABS.map((tab) => [tab, { header: header(tab), rows: [] }]));
    this.writes = [];        // every append/update: { tab, op, key, columns }
    this.violations = [];    // anything a real Sheets node would have done wrongly (new columns, ...)
    this.sent = [];          // emails accepted
    this.messages = [];      // telegram messages accepted
    this.requests = [];      // every request path, in order
    this.fail = { gmail: () => false, telegram: () => false, sheetsRead: () => false, sheetsWrite: () => false };
    this.counter = 100;
    this.lastActivity = Date.now();
    this.inflight = 0;
  }

  // Rows are stored with EVERY column of the tab ('' when blank), like the Sheets read node returns them.
  setRows(tab, rows) {
    const { header: cols } = this.tabs[tab];
    this.tabs[tab].rows = rows.map((row) => Object.fromEntries(cols.map((col) => [col, row[col] ?? ''])));
  }
  rows(tab) { return this.tabs[tab].rows; }
  settings(overrides = {}) {
    const defaults = {
      DEMO_MODE: 'TRUE', DEMO_MINUTES_PER_DAY: 2, LAUNCH_DATE: '2026-10-26', LAUNCH_TIME: '10:00', EARLY_ACCESS_DAYS: 2,
      WAITLIST_FORM_URL: 'http://localhost:5678/form/kaya-waitlist', SENDER_NAME: 'Kaya Jewels (Demo)', SENDER_EMAIL: 'kayademo.hello@gmail.com',
      ALLOWED_EMAIL_DOMAINS: '', ALLOWED_DEMO_INBOXES: 'kayademo.customers@gmail.com', MAX_SENDS_PER_RUN: 3, SEND_DELAY_SECONDS: 1,
      MIN_EMAIL_GAP_DAYS: 0.5, MAX_POSTS_PER_RUN: 2, TELEGRAM_OWNER_CHAT_ID: '555000111', TELEGRAM_CHANNEL_ID: '@kayajewels_demo',
      HOT_LEAD_SCORE: 70, WARM_LEAD_SCORE: 40,
      UNSUBSCRIBE_LINE: 'Not for you? Just reply "unsubscribe" and we will not email you again.',
    };
    const all = { ...defaults, ...overrides };
    this.setRows('SETTINGS', Object.entries(all).filter(([, v]) => v !== undefined).map(([key, value]) => ({ key, value, type: 'text', description: '' })));
  }

  async start() {
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.port = this.server.address().port;
    return this;
  }
  stop() { return new Promise((resolve) => this.server.close(resolve)); }
  get url() { return `http://127.0.0.1:${this.port}`; }

  // Resolves once a request beyond `sinceCount` has arrived (the workflow has really started).
  async waitActivity(sinceCount, maxMs = 30000) {
    const started = Date.now();
    while (this.requests.length <= sinceCount) {
      if (Date.now() - started > maxMs) throw new Error('the workflow never called the mock (did it start?)');
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Resolves when no request has arrived for `quietMs` (used when a trigger gives no "finished" signal).
  async idle(quietMs = 2500, maxMs = 90000) {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
      if (this.inflight === 0 && Date.now() - this.lastActivity >= quietMs) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('mock never went idle');
  }

  json(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  }

  handle(req, res) {
    this.inflight++;
    this.lastActivity = Date.now();
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { this.route(req, res, chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); }
      catch (e) { this.json(res, 500, { message: `mock crashed: ${e.message}` }); }
      finally { this.inflight--; this.lastActivity = Date.now(); }
    });
  }

  route(req, res, body) {
    const url = new URL(req.url, this.url);
    const parts = url.pathname.split('/').filter(Boolean);
    this.requests.push(`${req.method} ${url.pathname}`);

    if (parts[0] === 'sheets') {
      const tab = parts[1];
      if (!this.tabs[tab]) return this.json(res, 404, { message: `no tab ${tab}` });
      const t = this.tabs[tab];
      if (req.method === 'GET') {
        if (this.fail.sheetsRead(tab)) return this.json(res, 503, { message: 'sheets read failed' });
        return this.json(res, 200, t.rows.map((row, i) => ({ ...row, row_number: i + 2 })));
      }
      if (this.fail.sheetsWrite(tab, parts[2], body)) return this.json(res, 503, { message: 'sheets write failed' });
      if (parts[2] === 'append') {
        const unknown = Object.keys(body).filter((k) => !t.header.includes(k));    // ignoreIt: dropped, like the real node
        const row = Object.fromEntries(t.header.map((col) => [col, body[col] ?? '']));
        t.rows.push(row);
        this.writes.push({ tab, op: 'append', key: row[t.header[0]], columns: Object.keys(body).filter((k) => t.header.includes(k)), ignored: unknown });
        return this.json(res, 200, body);
      }
      if (parts[2] === 'update') {
        const keyCol = url.searchParams.get('key');
        const unknown = Object.keys(body).filter((k) => !t.header.includes(k));
        if (unknown.length) {
          this.violations.push(`${tab} update would create new column(s): ${unknown.join(', ')}`);
          return this.json(res, 400, { message: `unexpected columns ${unknown}` });
        }
        const row = t.rows.find((r) => String(r[keyCol]) === String(body[keyCol]));
        if (!row) { this.violations.push(`${tab} update found no row with ${keyCol}=${body[keyCol]}`); return this.json(res, 200, body); }
        for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null) row[k] = v;
        this.writes.push({ tab, op: 'update', key: body[keyCol], columns: Object.keys(body) });
        return this.json(res, 200, body);
      }
    }
    if (parts[0] === 'gmail' && parts[1] === 'send') {
      if (this.fail.gmail(body)) return this.json(res, 500, { message: 'gmail send failed (mock)' });
      const n = ++this.counter;
      this.sent.push({ ...body, id: `msg${n}`, threadId: `thr${n}`, at: Date.now() });
      return this.json(res, 200, { id: `msg${n}`, threadId: `thr${n}`, labelIds: ['SENT'] });
    }
    if (parts[0] === 'telegram' && parts[1] === 'send') {
      if (this.fail.telegram(body)) return this.json(res, 403, { ok: false, error_code: 403, description: 'Forbidden: bot is not a member of the channel chat (mock)' });
      if (String(body.text ?? '').length > 4096) return this.json(res, 400, { ok: false, error_code: 400, description: 'Bad Request: message is too long' });
      const n = ++this.counter;
      this.messages.push({ ...body, message_id: n, at: Date.now() });
      return this.json(res, 200, { message_id: n, chat: { id: body.chat_id }, date: Math.floor(Date.now() / 1000), text: body.text });
    }
    return this.json(res, 404, { message: `unknown route ${req.method} ${url.pathname}` });
  }
}
