// The "world" for the end-to-end demo storyline (session 5): one in-memory Google Sheet seeded from sheets-template/,
// two Gmail mailboxes, a Telegram chat + channel, and Gemini/Groq. The canvas TEST COPY (tests/e2e/run.mjs) talks to it.
//
// What makes it more than a stub:
//  * A virtual clock. advance(minutes) moves every timestamp stored in the sheet `minutes` into the past, which to the
//    lanes (they use the real clock) is exactly "minutes have passed". Every email/post is stamped with virtual time.
//  * Two mailboxes with their OWN thread ids, as in real Gmail: the Sender (Kaya Jewels) and the Demo Customers inbox.
//    A send from the Sender lands in the customers mailbox (plus-addresses of it) as a separate copy with its own thread.
//    A reply follows n8n 1.123.84's Gmail "reply" code (utils/replyToEmail.js): From = the account's bare address,
//    To = the original From (+ the original To list unless "Reply to Sender Only"), In-Reply-To/References = the
//    original Message-ID, same subject. The receiving mailbox threads it like Gmail does: into the thread that holds the
//    message it replies to. So Lane 7 sees the reply exactly as it would for real: from the BARE demo address, in the
//    Sender's thread.
//  * Column ownership: every sheet write carries the writing node's name; a write to a column the lane does not own
//    (SPEC 2.x "Written by") is recorded as a violation.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../_shared/mock-server.mjs';

const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sheets-template');
export const TABS = ['SETTINGS', 'BRIEF', 'CONTENT', 'LEADS', 'PROSPECTS', 'SEQUENCES', 'EVENTS_LOG', 'DASHBOARD'];
export const KEYS = { SETTINGS: 'key', BRIEF: 'key', CONTENT: 'content_id', LEADS: 'lead_id', PROSPECTS: 'prospect_id', SEQUENCES: 'step_key', EVENTS_LOG: 'event_id', DASHBOARD: 'metric_key' };
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

// SPEC 2.3–2.8 "Written by" (updates only; appends of whole new rows are checked separately).
export const OWNED = {
  CONTENT: { 2: ['status', 'published_at', 'publish_ref', 'last_error', 'updated_at'] },
  LEADS: {
    2: ['last_newsletter_id', 'last_contacted_at', 'thread_ids', 'updated_at', 'status', 'email_allowed'],
    4: ['status', 'seq_step', 'next_action_at', 'last_contacted_at', 'thread_ids', 'email_allowed', 'updated_at'],
    5: ['launch_step', 'last_contacted_at', 'thread_ids', 'status', 'email_allowed', 'updated_at'],
    7: ['status', 'last_reply_at', 'reply_class', 'next_action_at', 'notes', 'updated_at'],
  },
  PROSPECTS: {
    6: ['status', 'seq_step', 'next_action_at', 'last_contacted_at', 'thread_ids', 'email_allowed', 'updated_at'],
    7: ['status', 'last_reply_at', 'reply_class', 'next_action_at', 'deal_notes', 'updated_at'],
  },
  SEQUENCES: { 5: ['broadcast_done_at'] },
  DASHBOARD: { 8: ['value', 'updated_at'] },
};
const APPENDERS = { CONTENT: [1], LEADS: [3], EVENTS_LOG: [1, 2, 3, 4, 5, 6, 7, 8] };

const base = (address) => { const m = /^([^@+]+)(\+[^@]*)?@(.+)$/.exec(String(address).trim().toLowerCase()); return m ? `${m[1]}@${m[3]}` : String(address).toLowerCase(); };
const addressOf = (text) => { const m = /<([^>]+)>/.exec(text); return (m ? m[1] : text).trim().toLowerCase(); };

export class World {
  constructor({ sender, customers }) { this.accounts = { sender, customers }; this.reset(); }

