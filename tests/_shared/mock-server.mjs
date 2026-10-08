// Tiny local mock of everything the lanes talk to: the Google Sheet (state kept in memory),
// Gmail, Telegram, Gemini and Groq. The test copy of a lane points its stub nodes here.
// Run directly: node tests/_shared/mock-server.mjs <port>   (the test runners start it themselves)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sheets-template');
const TABS = ['SETTINGS', 'BRIEF', 'CONTENT', 'LEADS', 'PROSPECTS', 'SEQUENCES', 'EVENTS_LOG', 'DASHBOARD'];
const KEYS = { SETTINGS: 'key', BRIEF: 'key', CONTENT: 'content_id', LEADS: 'lead_id', PROSPECTS: 'prospect_id', SEQUENCES: 'step_key', EVENTS_LOG: 'event_id', DASHBOARD: 'metric_key' };

export function parseCsv(textContent) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const text = textContent.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  return { header, rows: body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}

function loadTemplates() {
  const state = {};
  for (const tab of TABS) {
    const { header, rows } = parseCsv(readFileSync(path.join(TEMPLATE_DIR, `${tab}.csv`), 'utf8'));
    state[tab] = { header, rows };
  }
  return state;
}

export function startMock(port) {
  let sheets = loadTemplates();
  let calls = [];
  let config = {};
  let counters = { thread: 0, message: 0, telegram: 100, sheet: {} };

  const defaultConfig = () => ({
    ai: { gemini: 'ok', groq: 'ok', classify: null },        // modes: ok | http500 | bad_json | fenced | invented_price | two_sentences | long | digits
    gmailFail: [],                                           // recipient addresses (or '*') for which /gmail/send answers HTTP 500
    gmailReplyFail: false, gmailMarkReadFail: false, telegramFail: false,
    demoMailbox: [],                                         // messages returned by the "find latest email" stub
    owned: {},                                               // tab -> allowed columns for updates (violations are recorded)
    sheetFailWhen: [],                                       // e.g. [{ tab: 'EVENTS_LOG', op: 'append', field: 'entity_id', value: 'PR-I01' }] = every such write answers HTTP 500
    sheetFail: {},                                           // e.g. { 'EVENTS_LOG:append': [2] } = the 2nd append to EVENTS_LOG answers HTTP 500
    afterRead: [],                                           // e.g. [{ tab: 'PROSPECTS', nth: 1, id: 'PR-B02', set: { status: 'interested' } }] = another lane changes a row right AFTER that read
  });
  config = defaultConfig();
  const violations = [];

  function reset(body = {}) {
    sheets = loadTemplates();
    calls = [];
    counters = { thread: 0, message: 0, telegram: 100, sheet: {} };
    config = { ...defaultConfig(), ...(body.config || {}) };
    violations.length = 0;
    for (const [key, value] of Object.entries(body.settings || {})) {
      const row = sheets.SETTINGS.rows.find((r) => r.key === key);
      if (row) row.value = value; else sheets.SETTINGS.rows.push({ key, value, type: 'text', description: 'test' });
    }
  }

  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const stringify = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));

  function geminiText(promptText, lane, mode) {
    if (lane === 7) return null;
    const name = /business_name: (.*)/.exec(promptText)?.[1]?.trim() || 'your boutique';
    const good = `Your feed shows how ${name} turns festive dressing into something personal, and that is lovely to see.`;
    return {
      ok: JSON.stringify({ opener: good }),
      fenced: '```json\n' + JSON.stringify({ opener: good }) + '\n```',
      invented_price: JSON.stringify({ opener: `We love how ${name} makes festive style affordable, and our pieces start at ₹999 too.` }),
      two_sentences: JSON.stringify({ opener: `We love what ${name} is doing. Your customers must adore it.` }),
      long: JSON.stringify({ opener: `We have been admiring ${name} for a very long time because every single post you share feels warm and thoughtful and creative and festive and beautifully put together for all of your followers every week.` }),
      digits: JSON.stringify({ opener: `We have followed ${name} since 2019 and loved every post.` }),
      forbidden: JSON.stringify({ opener: `Your ${name} feed has such a real gold glow, we had to write.` }),
      bad_json: 'sorry, here is your opener: lovely things',
    }[mode];
  }

  function classify(promptText) {
    const reply = /<<<REPLY\n([\s\S]*?)\nREPLY>>>/.exec(promptText)?.[1] ?? '';
    const t = reply.toLowerCase();
    let reply_class = 'other';
    if (/unsubscribe|\bstop\b|remove me/.test(t)) reply_class = 'unsubscribe';
    else if (/not interested|no thanks/.test(t)) reply_class = 'not_interested';
    else if (/later|next season|not now/.test(t)) reply_class = 'not_now';
    else if (/\b(yes|interested|lookbook|price|send)\b/.test(t)) reply_class = 'interested';
    else if (t.includes('?')) reply_class = 'question';
    return { reply_class, confidence: 0.9, summary: `Customer says: ${reply.replace(/\s+/g, ' ').slice(0, 60)}`, suggested_next_step: 'Reply personally today.' };
  }

  function aiAnswer(provider, body) {
    const mode = config.ai[provider];
    const promptText = provider === 'gemini' ? body.contents?.[0]?.parts?.[0]?.text ?? '' : body.messages?.[1]?.content ?? '';
    const isClassify = promptText.includes('<<<REPLY');
    if (mode === 'http500') return { status: 500, body: { error: { code: 500, message: 'mock: model overloaded' } } };
    let text;
    if (isClassify) {
      const forced = config.ai.classify;
      const answer = typeof forced === 'function' ? forced : forced ? { ...classify(promptText), ...forced } : classify(promptText);
      text = mode === 'bad_json' ? 'I think this customer is happy' : mode === 'fenced' ? '```json\n' + JSON.stringify(answer) + '\n```' : JSON.stringify(answer);
    } else text = geminiText(promptText, 6, mode);
    if (provider === 'gemini') return { status: 200, body: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] } };
    return { status: 200, body: { choices: [{ message: { content: text }, finish_reason: 'stop' }] } };
  }

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { _raw: raw }; }
    const url = new URL(req.url, 'http://mock');
    const parts = url.pathname.split('/').filter(Boolean);
    const record = (kind, extra = {}) => calls.push({ kind, at: Date.now(), ...extra });

    // ---- control endpoints used by the test runner
    if (parts[0] === '__reset') { reset(body); return send(res, 200, { ok: true }); }
    if (parts[0] === '__config') { config = { ...config, ...body, ai: { ...config.ai, ...(body.ai || {}) } }; return send(res, 200, { ok: true }); }
    if (parts[0] === '__calls') return send(res, 200, calls.filter((c) => !url.searchParams.get('kind') || c.kind === url.searchParams.get('kind')));
    if (parts[0] === '__violations') return send(res, 200, violations);
    if (parts[0] === '__sheet' && req.method === 'GET') return send(res, 200, sheets[parts[1]].rows.map(stringify));
    if (parts[0] === '__sheet' && req.method === 'PUT') { sheets[parts[1]].rows = body; return send(res, 200, { ok: true }); }

    // ---- Google Sheets stand-in
    if (parts[0] === 'sheet') {
      const tab = parts[1];
      const table = sheets[tab];
      if (!table) return send(res, 404, { error: `unknown tab ${tab}` });
      if (req.method === 'GET') {
        record('sheet_read', { tab });
        const rows = table.rows.map((row, i) => ({ ...stringify(row), row_number: i + 2 }));
        const nth = calls.filter((c) => c.kind === 'sheet_read' && c.tab === tab).length;
        for (const rule of config.afterRead || []) {
          if (rule.tab !== tab || rule.nth !== nth) continue;
          const target = table.rows.find((r) => String(r[KEYS[tab]]) === String(rule.id));
          if (target) Object.assign(target, rule.set);
        }
        return send(res, 200, rows);
      }
      if (parts[2] === 'update' || parts[2] === 'append') {
        const counterKey = `${tab}:${parts[2]}`;
        counters.sheet[counterKey] = (counters.sheet[counterKey] || 0) + 1;
        const failing = (config.sheetFailWhen || []).some((rule) => rule.tab === tab && rule.op === parts[2] && String(body[rule.field]) === String(rule.value));
        if (failing || (config.sheetFail[counterKey] || []).includes(counters.sheet[counterKey])) { record('sheet_failed', { tab, op: parts[2] }); return send(res, 500, { error: 'mock: Google Sheets is unavailable' }); }
      }
      if (parts[2] === 'update') {
        const key = KEYS[tab];
        const row = table.rows.find((r) => String(r[key]) === String(body[key]));
        const columns = Object.keys(body).filter((c) => table.header.includes(c));
        record('sheet_update', { tab, payload: body });
        if (config.owned[tab]) for (const column of columns) if (column !== key && !config.owned[tab].includes(column)) violations.push({ tab, column, row: body[key] });
        if (!row) return send(res, 200, body);          // the real node also silently updates nothing
        for (const column of columns) if (column !== key) row[column] = body[column];
        return send(res, 200, body);
      }
      if (parts[2] === 'append') {
        record('sheet_append', { tab, payload: body });
        const row = Object.fromEntries(table.header.map((h) => [h, body[h] ?? '']));
        table.rows.push(row);
        return send(res, 200, body);
      }
    }

    // ---- Gmail stand-in
    if (parts[0] === 'gmail') {
      if (parts[1] === 'send') {
        record('gmail_send', { payload: body });
        if (config.gmailFail.includes('*') || config.gmailFail.includes(body.to)) return send(res, 500, { error: { code: 500, message: 'mock: Gmail is unavailable' } });
        counters.thread += 1; counters.message += 1;
        return send(res, 200, { id: `msg-${counters.message}`, threadId: `thr-${counters.thread}`, labelIds: ['SENT'] });
      }
      if (parts[1] === 'reply') {
        record('gmail_reply', { payload: body });
        if (config.gmailReplyFail) return send(res, 500, { error: { message: 'mock: reply failed' } });
        counters.message += 1;
        return send(res, 200, { id: `msg-${counters.message}`, threadId: body.thread_id || 'thr-x', labelIds: ['SENT'] });
      }
      if (parts[1] === 'markread') {
        record('gmail_markread', { payload: body });
        if (config.gmailMarkReadFail) return send(res, 500, { error: { message: 'mock: mark read failed' } });
        return send(res, 200, { id: body.message_id, threadId: 'thr-x', labelIds: ['INBOX'] });
      }
      if (parts[1] === 'getall') {
        record('gmail_getall', { payload: body });
        return send(res, 200, config.demoMailbox);
      }
    }

    // ---- Telegram stand-in
    if (parts[0] === 'telegram') {
      record('telegram', { payload: body });
      if (config.telegramFail) return send(res, 500, { ok: false, description: 'mock: Telegram is down' });
      counters.telegram += 1;
      return send(res, 200, { ok: true, result: { message_id: counters.telegram, text: body.text } });
    }

    // ---- AI stand-ins
    if (parts[0] === 'gemini') {
      const answer = aiAnswer('gemini', body);
      record('gemini', { url: url.pathname, payload: body, status: answer.status });
      return send(res, answer.status, answer.body);
    }
    if (parts[0] === 'groq') {
      const answer = aiAnswer('groq', body);
      record('groq', { payload: body, status: answer.status });
      return send(res, answer.status, answer.body);
    }
    return send(res, 404, { error: 'unknown route ' + url.pathname });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 4010);
  await startMock(port);
  console.log(`mock listening on ${port}`);
}
