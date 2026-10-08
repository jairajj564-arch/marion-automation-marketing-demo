// Lane 3 end-to-end test inside a real n8n 1.123.84 server.
//   KAYA_SCRATCH=<scratch folder with n8n installed> node tests/lane-3/run.mjs [vm|legacy] [--keep-real-trigger]
// The REAL Form Trigger is kept (forms are submitted over HTTP exactly like a browser). Only Google Sheets and
// Telegram are replaced by HTTP Request nodes that talk to the local mock (tests/common/mock-server.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { Mock } from '../common/mock-server.mjs';
import { toTestCopy, N8n, Results } from '../common/harness.mjs';

const engine = process.argv[2] === 'legacy' ? 'legacy' : 'vm';
const lane = JSON.parse(readFileSync(new URL('../../lanes/lane-3-lead-engine.json', import.meta.url), 'utf8'));
const mock = await new Mock().start();
const n8n = new N8n({ engine, label: 'lane3' });
const results = new Results(`Lane 3 (${engine} expression engine)`);
const id = n8n.importWorkflow(toTestCopy(lane, { mockUrl: mock.url, name: 'Lane 3 test copy' }));
n8n.activate(id);
await n8n.start();

// ---------- helpers
const DROP = {
  interest: { Earrings: 'earrings', Necklaces: 'necklaces', 'Maang tikka': 'maang_tikka', Bangles: 'bangles', Gifting: 'gifting', 'A full festive set': 'full_set' },
  budget: { 'Under ₹1,500': 'under_1500', '₹1,500–₹3,000': '1500_3000', '₹3,000–₹5,000': '3000_5000', 'Above ₹5,000': 'above_5000' },
  occasion: { 'My Diwali outfit': 'diwali_outfit', Gifting: 'gifting', 'Wedding season': 'wedding_season', 'Treating myself': 'self_treat', 'Just browsing': 'just_browsing' },
};
const CONSENT_YES = 'Yes, email me about early access and offers';
const base = { first: 'Meera', email: 'kayademo.customers+test1@gmail.com', city: 'Jaipur', ig: '', phone: '', interest: 'Earrings', budget: 'Under ₹1,500', occasion: 'Just browsing', consent: CONSENT_YES };

async function submit(overrides = {}, quietMs = 1500) {
  const f = { ...base, ...overrides };
  const form = new FormData();
  [f.first, f.email, f.city, f.ig, f.phone, f.interest, f.budget, f.occasion, f.consent].forEach((v, i) => form.append(`field-${i}`, v));
  const before = mock.requests.length;
  const res = await fetch(`${n8n.base}/form/kaya-waitlist`, { method: 'POST', body: form });
  const text = await res.text();
  await mock.waitActivity(before);          // the workflow has really started...
  await mock.idle(quietMs);                 // ...and then goes quiet = it has finished (longer when node retries are expected)
  return { status: res.status, text };
}
function fresh(settingsOverrides = {}, leads = []) {
  mock.reset(); mock.settings(settingsOverrides); mock.setRows('LEADS', leads);
}
// independent re-implementation of the scoring table, to compare against the lane
function expectedScore(f) {
  const budget = { 'above_5000': 30, '3000_5000': 25, '1500_3000': 15, under_1500: 5 }[DROP.budget[f.budget]];
  const occasion = { diwali_outfit: 25, gifting: 20, wedding_season: 20, self_treat: 15, just_browsing: 0 }[DROP.occasion[f.occasion]];
  const interest = { full_set: 15, necklaces: 12, earrings: 10, bangles: 10, gifting: 10, maang_tikka: 8 }[DROP.interest[f.interest]];
  return Math.min(100, budget + occasion + interest + (f.ig ? 10 : 0) + (f.phone ? 10 : 0) + (f.consent === CONSENT_YES ? 10 : 0));
}
const leads = () => mock.rows('LEADS');
const events = (type) => mock.rows('EVENTS_LOG').filter((e) => !type || e.event_type === type);
const LEAD_COLUMNS = mock.tabs.LEADS.header;
const isStamp = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/.test(String(v));
const recent = (v) => Math.abs(Date.now() - new Date(String(v)).getTime()) < 60000;
const noViolations = () => results.check(mock.violations.length === 0, `Sheets rules respected (no unknown columns written): ${mock.violations.join(' | ') || 'none'}`);