  reset() {
    this.tabs = {};
    for (const tab of TABS) this.tabs[tab] = parseCsv(readFileSync(path.join(TEMPLATE_DIR, `${tab}.csv`), 'utf8'));
    this.offsetMs = 0;
    this.mail = { sender: [], customers: [] };   // messages per mailbox
    this.counters = { msg: 0, thread: 0, tg: 500 };
    this.telegram = [];
    this.ai = [];
    this.writes = [];
    this.violations = [];
    this.delivered = new Set();                   // inbox message ids already handed to the Lane 7 trigger
  }
  vnow() { return Date.now() + this.offsetMs; }
  rows(tab) { return this.tabs[tab].rows; }
  row(tab, id) { return this.tabs[tab].rows.find((r) => r[KEYS[tab]] === id); }
  setting(key, value) {
    const row = this.row('SETTINGS', key);
    if (row) row.value = String(value); else this.tabs.SETTINGS.rows.push({ key, value: String(value), type: 'text', description: 'e2e' });
  }
  events(type) { return this.rows('EVENTS_LOG').filter((e) => e.execution_id !== 'sample' && (!type || e.event_type === type)); }
  advance(minutes) {
    const shift = (v) => {
      if (typeof v !== 'string' || !TS.test(v)) return v;
      const d = new Date(new Date(v).getTime() - minutes * 60000 + 5.5 * 3600000);
      return `${d.toISOString().slice(0, 19)}+05:30`;
    };
    for (const tab of TABS) for (const row of this.tabs[tab].rows) for (const k of Object.keys(row)) row[k] = shift(row[k]);
    this.offsetMs += minutes * 60000;
  }

  // ---------- Sheets
  sheetRead(tab) { return this.tabs[tab].rows.map((row, i) => ({ ...row, row_number: i + 2 })); }
  sheetWrite(tab, op, node, body, ignoreExtra = false) {
    const table = this.tabs[tab];
    const lane = Number(/^Lane (\d) ·/.exec(node || '')?.[1]);
    const key = KEYS[tab];
    const cols = Object.keys(body).filter((c) => table.header.includes(c));
    this.writes.push({ tab, op, node, lane, row: body, at: this.vnow() });
    // Extra fields create new sheet columns unless the node has handlingExtraData = ignoreIt (SPEC 5.4).
    if (!ignoreExtra) for (const c of Object.keys(body)) if (!table.header.includes(c)) this.violations.push(`${node}: ${op} ${tab} sends unknown column "${c}" (would create a new sheet column)`);
    if (op === 'append') {
      if (!(APPENDERS[tab] || []).includes(lane)) this.violations.push(`${node}: Lane ${lane} appended to ${tab}`);
      table.rows.push(Object.fromEntries(table.header.map((h) => [h, body[h] === undefined || body[h] === null ? '' : String(body[h])])));
      return body;
    }
    const owned = OWNED[tab]?.[lane] || [];
    for (const c of cols) if (c !== key && !owned.includes(c)) this.violations.push(`${node}: Lane ${lane} wrote ${tab}.${c} (not its column)`);
    let row = table.rows.find((r) => String(r[key]) === String(body[key]));
    if (!row && op === 'appendOrUpdate') { row = Object.fromEntries(table.header.map((h) => [h, ''])); row[key] = String(body[key]); table.rows.push(row); }
    if (!row) { this.violations.push(`${node}: update of ${tab} ${body[key]} matched no row`); return body; }
    for (const c of cols) if (c !== key && body[c] !== undefined && body[c] !== null) row[c] = String(body[c]);
    return body;
  }

