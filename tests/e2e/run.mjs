#!/usr/bin/env node
// End-to-end demo storyline on the ONE canvas (session 5), inside a real n8n 1.123.84 server.
//   N8N_BIN=<n8n binary> node tests/e2e/run.mjs [vm|legacy]
//
// The canvas lanes/marion-marketing-engine.json is turned into a TEST COPY: every trigger becomes a Webhook (so the
// test plays the scheduler), Google Sheets / Gmail / Telegram nodes become HTTP calls to tests/e2e/world.mjs, and
// Gemini / Groq point at the world. Every Code / IF / Switch / Loop / Wait node is the real one from the canvas.
//
// Storyline (DEMO_MODE TRUE, 1 day = 2 minutes):
//   Lane 1 creates content → 4 rows approved → Lane 2 publishes → a lead fills the waitlist form (Lane 3) → Lane 4 sends
//   the nurture sequence → DEMO_LAUNCH_AT arrives (Lane 5) → Lane 6 emails prospects → a prospect replies "interested"
//   through the demo reply form (Lane 7 → hot alert) → Lane 8 report.
// Each virtual minute fires the lanes in their cron order (Lane 2 :00, Lane 4 :15, Lane 5 :30, Lane 6 :45 every 2 min,
// Lane 8 :50 every 5 min, Lane 7 whenever the inbox has new mail), then moves the clock on by one minute.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startN8n, Tester } from '../_shared/harness.mjs';
import { uuid } from '../_shared/build-lib.mjs';
import { World } from './world.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const engine = process.argv[2] === 'legacy' ? 'legacy' : 'vm';
const SENDER = 'kayademo.hello@gmail.com';
const CUSTOMERS = 'kayademo.customers@gmail.com';
const OWNER_CHAT = '111111111';
const CHANNEL = '@kayajewels_demo';
const EVENT_TYPES = ['lane_run', 'content_generated', 'approval_requested', 'ai_call', 'ai_fallback', 'ai_failed', 'content_published', 'publish_failed', 'lead_captured', 'lead_duplicate', 'hot_alert_sent', 'email_sent', 'email_blocked', 'email_failed', 'sequence_completed', 'launch_post_published', 'reply_received', 'reply_unmatched', 'demo_reply_simulated', 'dashboard_updated', 'report_sent', 'error'];