try {
  // ------------------------------------------------------------------ 1
  results.begin('Done-when 1: kayademo.customers+test1@gmail.com creates one new row');
  fresh();
  let r = await submit();
  const page = await (await fetch(`${n8n.base}/form/kaya-waitlist`)).text();
  results.check(r.status === 200, `the form accepts the submission (HTTP ${r.status})`);
  results.check(/Join the Roshni Edit waitlist/.test(page) && /Early access \+ 10% off for waitlist members\. Handmade in Jaipur by Kaya Jewels\./.test(page) && /on the list! Check your inbox soon for early-access details\./.test(page), 'form page shows the title, the description and the friendly completion message');
  results.check(!/Form automated with n8n/i.test(page), 'no "automated with n8n" attribution on the form');
  results.check(leads().length === 1, `exactly one LEADS row (found ${leads().length})`);
  let row = leads()[0] ?? {};
  results.check(row.status === 'new' && row.email_allowed === 'TRUE', `status new, email_allowed TRUE (${row.status}/${row.email_allowed})`);
  results.check(/^LD-\d{8}-[A-Z0-9]{4}$/.test(row.lead_id), `lead_id format LD-yyyyMMdd-XXXX (${row.lead_id})`);
  results.check(row.source === 'waitlist_form' && row.sequence_id === 'WAITLIST_NURTURE' && String(row.seq_step) === '0' && String(row.launch_step) === '0', 'source, sequence_id, seq_step 0, launch_step 0');
  results.check(isStamp(row.created_at) && isStamp(row.updated_at) && isStamp(row.next_action_at) && recent(row.next_action_at), `timestamps in IST format, next_action_at = now (${row.next_action_at})`);
  results.check(['last_contacted_at', 'last_newsletter_id', 'thread_ids', 'last_reply_at', 'reply_class', 'notes'].every((c) => row[c] === ''), 'other tracking columns blank');
  results.check(JSON.stringify(Object.keys(row)) === JSON.stringify(LEAD_COLUMNS), 'row has every LEADS column of SPEC 2.4');
  results.check(mock.sent.length === 0, 'no email sent by Lane 3');
  results.check(events('lead_captured').length === 1 && events().length === 1, `one lead_captured event and nothing else (${events().map((e) => e.event_type)})`);
  noViolations();

  // ------------------------------------------------------------------ 2
  results.begin('Hot, warm and cold leads (scores and segments)');
  fresh();
  const hot = { first: 'Hina <b>&', email: 'kayademo.customers+hot@gmail.com', city: 'Mumbai & Pune', ig: 'hina.styles', phone: '+91 90000 00001', interest: 'A full festive set', budget: 'Above ₹5,000', occasion: 'My Diwali outfit' };
  const warm = { first: 'Warm', email: 'kayademo.customers+warm@gmail.com', city: 'Delhi', interest: 'Earrings', budget: '₹3,000–₹5,000', occasion: 'Gifting' };
  const cold = { first: 'Cold', email: 'kayademo.customers+cold@gmail.com', city: 'Goa', interest: 'Maang tikka', budget: 'Under ₹1,500', occasion: 'Just browsing', consent: 'No thanks' };
  for (const f of [hot, warm, cold]) await submit(f);
  const by = (e) => leads().find((x) => x.email === e) ?? {};
  const H = by(hot.email), W = by(warm.email), C = by(cold.email);
  results.check(leads().length === 3, `three rows (${leads().length})`);
  results.check(Number(H.score) === 100 && H.segment === 'hot' && H.score_reason === 'budget above_5000 +30; occasion diwali_outfit +25; interest full_set +15; instagram +10; phone +10; consent +10', `hot: score 100, reason string (${H.score} ${H.segment} | ${H.score_reason})`);
  results.check(Number(W.score) === expectedScore({ ...base, ...warm }) && W.segment === 'warm' && W.score_reason === 'budget 3000_5000 +25; occasion gifting +20; interest earrings +10; consent +10', `warm: score 65 (${W.score} ${W.segment} | ${W.score_reason})`);
  results.check(Number(C.score) === 13 && C.segment === 'cold' && C.score_reason === 'budget under_1500 +5; occasion just_browsing +0; interest maang_tikka +8', `cold: score 13 (${C.score} ${C.segment} | ${C.score_reason})`);
  results.check(H.instagram_handle === '@hina.styles' && H.phone === '+91 90000 00001' && H.first_name === hot.first && H.city === hot.city, 'text fields stored as typed (special characters kept as text)');
  const alerts = mock.messages;
  results.check(alerts.length === 1 && String(alerts[0].chat_id) === '555000111', `exactly one Telegram message, to the owner chat (${alerts.length})`);
  results.check(alerts[0]?.text === '🔥 New hot lead: Hina &lt;b&gt;&amp; (Mumbai &amp; Pune), score 100', `alert text HTML-escaped: ${alerts[0]?.text}`);
  results.check(events('hot_alert_sent').length === 1 && events('hot_alert_sent')[0].entity_id === H.lead_id && events('hot_alert_sent')[0].channel === 'telegram_owner', 'one hot_alert_sent event for the hot lead');
  results.check(events('lead_captured').length === 3 && events('lead_captured').every((e) => JSON.parse(e.meta_json).segment && 'score' in JSON.parse(e.meta_json)), 'three lead_captured events with score + segment in meta_json');
  results.check(C.consent === 'FALSE' && C.next_action_at === '' && C.status === 'new' && C.email_allowed === 'TRUE', `consent "No thanks": saved, consent FALSE, next_action_at blank, status new (${C.consent}/${C.next_action_at}/${C.status})`);
  noViolations();

  // ------------------------------------------------------------------ 3
  results.begin('Every dropdown option maps to its stored value; scores match the SPEC table');
  fresh();
  const interests = Object.keys(DROP.interest), budgets = Object.keys(DROP.budget), occasions = Object.keys(DROP.occasion);
  const sent = [];
  for (let i = 0; i < 6; i++) {
    const f = { first: `Map${i}`, email: `kayademo.customers+map${i}@gmail.com`, interest: interests[i % 6], budget: budgets[i % 4], occasion: occasions[i % 5], ig: i % 2 ? 'x' : '', phone: i % 3 ? '123' : '', consent: i === 5 ? 'No thanks' : CONSENT_YES };
    sent.push(f); await submit(f);
  }
  results.check(leads().length === 6, `six rows (${leads().length})`);
  for (const f of sent) {
    const l = by(f.email);
    results.check(l.interest === DROP.interest[f.interest] && l.budget === DROP.budget[f.budget] && l.occasion === DROP.occasion[f.occasion] && Number(l.score) === expectedScore({ ...base, ...f }), `${f.interest} / ${f.budget} / ${f.occasion} → ${l.interest} ${l.budget} ${l.occasion}, score ${l.score}`);
  }
  results.check(new Set(leads().map((l) => l.interest)).size === 6 && new Set(leads().map((l) => l.budget)).size === 4 && new Set(leads().map((l) => l.occasion)).size === 5, 'all 6 interests, 4 budgets and 5 occasions were exercised');
  noViolations();

  // ------------------------------------------------------------------ 4
  results.begin('Done-when 3: same email twice (different letter case) creates one row');
  fresh();
  await submit({ email: 'kayademo.customers+dup1@gmail.com' });
  const firstId = leads()[0]?.lead_id;
  await submit({ email: 'KayaDemo.Customers+DUP1@Gmail.com', first: 'Second try' });
  await submit({ email: ' kayademo.customers+dup1@gmail.com ' });
  results.check(leads().length === 1 && leads()[0].first_name === 'Meera', `still one row, the original (${leads().length} row, name ${leads()[0]?.first_name})`);
  results.check(events('lead_duplicate').length === 2 && events('lead_duplicate').every((e) => e.entity_id === firstId && JSON.parse(e.meta_json).email === 'kayademo.customers+dup1@gmail.com'), 'two lead_duplicate events pointing at the original lead, lower-cased email in meta');
  results.check(events('lead_captured').length === 1, 'only one lead_captured');
  results.check(mock.writes.filter((w) => w.tab === 'LEADS').length === 1, 'LEADS written exactly once');

  // ------------------------------------------------------------------ 5
  results.begin('Done-when 2: someone@example.com is saved as blocked');
  fresh();
  await submit({ email: 'someone@example.com', budget: 'Above ₹5,000', occasion: 'My Diwali outfit', interest: 'A full festive set', ig: 'a', phone: '1' });
  row = leads()[0] ?? {};
  results.check(leads().length === 1 && row.status === 'blocked' && row.email_allowed === 'FALSE', `one row, blocked, email_allowed FALSE (${row.status}/${row.email_allowed})`);
  results.check(row.next_action_at === '' && String(row.seq_step) === '0', 'next_action_at blank (never emailed)');
  results.check(events('lead_captured').length === 1 && events('email_blocked').length === 1 && JSON.parse(events('email_blocked')[0].meta_json).reason.includes('ALLOWED_DEMO_INBOXES'), 'lead_captured + email_blocked (with reason) logged');
  results.check(events('email_blocked')[0].status_to === 'blocked' && events('email_blocked')[0].entity_id === row.lead_id, 'email_blocked points at the new lead');
  results.check(mock.messages.length === 1 && events('hot_alert_sent').length === 1, 'a hot lead still pings the owner on Telegram (blocked only affects email)');
  results.check(mock.sent.length === 0, 'nothing emailed');

  // ------------------------------------------------------------------ 6
  results.begin('Plus-address of the demo inbox is allowed; other addresses are blocked');
  fresh();
  const addrs = ['kayademo.customers+anything.123@gmail.com', 'kayademo.customers@gmail.com', 'random.person@gmail.com', 'kayademo.customers+x@yahoo.com'];
  for (const email of addrs) await submit({ email });
  results.check(['TRUE', 'TRUE', 'FALSE', 'FALSE'].join() === addrs.map((e) => by(e).email_allowed).join(), `email_allowed per address: ${addrs.map((e) => `${e.split('@')[0].slice(-8)}@${e.split('@')[1]}=${by(e).email_allowed}`).join(', ')}`);
  results.check(['new', 'new', 'blocked', 'blocked'].join() === addrs.map((e) => by(e).status).join(), 'statuses new/new/blocked/blocked');

  // ------------------------------------------------------------------ 7
  results.begin('Instagram handle gets an @');
  fresh();
  await submit({ email: 'kayademo.customers+ig1@gmail.com', ig: 'meera.jewels' });
  await submit({ email: 'kayademo.customers+ig2@gmail.com', ig: '@@  meera .jewels ' });
  await submit({ email: 'kayademo.customers+ig3@gmail.com', ig: '   ' });
  results.check(by('kayademo.customers+ig1@gmail.com').instagram_handle === '@meera.jewels', `"meera.jewels" → ${by('kayademo.customers+ig1@gmail.com').instagram_handle}`);
  results.check(by('kayademo.customers+ig2@gmail.com').instagram_handle === '@meera.jewels', `"@@  meera .jewels " → ${by('kayademo.customers+ig2@gmail.com').instagram_handle}`);
  results.check(by('kayademo.customers+ig3@gmail.com').instagram_handle === '' && !by('kayademo.customers+ig3@gmail.com').score_reason.includes('instagram'), 'blank handle stays blank and earns no points');

  // ------------------------------------------------------------------ 8
  results.begin('Invalid or missing values are rejected and logged (no row)');
  fresh();
  await submit({ email: 'not-an-email' });
  await submit({ email: '' });
  await submit({ city: '   ' });
  await submit({ first: '' , email: 'kayademo.customers+nofirst@gmail.com' });
  await submit({ email: 'a@b@c.com' });
  results.check(leads().length === 0, `no LEADS row (${leads().length})`);
  results.check(events('error').length === 5, `five error events (${events('error').length})`);
  results.check(events('error').every((e) => e.channel === 'form' && JSON.parse(e.meta_json).node === 'Lane 3 · Validate and normalise'), 'error events name the node');
  const details = events('error').map((e) => e.detail);
  results.check(details[0].includes('Email "not-an-email" is not a valid address') && details[1].includes('Email is missing') && details[2].includes('City is missing') && details[3].includes('First name is missing'), `details name the field: ${details.slice(0, 4).join(' || ')}`);
  results.check(mock.messages.length === 0 && events().length === 5, 'nothing else logged, no Telegram');

  // ------------------------------------------------------------------ 9
  results.begin('Empty LEADS tab (the Sheets read returns nothing)');
  fresh();
  mock.setRows('LEADS', []);
  await submit({ email: 'kayademo.customers+first@gmail.com' });
  results.check(leads().length === 1 && leads()[0].status === 'new', 'first-ever lead is saved');
  results.check(mock.requests.filter((q) => q === 'GET /sheets/LEADS').length === 1, 'LEADS read once');

  // ------------------------------------------------------------------ 10
  results.begin('Telegram failing: the lead is still saved and logged');
  fresh();
  mock.fail.telegram = () => true;
  await submit({ email: 'kayademo.customers+tgfail@gmail.com', budget: 'Above ₹5,000', occasion: 'My Diwali outfit', interest: 'A full festive set', ig: 'a', phone: '1' });
  results.check(leads().length === 1 && leads()[0].segment === 'hot', 'hot lead saved');
  results.check(events('lead_captured').length === 1, 'lead_captured logged');
  results.check(events('hot_alert_sent').length === 0 && events('error').length === 1 && JSON.parse(events('error')[0].meta_json).node === 'Lane 3 · Alert owner on Telegram', `no hot_alert_sent; one error event naming the Telegram node (${events('error')[0]?.detail})`);

  // ------------------------------------------------------------------ 11
  results.begin('Node failing mid-run: LEADS append fails twice, the node retries and succeeds (no double row)');
  fresh();
  let failures = 0;
  mock.fail.sheetsWrite = (tab, op) => tab === 'LEADS' && op === 'append' && failures++ < 2;
  await mock.idle(100);
  await submit({ email: 'kayademo.customers+retry@gmail.com' }, 5000);
  results.check(leads().length === 1 && events('lead_captured').length === 1, `one row, one lead_captured after ${failures} failed attempts`);

  results.begin('Node failing mid-run: LEADS read is down for good (nothing half-written)');
  fresh();
  mock.fail.sheetsRead = (tab) => tab === 'LEADS';
  await submit({ email: 'kayademo.customers+down@gmail.com' }, 5000);
  results.check(n8n.executions().at(-1)?.status === 'error', `the execution is marked as failed in n8n (${n8n.executions().at(-1)?.status})`);
  results.check(leads().length === 0 && events().length === 0 && mock.messages.length === 0, 'no row, no event, no Telegram (the run stopped with an error in n8n Executions)');
  mock.fail.sheetsRead = () => false;

  // ------------------------------------------------------------------ 12
  results.begin('SETTINGS missing a key: clear error, nothing written');
  fresh({ HOT_LEAD_SCORE: undefined });
  await submit({ email: 'kayademo.customers+nosettings@gmail.com' });
  results.check(leads().length === 0 && events().length === 0, 'nothing written when HOT_LEAD_SCORE is missing');
  const last = n8n.executions().at(-1);
  results.check(last?.status === 'error' && /missing a value for: HOT_LEAD_SCORE/.test(last.data), `the execution fails with a message naming the missing key (${last?.status})`);
  noViolations();

  // ------------------------------------------------------------------ 13
  results.begin('Custom thresholds come from SETTINGS');
  fresh({ HOT_LEAD_SCORE: 20, WARM_LEAD_SCORE: 10 });
  await submit({ email: 'kayademo.customers+thr@gmail.com' });      // base: 5 + 0 + 10 + 10 = 25
  results.check(leads()[0]?.segment === 'hot' && Number(leads()[0].score) === 25, `score 25 with HOT_LEAD_SCORE 20 → ${leads()[0]?.segment}`);
} catch (error) {
  results.check(false, `test run crashed: ${error.stack}`);
} finally {
  await n8n.stop();
  await mock.stop();
}
writeFileSync(new URL(`./results-${engine}.json`, import.meta.url), JSON.stringify(results.items, null, 2));
console.log(`\n${results.summary()}`);
process.exit(results.failed.length ? 1 : 0);