  // ---------- Gmail
  newMessage(box, fields) {
    const msg = { id: `${box}-m${++this.counters.msg}`, messageIdHeader: `<e2e-${this.counters.msg}@mail.gmail.com>`, at: this.vnow(), labels: [], ...fields };
    this.mail[box].push(msg);
    return msg;
  }
  // Delivery into a mailbox: Gmail threads a reply into the thread of the message it answers (same subject).
  deliver(box, msg) {
    const parent = msg.inReplyTo && this.mail[box].find((m) => m.messageIdHeader === msg.inReplyTo && m.subject.replace(/^(re:\s*)+/i, '') === msg.subject.replace(/^(re:\s*)+/i, ''));
    const threadId = parent ? parent.threadId : `${box}-t${++this.counters.thread}`;
    return this.newMessage(box, { ...msg, threadId, labels: ['INBOX', 'UNREAD'] });
  }
  send({ account, to, subject, html, sender_name }) {
    const from = this.accounts[account];
    const sent = this.newMessage(account, { from, fromName: sender_name, to: [to], subject, html, threadId: `${account}-t${++this.counters.thread}`, labels: ['SENT'] });
    for (const box of Object.keys(this.accounts)) if (box !== account && base(to) === this.accounts[box]) this.deliver(box, { from, fromName: sender_name, to: [to], subject, html, messageIdHeader: sent.messageIdHeader });
    return { id: sent.id, threadId: sent.threadId, labelIds: ['SENT'] };
  }
  getAll({ account, q }) {
    const from = /from:(\S+)/.exec(q)?.[1]?.toLowerCase();
    const to = /to:(\S+)/.exec(q)?.[1]?.toLowerCase();
    const hits = this.mail[account].filter((m) => (!from || m.from === from) && (!to || m.to.some((t) => t === to))).sort((a, b) => b.at - a.at);
    return hits.slice(0, 1).map((m) => ({ id: m.id, threadId: m.threadId, From: m.fromName ? `${m.fromName} <${m.from}>` : m.from, To: m.to.join(', '), Subject: m.subject }));
  }
  // n8n 1.123.84 GmailV2 reply (utils/replyToEmail.js), nodeVersion 2.1.
  reply({ account, message_id, html, reply_to_sender_only }) {
    const original = this.mail[account].find((m) => m.id === message_id);
    if (!original) return null;
    const me = this.accounts[account];
    const to = [original.from];
    if (!reply_to_sender_only) for (const t of original.to) if (!t.includes(me)) to.push(t);   // n8n: `if (email.includes(emailAddress)) return;`
    const reply = { from: me, to, subject: original.subject, html, inReplyTo: original.messageIdHeader };
    const sent = this.newMessage(account, { ...reply, threadId: original.threadId, labels: ['SENT'] });
    for (const recipient of [...new Set(to)]) {
      for (const box of Object.keys(this.accounts)) if (base(recipient) === this.accounts[box]) this.deliver(box, { ...reply, messageIdHeader: sent.messageIdHeader, to: [recipient] });
    }
    return { id: sent.id, threadId: sent.threadId, labelIds: ['SENT'], to };
  }
  markRead({ message_id }) {
    const msg = this.mail.sender.find((m) => m.id === message_id);
    if (msg) msg.labels = msg.labels.filter((l) => l !== 'UNREAD');
    return { id: message_id, labelIds: msg?.labels ?? [] };
  }
  // What the Gmail Trigger (simple: false, INBOX, unread, -from:me) would hand over on its next poll.
  inboxPoll() {
    const fresh = this.mail.sender.filter((m) => m.labels.includes('INBOX') && m.labels.includes('UNREAD') && m.from !== this.accounts.sender && !this.delivered.has(m.id));
    for (const m of fresh) this.delivered.add(m.id);
    return fresh.map((m) => ({
      id: m.id, threadId: m.threadId, labelIds: m.labels, subject: m.subject, text: String(m.html).replace(/<[^>]+>/g, ''), html: m.html,
      from: { value: [{ address: m.from, name: '' }], text: m.from }, to: { value: m.to.map((address) => ({ address, name: '' })) },
      headers: { 'in-reply-to': `In-Reply-To: ${m.inReplyTo ?? ''}` }, date: new Date(m.at).toISOString(),
    }));
  }
  emailsTo(address) { return this.mail.sender.filter((m) => m.labels.includes('SENT') && m.to.includes(address)); }
  allSent() { return this.mail.sender.filter((m) => m.labels.includes('SENT')); }