// ---------------------------------------------------------------- test copy of the canvas
const expr = (value) => String(value).replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '');
const slug = (name) => `e2e-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
function testCopy(canvas, worldUrl) {
  const copy = JSON.parse(JSON.stringify(canvas));
  copy.id = 'e2ecanvas';
  copy.name = `TEST COPY · ${canvas.name}`;
  const nodes = [];
  const extra = {};
  const http = (orig, params) => ({
    id: orig.id, name: orig.name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: orig.position,
    parameters: { options: {}, ...params },
    ...Object.fromEntries(['alwaysOutputData', 'executeOnce', 'onError'].filter((k) => orig[k] !== undefined).map((k) => [k, orig[k]])),
    ...(orig.retryOnFail ? { retryOnFail: true, maxTries: orig.maxTries ?? 3, waitBetweenTries: 100 } : {}),
  });
  const post = (url, body) => ({ method: 'POST', url, sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify(${body}) }}` });
  const hook = (orig, path) => ({ id: orig.id, name: orig.name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: orig.position, webhookId: uuid(`e2e:${orig.name}`), parameters: { httpMethod: 'POST', path, responseMode: 'lastNode', options: {} } });
  for (const node of copy.nodes) {
    const p = node.parameters;
    const account = node.credentials?.gmailOAuth2?.name === 'Kaya Demo · Gmail Demo Customers' ? 'customers' : 'sender';
    switch (node.type) {
      case 'n8n-nodes-base.stickyNote': break;
      case 'n8n-nodes-base.manualTrigger':
      case 'n8n-nodes-base.scheduleTrigger': nodes.push(hook(node, slug(node.name))); break;
      case 'n8n-nodes-base.formTrigger':
      case 'n8n-nodes-base.gmailTrigger': {
        const h = hook({ ...node, id: uuid(`e2e:hook:${node.name}`), name: `${node.name} (test webhook)`, position: [node.position[0] - 120, node.position[1] - 60] }, slug(node.name));
        nodes.push(h);
        nodes.push({ id: node.id, name: node.name, type: 'n8n-nodes-base.code', typeVersion: 2, position: node.position, parameters: { jsCode: node.type.endsWith('gmailTrigger') ? 'return ($input.first().json.body.messages || []).map((message) => ({ json: message }));' : 'return [{ json: $input.first().json.body }];' } });
        extra[h.name] = { main: [[{ node: node.name, type: 'main', index: 0 }]] };
        break;
      }
      case 'n8n-nodes-base.googleSheets': {
        const tab = p.sheetName.value;
        nodes.push(http(node, p.operation === 'read' ? { method: 'GET', url: `${worldUrl}/sheet/${tab}` } : post(`${worldUrl}/sheet/${tab}/${p.operation}?node=${encodeURIComponent(node.name)}${p.options?.handlingExtraData === 'ignoreIt' ? '&extra=ignore' : ''}`, '$json')));
        break;
      }
      case 'n8n-nodes-base.gmail': {
        const op = p.operation;
        if (op === 'send') nodes.push(http(node, post(`${worldUrl}/gmail/send`, `{ account: '${account}', to: ${expr(p.sendTo)}, subject: ${expr(p.subject)}, html: ${expr(p.message)}, sender_name: ${expr(p.options.senderName)} }`)));
        else if (op === 'reply') nodes.push(http(node, post(`${worldUrl}/gmail/reply`, `{ account: '${account}', message_id: ${expr(p.messageId)}, html: ${expr(p.message)}, reply_to_sender_only: ${p.options?.replyToSenderOnly === true} }`)));
        else if (op === 'getAll') nodes.push(http(node, post(`${worldUrl}/gmail/getall`, `{ account: '${account}', q: ${expr(p.filters.q)} }`)));
        else if (op === 'markAsRead') nodes.push(http(node, post(`${worldUrl}/gmail/markread`, `{ message_id: ${expr(p.messageId)} }`)));
        else throw new Error(`no stub for Gmail ${op}`);
        break;
      }
      case 'n8n-nodes-base.telegram': nodes.push(http(node, post(`${worldUrl}/telegram/send`, `{ chat_id: ${expr(p.chatId)}, text: ${expr(p.text)} }`))); break;
      case 'n8n-nodes-base.httpRequest': {
        const gemini = String(p.url).includes('generativelanguage');
        const stub = { ...node, parameters: { ...p, authentication: 'none', url: gemini ? `=${worldUrl}/gemini/{{ $json.gemini_model }}:generateContent` : `${worldUrl}/groq/chat/completions` }, waitBetweenTries: 100 };
        delete stub.parameters.nodeCredentialType; delete stub.credentials;
        nodes.push(stub);
        break;
      }
      default: { const kept = { ...node }; delete kept.credentials; nodes.push(kept); }
    }
  }
  copy.nodes = nodes;
  copy.connections = { ...copy.connections, ...extra };
  return copy;
}