  // ---------- Telegram
  telegramSend({ chat_id, text }) {
    const message_id = ++this.counters.tg;
    this.telegram.push({ chat_id: String(chat_id), text, message_id, at: this.vnow() });
    return { ok: true, result: { message_id, chat: { id: chat_id }, text } };
  }

  // ---------- AI (answers by the JSON schema each lane asks for)
  aiAnswer(provider, body) {
    const schema = body.generationConfig?.responseSchema?.properties || {};
    const prompt = provider === 'gemini' ? body.contents?.[0]?.parts?.[0]?.text ?? '' : body.messages?.[1]?.content ?? '';
    let data;
    if (schema.article_markdown) data = blog();
    else if (schema.captions) data = { captions: [1, 2, 3, 4, 5].map((i) => caption(i)) };
    else if (schema.reels) data = { reels: [1, 2, 3].map((i) => reel(i)) };
    else if (schema.html_body) data = newsletter();
    else if (schema.short_posts) data = { short_posts: [1, 2, 3].map((i) => ({ angle: `Handmade in Jaipur ${i}`, text: `Every Roshni Edit piece is handmade in our Jaipur studio. Join the waitlist for early access. Waitlist link in bio ✨`, hashtags: ['#RoshniEdit', '#KayaJewels'] })) };
    else if (schema.opener) { const name = /business_name: (.*)/.exec(prompt)?.[1]?.trim() || 'your boutique'; data = { opener: `Your feed shows how ${name} turns festive dressing into something personal, and that is lovely to see.` }; }
    else if (schema.reply_class) data = classify(prompt);
    else if (schema.insights) data = { insights: ['The waitlist and outreach are both moving this period.', 'Hot replies show the boutique offer is landing well.', 'Follow up personally with every hot reply today.'] };
    else return { status: 400, body: { error: { message: `e2e world: unknown AI request (${Object.keys(schema).join(',')})` } } };
    this.ai.push({ provider, kind: Object.keys(schema)[0] });
    const text = JSON.stringify(data);
    if (provider === 'gemini') return { status: 200, body: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] } };
    return { status: 200, body: { choices: [{ message: { content: text }, finish_reason: 'stop' }] } };
  }

  listen() {
    const server = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body = {};
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { body = {}; }
      const url = new URL(req.url, 'http://world');
      const parts = url.pathname.split('/').filter(Boolean);
      const send = (status, json) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)); };
      // Real Google Sheets / Gmail / Telegram calls take time; without it the minute lanes could never overlap.
      const latency = { sheet: 250, gmail: 400, telegram: 200 }[parts[0]] ?? 0;
      if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
      try {
        if (parts[0] === 'sheet' && req.method === 'GET') return send(200, this.sheetRead(parts[1]));
        if (parts[0] === 'sheet') return send(200, this.sheetWrite(parts[1], parts[2], url.searchParams.get('node'), body, url.searchParams.get('extra') === 'ignore'));
        if (parts[0] === 'gmail' && parts[1] === 'send') return send(200, this.send(body));
        if (parts[0] === 'gmail' && parts[1] === 'getall') return send(200, this.getAll(body));
        if (parts[0] === 'gmail' && parts[1] === 'reply') { const r = this.reply(body); return r ? send(200, r) : send(404, { error: { message: 'message not found' } }); }
        if (parts[0] === 'gmail' && parts[1] === 'markread') return send(200, this.markRead(body));
        if (parts[0] === 'telegram') return send(200, this.telegramSend(body));
        if (parts[0] === 'gemini' || parts[0] === 'groq') { const a = this.aiAnswer(parts[0], body); return send(a.status, a.body); }
        return send(404, { error: `unknown route ${url.pathname}` });
      } catch (error) { return send(500, { error: { message: String(error.stack || error) } }); }
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { this.server = server; resolve(`http://127.0.0.1:${server.address().port}`); }));
  }
  close() { this.server?.close(); }
}