// ---------------------------------------------------------------- start everything
const world = new World({ sender: SENDER, customers: CUSTOMERS });
const worldUrl = await world.listen();
const canvas = JSON.parse(readFileSync(path.join(repo, 'lanes', 'marion-marketing-engine.json'), 'utf8'));
const n8n = await startN8n({ engine, label: 'e2e', workflows: [testCopy(canvas, worldUrl)] });
const T = new Tester(`E2E storyline [${engine}]`);
const timeline = [];
let minute = 0;
const say = (text) => { timeline.push(`| ${minute} | ${text} |`); console.log(`  [min ${minute}] ${text}`); };
const ist = (ms) => `${new Date(ms + 5.5 * 3600000).toISOString().slice(0, 19)}+05:30`;
async function fire(trigger, body = {}) {
  const r = await n8n.fire(slug(trigger), body);
  if (r.status !== 200) { T.check(false, `${trigger} run failed at minute ${minute}: ${JSON.stringify(r.body).slice(0, 300)}`); }
  return r;
}
const sentSince = (n) => world.allSent().slice(n);
const tgSince = (n) => world.telegram.slice(n);
// One virtual minute. The lanes start on their real cron offsets (scaled down 3×: Lane 2 at 0 s, Lane 4 at 5 s, Lane 5 at
// 10 s, Lane 6 at 15 s, Lane 8 at 17 s) WITHOUT waiting for each other, with the real per-email pause (SEND_DELAY_SECONDS
// 2 here, also scaled), so their runs overlap exactly like on the PC. Lane 7 polls the inbox at the end of the minute.
const OFFSETS = { 'Lane 2 · Every minute': 0, 'Lane 4 · Every minute': 5000, 'Lane 5 · Every minute': 10000, 'Lane 6 · Every 2 minutes': 15000, 'Lane 8 · Every 5 minutes': 17000 };
const later = (ms, fn) => new Promise((resolve) => setTimeout(() => resolve(fn()), ms));
async function tick() {
  const before = { sent: world.allSent().length, tg: world.telegram.length, ev: world.events().length };
  const runs = Object.entries(OFFSETS)
    .filter(([trigger]) => (trigger.startsWith('Lane 6') ? minute % 2 === 0 : trigger.startsWith('Lane 8') ? minute % 5 === 0 : true))
    .map(([trigger, ms]) => later(ms, () => fire(trigger)));
  await Promise.all(runs);
  const mail = world.inboxPoll();
  if (mail.length) await fire('Lane 7 · New email in sender inbox', { messages: mail });
  const sent = sentSince(before.sent);
  const tg = tgSince(before.tg);
  const kinds = {};
  for (const e of world.events().slice(before.ev)) kinds[e.event_type] = (kinds[e.event_type] || 0) + 1;
  say(`${sent.length} email(s)${sent.length ? ` (${[...new Set(sent.map((m) => m.subject.slice(0, 40)))].join(' · ')})` : ''}, ${tg.length} Telegram (${tg.map((t) => (t.chat_id === CHANNEL ? 'channel' : 'owner')).join(', ') || '-'}), ${mail.length} inbox mail(s); events: ${Object.entries(kinds).map(([k, v]) => `${k}×${v}`).join(', ') || '-'}`);
  world.advance(1);
  minute++;
}