// ---------- canned AI content (only BRIEF facts, so Lane 1's fact check stays clean)
function blog() {
  const para = 'Every piece in The Roshni Edit is handmade in our Jaipur studio by a team of six women artisans. Each design takes two to four days, and you can see the care in every stone and every curve. ';
  const body = [
    '# Handmade Diwali jewellery: meet The Roshni Edit',
    '', `Looking for handmade Diwali jewellery that feels light but looks rich? ${para}`,
    '', '## Handmade Diwali jewellery, inspired by diyas and rangoli', '', para.repeat(3),
    '', '## The pieces', '', 'The Roshni Kundan Jhumkas are ₹2,450. The Diya Meenakari Studs are ₹1,200. The Rangoli Maang Tikka is ₹1,850. ' + para.repeat(2),
    '', '## Gifting this Diwali', '', para.repeat(3),
    '', '## Join the waitlist', '', `Waitlist members get early access and 10% off. ${para}[Join the waitlist](http://localhost:5678/form/kaya-waitlist)`,
  ].join('\n');
  return { target_keyword: 'handmade diwali jewellery', seo_title: 'Handmade Diwali Jewellery: The Roshni Edit', meta_description: 'Handmade Diwali jewellery from our Jaipur studio: meet The Roshni Edit, six festive designs. Join the waitlist for early access today.', slug: 'handmade-diwali-jewellery-roshni-edit', article_markdown: body };
}
const caption = (i) => ({ angle: `Angle ${i}`, hook: `Something is glowing in our Jaipur studio (${i}) ✨`, caption: `Something is glowing in our Jaipur studio (${i}) ✨\nOur artisans are finishing The Roshni Edit, handmade for your Diwali. Light to wear, made to be celebrated. Join the waitlist for early access and 10% off, link in bio.`, hashtags: ['#KayaJewels', '#RoshniEdit', '#HandmadeJewellery', '#DiwaliJewellery', '#Jaipur', '#Kundan', '#FestiveStyle', '#MadeInIndia'], cta: 'Join the waitlist, link in bio.', image_idea: 'Close-up of an artisan setting a kundan stone.' });
const reel = (i) => ({ title: `Studio reel ${i}`, hook: 'Watch a jhumka come to life', shot_list: ['Wide shot of the studio', 'Close-up of hands', 'Stone setting', 'Finished jhumka on a tray'], caption: 'From our Jaipur studio to your Diwali. Every Roshni Edit piece is handmade by our artisans. Join the waitlist for early access, link in bio.', hashtags: ['#KayaJewels', '#RoshniEdit', '#Handmade', '#Diwali', '#Jaipur'], audio_idea: 'Soft festive instrumental', duration_seconds: 30 });
const newsletter = () => ({ subject: 'A first look at The Roshni Edit ✨', preview_text: 'Six handmade Diwali designs from our Jaipur studio, and your early access is reserved.', html_body: '<p>Hi {{first_name}},</p><p>The Roshni Edit is almost here: six handmade designs from our Jaipur studio. The Roshni Kundan Jhumkas are ₹2,450 and the Diya Meenakari Studs are ₹1,200.</p><p>As a waitlist member you get early access and 10% off.</p><p><a href="http://localhost:5678/form/kaya-waitlist">Share the waitlist with a friend</a></p><p>{{unsubscribe_line}}</p>' });
function classify(prompt) {
  const reply = /<<<REPLY\n([\s\S]*?)\nREPLY>>>/.exec(prompt)?.[1] ?? '';
  const t = reply.toLowerCase();
  let reply_class = 'other';
  if (/unsubscribe|\bstop\b/.test(t)) reply_class = 'unsubscribe';
  else if (/not interested|no thanks/.test(t)) reply_class = 'not_interested';
  else if (/later|next season|not now/.test(t)) reply_class = 'not_now';
  else if (/\b(yes|interested|lookbook|price|send)\b/.test(t)) reply_class = 'interested';
  else if (t.includes('?')) reply_class = 'question';
  return { reply_class, confidence: 0.92, summary: `Wants the lookbook: ${reply.replace(/\s+/g, ' ').slice(0, 50)}`, suggested_next_step: 'Send the lookbook and wholesale price list today.' };
}
export { base, addressOf };