// ---------------------------------------------------------------- the storyline
const LAUNCH_IN = 6;    // minutes: SPEC 7.5 done-when (DEMO_LAUNCH_AT = now + 6 min), so launch, newsletter and nurture overlap
try {
  await T.scenario('0 · fresh sheet from sheets-template/, SETTINGS for the demo', async () => {
    world.reset();
    for (const [k, v] of Object.entries({ SENDER_EMAIL: SENDER, ALLOWED_DEMO_INBOXES: CUSTOMERS, TELEGRAM_OWNER_CHAT_ID: OWNER_CHAT, TELEGRAM_CHANNEL_ID: CHANNEL, SEND_DELAY_SECONDS: 2, AI_WAIT_SECONDS: 1, DEMO_MODE: 'TRUE', DEMO_MINUTES_PER_DAY: 2, DEMO_LAUNCH_AT: ist(Date.now() + LAUNCH_IN * 60000) })) world.setting(k, v);
    T.eq(world.rows('LEADS').length, 15, 'LEADS starts with the 15 sample leads');
    T.eq(world.rows('PROSPECTS').length, 12, 'PROSPECTS starts with the 12 sample prospects');
  });

  await T.scenario('1 · Lane 1 creates content (13 rows pending_approval + Telegram approval list)', async () => {
    await fire('Lane 1 · Start');
    const rows = world.rows('CONTENT').filter((r) => r.status === 'pending_approval');
    T.eq(rows.length, 13, '13 new CONTENT rows waiting for approval');
    T.eq([...new Set(rows.map((r) => r.asset_type))].sort(), ['blog_article', 'ig_caption', 'newsletter', 'reel_idea', 'short_post'], 'every asset type is there');
    T.check(rows.every((r) => /^CNT-\d{8}-\d{6}-\d\d$/.test(r.content_id) && r.scheduled_for && r.ai_provider === 'gemini'), 'ids, posting times and ai_provider filled');
    T.check(world.telegram.some((t) => t.chat_id === OWNER_CHAT && t.text.includes('Content ready for approval: 13 items')), 'approval list sent to the owner');
    T.eq([world.events('content_generated').length, world.events('ai_call').length, world.events('approval_requested').length, world.events('lane_run').length], [13, 5, 1, 1], 'events: content_generated ×13, ai_call ×5, approval_requested, lane_run');
    say('Lane 1 generated 13 items; approval list on Telegram');
  });

  let approved = [];
  await T.scenario('2 · the owner approves the first 4 rows in the sheet', async () => {
    approved = world.rows('CONTENT').filter((r) => r.status === 'pending_approval').sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)).slice(0, 4);
    for (const r of approved) r.status = 'approved';
    T.check(approved.some((r) => r.asset_type === 'newsletter'), `the newsletter is among them (${approved.map((r) => r.asset_type).join(', ')})`);
    say(`approved: ${approved.map((r) => `${r.asset_type} (due ${r.scheduled_for.slice(11, 16)})`).join(', ')}`);
  });

  const you = 'kayademo.customers+you1@gmail.com';
  await T.scenario('3 · a lead fills the waitlist form (Lane 3): scored hot, saved as new, owner alerted, no email yet', async () => {
    const before = world.allSent().length;
    await fire('Lane 3 · Waitlist form', { 'First name': 'Riya', Email: 'KayaDemo.Customers+you1@gmail.com', City: 'Jaipur', 'Instagram handle': 'riya.styles', 'WhatsApp number': '+91 00000 00099', "I'm shopping for": 'A full festive set', 'My budget': 'Above ₹5,000', Occasion: 'My Diwali outfit', 'Email consent': 'Yes, email me about early access and offers' });
    const lead = world.rows('LEADS').find((r) => r.email === you);
    T.check(!!lead && lead.status === 'new' && lead.score === '100' && lead.segment === 'hot' && lead.seq_step === '0' && lead.next_action_at !== '', `lead row: ${JSON.stringify(lead && { status: lead.status, score: lead.score, segment: lead.segment })}`);
    T.check(world.telegram.some((t) => t.chat_id === OWNER_CHAT && t.text.includes('New hot lead: Riya')), 'hot-lead alert to the owner');
    T.eq(world.allSent().length, before, 'Lane 3 sends no email');
    say('Riya joined the waitlist (score 100, hot)');
  });

  let replyAt = null;
  await T.scenario(`4 · ${LAUNCH_IN + 12} demo minutes of the schedule: publishing, nurture, outreach, a prospect reply, the launch, the report`, async () => {
    for (let i = 0; i < LAUNCH_IN + 12; i++) {
      await tick();
      // As soon as Lane 6 has emailed Saanjh Boutique (PR-B01), the prospect "replies" through the demo form (Lane 7).
      if (!replyAt && world.emailsTo('kayademo.customers+boutique1@gmail.com').length) {
        await fire('Lane 7 · Demo reply form', { 'Reply to email sent to': 'kayademo.customers+boutique1@gmail.com', 'Reply type': 'Interested' });
        replyAt = world.vnow();
        say('demo reply form: Saanjh Boutique answers "Interested" (in the Demo Customers inbox)');
      }
    }
    T.check(true, 'schedule ran');
  });

  await T.scenario('5 · Lane 2 published the approved content (channel posts, newsletter by email) exactly once', async () => {
    for (const r of approved) {
      const row = world.row('CONTENT', r.content_id);
      T.eq(row.status, 'published', `${r.asset_type} ${r.content_id} is published`);
    }
    const posts = world.events('content_published').filter((e) => e.channel === 'telegram_channel');
    T.eq(posts.length, approved.filter((r) => ['ig_caption', 'short_post', 'blog_article'].includes(r.asset_type)).length, 'one channel post per approved caption / short post / blog');
    const news = approved.find((r) => r.asset_type === 'newsletter');
    const got = world.rows('LEADS').filter((l) => l.last_newsletter_id === news.content_id);
    T.check(got.some((l) => l.email === you), 'Riya received the newsletter');
    T.eq(world.row('CONTENT', news.content_id).publish_ref, `newsletter:${got.length} sent`, 'publish_ref counts the newsletter emails');
    const approvedIds = new Set(approved.map((r) => r.content_id));
    T.check(world.rows('CONTENT').filter((r) => r.batch_id === approved[0].batch_id && !approvedIds.has(r.content_id)).every((r) => r.status === 'pending_approval'), 'rows nobody approved stay pending_approval (never published)');
  });

  await T.scenario('6 · Lane 4 nurtured Riya: the welcome first (after the sample-data backlog, 3 per minute), then the next steps on the demo clock, never twice', async () => {
    const nurture = world.events('email_sent').filter((e) => e.lane === '4' && world.row('LEADS', e.entity_id)?.email === you).map((e) => JSON.parse(e.meta_json).step);
    T.check(nurture[0] === 1 && new Set(nurture).size === nurture.length && nurture.length >= 3, `nurture steps sent to Riya: ${nurture.join(', ')}`);
    const first = world.emailsTo(you)[0];
    T.check(first && first.subject.startsWith("You're on the list, Riya"), `first email is the welcome: ${first?.subject}`);
  });

  await T.scenario('7 · Lane 5 launched at DEMO_LAUNCH_AT: countdown + launch posts, the early-access email with the code to every active lead', async () => {
    const posts = world.events('launch_post_published').map((e) => e.entity_id);
    T.check(posts.includes('LAUNCH_BROADCAST#3') && posts.includes('LAUNCH_BROADCAST#5'), `launch posts: ${posts.join(', ')}`);
    T.check(world.telegram.filter((t) => t.chat_id === CHANNEL).every((t) => !t.text.includes('ROSHNI10')), 'the discount code never appears in the public channel');
    const launchMail = world.emailsTo(you).filter((m) => m.html.includes('ROSHNI10'));
    T.check(launchMail.length >= 1, 'Riya got the early-access email with ROSHNI10');
    const active = world.rows('LEADS').filter((l) => ['new', 'nurturing', 'nurture_done', 'replied', 'hot'].includes(l.status) && l.consent === 'TRUE' && l.email_allowed !== 'FALSE');
    T.check(active.every((l) => Number(l.launch_step) >= 2), `every active lead has launch_step ≥ 2 (${active.map((l) => `${l.email.split('+')[1]?.split('@')[0]}:${l.launch_step}`).join(' ')})`);
    for (const l of world.rows('LEADS').filter((r) => ['unsubscribed', 'blocked'].includes(r.status))) T.eq(world.emailsTo(l.email).length, 0, `${l.status} lead ${l.lead_id} got no email at all`);
  });

  await T.scenario('8 · Lane 6 emailed the prospects (3 per run, highest fit first) with an AI opener', async () => {
    const first = world.events('email_sent').filter((e) => e.lane === '6' && JSON.parse(e.meta_json).step === 1).map((e) => e.entity_id);
    T.eq(first.slice(0, 3), ['PR-B04', 'PR-I01', 'PR-I04'], 'first run: the three highest fit_score prospects (90, 88, 86)');
    T.eq(first.length, 12, 'all 12 prospects got their first email');
    T.check(world.ai.filter((a) => a.kind === 'opener').length === 12, '12 AI openers requested');
  });

  await T.scenario('9 · the reply: in the SAME thread, from the bare demo address → Lane 7 → interested + 🔥 HOT alert → Lane 6 stops', async () => {
    const reply = world.mail.sender.find((m) => m.from === CUSTOMERS && m.labels.includes('INBOX'));
    const original = world.emailsTo('kayademo.customers+boutique1@gmail.com')[0];
    T.check(!!reply, 'the reply arrived in the Kaya Jewels inbox');
    T.eq(reply?.from, CUSTOMERS, 'it comes FROM the bare demo address (matches no single row by address)');
    const asSent = world.mail.customers.find((m) => m.labels.includes('SENT') && m.inReplyTo === original?.messageIdHeader);
    T.eq(asSent?.to, [SENDER], 'Reply to Sender Only: the reply as sent is addressed to the sender only (not back to the plus-address)');
    T.eq(reply?.threadId, original?.threadId, 'Gmail threaded it into the outreach email\'s thread');
    const pr = world.row('PROSPECTS', 'PR-B01');
    T.eq([pr.status, pr.reply_class, pr.next_action_at], ['interested', 'interested', ''], 'PR-B01: interested, follow-ups cleared');
    const rec = world.events('reply_received').find((e) => e.entity_id === 'PR-B01');
    T.check(rec && JSON.parse(rec.meta_json).matched_by === 'thread' && rec.status_to === 'interested', 'reply_received, matched by thread id');
    T.check(world.events('demo_reply_simulated').some((e) => e.entity_id === 'PR-B01'), 'demo_reply_simulated logged');
    T.check(world.telegram.some((t) => t.chat_id === OWNER_CHAT && t.text.startsWith('🔥 HOT: Saanjh Boutique replied:')), 'hot alert to the owner');
    T.check(world.events('hot_alert_sent').some((e) => e.entity_id === 'PR-B01'), 'hot_alert_sent logged');
    T.eq(reply?.labels.includes('UNREAD'), false, 'the reply was marked read');
    T.eq(world.emailsTo('kayademo.customers+boutique1@gmail.com').filter((m) => m.at > replyAt).length, 0, 'Lane 6 never emailed Saanjh Boutique after the reply');
    T.eq(world.events('reply_unmatched').length, 0, 'no unmatched replies');
  });

  await T.scenario('10 · Lane 8 report: DASHBOARD numbers match the sheet, Telegram report sent', async () => {
    // One more report run 10 demo minutes later, with nothing else happening, so the dashboard covers everything above.
    world.advance(10); minute += 10;
    await fire('Lane 8 · Every 5 minutes');
    const reports = world.telegram.filter((t) => t.chat_id === OWNER_CHAT && t.text.includes('campaign report'));
    T.check(reports.length >= 2, `${reports.length} reports sent (one at minute 0, more every 10 demo minutes)`);
    const dash = Object.fromEntries(world.rows('DASHBOARD').map((r) => [r.metric_key, r.value]));
    const ev = world.events();
    const count = (type, lane) => ev.filter((e) => e.event_type === type && (!lane || e.lane === String(lane))).length + world.rows('EVENTS_LOG').filter((e) => e.execution_id === 'sample' && e.event_type === type && (!lane || e.lane === String(lane))).length;
    T.eq(Number(dash.emails_sent_total), count('email_sent'), 'emails_sent_total = email_sent events');
    T.eq(Number(dash.launch_emails_sent), count('email_sent', 5), 'launch_emails_sent = Lane 5 email_sent events');
    T.eq(Number(dash.hot_alerts_total), count('hot_alert_sent'), 'hot_alerts_total = hot_alert_sent events');
    T.eq(Number(dash.leads_total), world.rows('LEADS').length, 'leads_total = rows in LEADS');
    T.eq(Number(dash.prospects_interested), world.rows('PROSPECTS').filter((p) => ['interested', 'won'].includes(p.status)).length, 'prospects_interested');
    T.eq(Number(dash.content_published), world.rows('CONTENT').filter((r) => r.status === 'published').length, 'content_published');
    T.check(world.events('report_sent').length >= 2 && world.events('dashboard_updated').length >= 2, 'report_sent + dashboard_updated logged');
    say(`Lane 8 report: ${dash.emails_sent_total} emails, ${dash.leads_total} leads, ${dash.prospects_interested} interested prospect(s), reply rate ${dash.outreach_reply_rate_pct}%`);
  });

  await T.scenario('11 · cross-lane invariants over the whole run', async () => {
    T.eq(world.violations, [], 'every sheet write touched only the writing lane\'s own columns (SPEC 2.x), no unknown columns');
    const sent = world.allSent();
    T.check(sent.every((m) => m.to.every((t) => t.startsWith('kayademo.customers+'))), 'every email went to a demo plus-address (safety gate)');
    // MIN_EMAIL_GAP_DAYS = 0.5 day = 60 s on the demo clock, across ALL lanes.
    const gap = 60000;
    const tooClose = [];
    const byAddress = {};
    for (const m of sent) for (const t of m.to) (byAddress[t] ||= []).push(m);
    for (const [address, list] of Object.entries(byAddress)) {
      list.sort((a, b) => a.at - b.at);
      for (let i = 1; i < list.length; i++) if (list[i].at - list[i - 1].at < gap) tooClose.push(`${address}: "${list[i - 1].subject}" then "${list[i].subject}" ${Math.round((list[i].at - list[i - 1].at) / 1000)} s apart`);
    }
    T.eq(tooClose, [], 'nobody got two automated emails inside MIN_EMAIL_GAP_DAYS (Lanes 2, 4, 5 and 6 together)');
    const steps = world.events('email_sent').map((e) => `${e.entity_id}|${JSON.parse(e.meta_json).sequence_id ?? JSON.parse(e.meta_json).content_id}|${JSON.parse(e.meta_json).step ?? ''}`);
    T.eq(steps.length - new Set(steps).size, 0, 'no step / newsletter was sent twice to the same person');
    T.eq(world.events().filter((e) => !EVENT_TYPES.includes(e.event_type)).map((e) => e.event_type), [], 'every event_type is in the SPEC 5.6 list');
    T.eq(world.events('error').map((e) => `${e.lane}: ${e.detail}`), [], 'no error events');
    T.eq(world.events('email_failed').length + world.events('publish_failed').length, 0, 'no failed sends');
    const hot = world.rows('LEADS').filter((l) => ['hot', 'replied', 'unsubscribed'].includes(l.status));
    T.check(hot.every((l) => !world.events('email_sent').some((e) => e.lane === '4' && e.entity_id === l.lead_id)), 'Lane 4 never nurtured a lead Lane 7 had moved to hot / replied / unsubscribed');
    const executions = await n8n.executions();
    T.eq(executions.filter((x) => x.status !== 'success').map((x) => `${x.id} ${x.status} ${x.error?.node}: ${x.error?.message}`), [], `all ${executions.length} n8n executions succeeded`);
  });
} finally {
  const failed = T.summary();
  const checks = T.results.flatMap((r) => r.checks);
  const md = [`### Engine: \`${engine}\` — ${checks.length - checks.filter((c) => !c.ok).length}/${checks.length} checks passed`, '',
    ...T.results.map((r) => `- ${r.checks.every((c) => c.ok) ? '✔' : '✖'} **${r.name}** (${r.checks.filter((c) => c.ok).length}/${r.checks.length})${r.checks.filter((c) => !c.ok).map((c) => `\n    - ✖ ${c.what}`).join('')}`),
    '', '<details><summary>Timeline (virtual minutes)</summary>', '', '| min | what happened |', '|---|---|', ...timeline, '', '</details>', ''].join('\n');
  writeFileSync(path.join(here, `results-${engine}.md`), md);
  await n8n.stop();
  world.close();
  process.exit(failed ? 1 : 0);
}
