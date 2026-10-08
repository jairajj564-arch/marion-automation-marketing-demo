// Lane 5 end-to-end tests inside a real n8n server. Usage: node tests/lane-5/run.mjs [vm|legacy]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Mock } from '../lib/mock.mjs';
import { makeTestCopy } from '../lib/testcopy.mjs';
import { startN8n } from '../lib/n8n.mjs';
import { Suite } from '../lib/runner.mjs';
import { ist } from '../lib/helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const engine = process.argv[2] || 'vm';
const mock = new Mock(); const port = await mock.listen();
const wf = makeTestCopy(join(here, '..', '..', 'lanes', 'lane-5-launch-engine.json'), { mockPort: port, webhookPath: 'run-lane5' });
const n8n = await startN8n({ workflows: [wf], engine, log: console.log });
const T = new Suite('Lane 5');

const blank = { lead_id: '', created_at: '', source: 'manual', first_name: 'Asha', email: '', phone: '', city: 'Delhi', instagram_handle: '', interest: 'earrings', budget: '1500_3000', occasion: 'diwali_outfit', consent: 'TRUE', email_allowed: 'TRUE', score: '50', segment: 'warm', score_reason: '', status: 'nurturing', sequence_id: 'WAITLIST_NURTURE', seq_step: '2', next_action_at: '', last_contacted_at: ist(-600), launch_step: '0', last_newsletter_id: '', thread_ids: '', last_reply_at: '', reply_class: '', notes: '', updated_at: '' };
let counter = 0;
const lead = (o = {}) => { counter++; const n = String(counter).padStart(2, '0'); return { ...blank, lead_id: `LD-T-${n}`, email: `kayademo.customers+t${n}@gmail.com`, first_name: `Lead${n}`, ...o }; };
const fresh = (leads = [], settings = {}) => {
  mock.reset(); counter = 0;
  mock.tabs.LEADS = leads;
  mock.setting('SEND_DELAY_SECONDS', 1);
  mock.setting('DEMO_LAUNCH_AT', ist(6));
  for (const [k, v] of Object.entries(settings)) mock.setting(k, v);
};
const run = () => n8n.run('run-lane5');
const L = (id) => mock.find('LEADS', id);
const S = (key) => mock.find('SEQUENCES', key);
const evs = (t) => mock.events(t);
const done = () => mock.rows('SEQUENCES').filter((r) => r.channel === 'telegram_channel').map((r) => `${r.step}:${r.broadcast_done_at ? 'done' : '-'}`).join(' ');
const eight = () => Array.from({ length: 8 }, () => lead());

try {
await T.scenario('Demo timeline: 2-days post at ~2 min, early-access email + post at launch (3 leads per run), reminder at T0+2, public post at T0+4', async () => {
  fresh(eight());
  let r = await run();
  T.eq('T-6 min: nothing is due, quiet end', [mock.posts.length, mock.sent.length, evs().length], [0, 0, 0]);
  mock.shiftTime(2.2); r = await run();
  T.eq('T-3.8: the "2 days to go" post appears (step 1)', mock.posts.length, 1);
  T.eq('posted to the channel', mock.posts[0].chat_id, '@kayajewels_demo');
  T.check('text rendered', /2 days to go/.test(mock.posts[0].text) && /The Roshni Edit/.test(mock.posts[0].text) && /Monday, 26 October/.test(mock.posts[0].text) && /10%/.test(mock.posts[0].text), mock.posts[0].text);
  T.check('no placeholder left, no code in public post', !/\{\{/.test(mock.posts[0].text) && !/ROSHNI10/.test(mock.posts[0].text));
  T.eq('no email yet', mock.sent.length, 0);
  T.eq('step 1 marked done', done(), '1:done 3:- 5:-');
  T.eq('launch_post_published logged with step_key + message_id', evs('launch_post_published').map((e) => [e.entity_id, Boolean(JSON.parse(e.meta_json).message_id), e.lane]), [['LAUNCH_BROADCAST#1', true, '5']]);
  await run();
  T.eq('run again: no second post', mock.posts.length, 1);
  mock.shiftTime(4); r = await run();   // now T0 + 0.2
  T.eq('launch: channel post #3 + 3 emails in the first run', [mock.posts.length, mock.sent.length], [2, 3]);
  T.check('post #3 text', /Early access to The Roshni Edit is live/.test(mock.posts[1].text) && /Wednesday, 28 October/.test(mock.posts[1].text), mock.posts[1].text);
  T.check('email has the code and percent and dates', /ROSHNI10/.test(mock.sent[0].html) && /10% off/.test(mock.sent[0].html) && /Wednesday, 28 October/.test(mock.sent[0].html), mock.sent[0].html);
  T.eq('email subject', mock.sent[0].subject, 'Early access is open: your 10% code is inside');
  T.check('no placeholder left in the email', !/\{\{/.test(mock.sent[0].html));
  T.eq('3 leads have launch_step 2', mock.rows('LEADS').filter((x) => x.launch_step === '2').length, 3);
  T.check('last_contacted_at + thread_ids written', mock.rows('LEADS').filter((x) => x.launch_step === '2').every((x) => x.thread_ids.startsWith('T') && x.last_contacted_at > blank.last_contacted_at));
  T.eq('steps done', done(), '1:done 3:done 5:-');
  await run(); T.eq('next run: 3 more leads', mock.sent.length, 6);
  await run(); T.eq('next run: the last 2 leads', mock.sent.length, 8);
  await run(); T.eq('after that nothing more', [mock.sent.length, mock.posts.length], [8, 2]);
  T.eq('every lead emailed exactly once', new Set(mock.sent.map((m) => m.to)).size, 8);
  mock.shiftTime(2); r = await run();   // T0 + 2.2 : step 4 (+1 day) is due
  T.eq('T0+2: reminder emails start (3 per run)', mock.sent.length, 11);
  T.check('reminder subject', mock.sent[8].subject === 'Early access ends Wednesday, 28 October', mock.sent[8].subject);
  T.eq('no new channel post yet', mock.posts.length, 2);
  await run(); await run(); T.eq('all 8 leads have the reminder', [mock.sent.length, mock.rows('LEADS').filter((x) => x.launch_step === '4').length], [16, 8]);
  mock.shiftTime(2); await run();   // T0 + 4.2 : step 5
  T.eq('T0+4: public-launch post', mock.posts.length, 3);
  T.check('public post text', /now open to everyone/.test(mock.posts[2].text) && /₹1,200 to ₹6,500/.test(mock.posts[2].text), mock.posts[2].text);
  T.eq('all channel steps done', done(), '1:done 3:done 5:done');
  const before = [mock.sent.length, mock.posts.length, evs().length];
  await run(); await run(); mock.shiftTime(100); await run();
  T.eq('re-run after a finished launch: nothing sent, posted or logged', [mock.sent.length, mock.posts.length, evs().length], before);
  T.eq('totals: 16 launch emails, 3 launch posts', [evs('email_sent').length, evs('launch_post_published').length], [16, 3]);
  T.check('email_sent meta carries sequence_id LAUNCH_BROADCAST and step', evs('email_sent').every((e) => { const m = JSON.parse(e.meta_json); return m.sequence_id === 'LAUNCH_BROADCAST' && (m.step === 2 || m.step === 4) && m.thread_id; }));
});

await T.scenario('A lead who missed the early-access email only gets the latest due step (reminder)', async () => {
  fresh([lead({ lead_id: 'LD-LATE' })], { DEMO_LAUNCH_AT: ist(-2.5) });   // T0 was 2.5 min ago -> steps up to #4 due
  await run();
  T.eq('exactly one email', mock.sent.length, 1);
  T.eq('it is the reminder (step 4), not the early-access mail', mock.sent[0].subject, 'Early access ends Wednesday, 28 October');
  T.eq('launch_step 4', L('LD-LATE').launch_step, '4');
  T.eq('stale channel steps: only the latest due one is posted', [mock.posts.length, done()], [1, '1:done 3:done 5:-']);
  T.check('the post is step 3 (latest due), not the older teaser', /Early access to The Roshni Edit is live/.test(mock.posts[0].text), mock.posts[0].text);
  await run(); T.eq('no repeat', [mock.sent.length, mock.posts.length], [1, 1]);
});

await T.scenario('Demo mode with blank DEMO_LAUNCH_AT ends quietly', async () => {
  fresh(eight(), { DEMO_LAUNCH_AT: '' });
  const r = await run();
  T.eq('run finishes OK', r.status, 200);
  T.eq('nothing posted, sent or logged', [mock.posts.length, mock.sent.length, evs().length], [0, 0, 0]);
});

await T.scenario('Real mode: LAUNCH_DATE in the future -> nothing due', async () => {
  const d = new Date(Date.now() + 10 * 86400000 + 330 * 60000).toISOString().slice(0, 10);
  fresh(eight(), { DEMO_MODE: 'FALSE', LAUNCH_DATE: d });
  await run();
  T.eq('nothing posted, sent or logged', [mock.posts.length, mock.sent.length, evs().length], [0, 0, 0]);
});

await T.scenario('Real mode: LAUNCH_DATE in the past -> stale posts skipped, only the latest posted, one launch email (latest step)', async () => {
  const d = new Date(Date.now() - 3 * 86400000 + 330 * 60000).toISOString().slice(0, 10);
  fresh(eight().slice(0, 2).map((x) => ({ ...x, last_contacted_at: ist(-3000) })), { DEMO_MODE: 'FALSE', LAUNCH_DATE: d });   // last mail > 12 h ago (real gap)
  await run();
  T.eq('one channel post: step 5 (public launch)', [mock.posts.length, /now open to everyone/.test(mock.posts[0]?.text || '')], [1, true]);
  T.eq('older channel steps marked done without posting', done(), '1:done 3:done 5:done');
  T.eq('two leads got ONE email each: the latest due email step (4)', [mock.sent.length, mock.sent.every((m) => /Early access ends/.test(m.subject))], [2, true]);
  T.eq('launch_step 4', mock.rows('LEADS').map((x) => x.launch_step), ['4', '4']);
  T.eq('logged: one post event, two emails', [evs('launch_post_published').length, evs('email_sent').length], [1, 2]);
  await run(); T.eq('re-run: nothing more', [mock.posts.length, mock.sent.length], [1, 2]);
});

await T.scenario('Real mode with an invalid LAUNCH_DATE logs an error and does nothing else', async () => {
  fresh(eight().slice(0, 2), { DEMO_MODE: 'FALSE', LAUNCH_DATE: 'soon' });
  await run();
  T.eq('nothing posted or sent', [mock.posts.length, mock.sent.length], [0, 0]);
  T.check('an error is logged', evs('error').length === 1 && /LAUNCH_DATE/.test(evs('error')[0].detail), evs('error')[0]?.detail);
});

await T.scenario('Unsubscribed, blocked, customer, consent-FALSE and email_allowed-FALSE leads are skipped', async () => {
  fresh([
    lead({ lead_id: 'LD-UNS', status: 'unsubscribed' }), lead({ lead_id: 'LD-BLK', status: 'blocked' }), lead({ lead_id: 'LD-CUS', status: 'customer' }),
    lead({ lead_id: 'LD-NOC', consent: 'FALSE' }), lead({ lead_id: 'LD-NOA', email_allowed: 'FALSE' }),
    lead({ lead_id: 'LD-HOT', status: 'hot' }), lead({ lead_id: 'LD-REP', status: 'replied' }), lead({ lead_id: 'LD-NEW', status: 'new' }), lead({ lead_id: 'LD-DONE', status: 'nurture_done' }),
  ], { DEMO_LAUNCH_AT: ist(-0.5) });
  mock.setting('MAX_SENDS_PER_RUN', 10);
  await run();
  T.eq('only the four active leads (new, nurturing-done, replied, hot) are emailed', mock.rows('LEADS').filter((x) => x.launch_step === '2').map((x) => x.lead_id).sort(), ['LD-DONE', 'LD-HOT', 'LD-NEW', 'LD-REP']);
  T.eq('the others untouched', ['LD-UNS', 'LD-BLK', 'LD-CUS', 'LD-NOC', 'LD-NOA'].map((id) => L(id).launch_step), ['0', '0', '0', '0', '0']);
});

await T.scenario('Lead in the MIN_EMAIL_GAP_DAYS window waits, then gets the email', async () => {
  fresh([lead({ lead_id: 'LD-GAP', last_contacted_at: ist(-0.3) })], { DEMO_LAUNCH_AT: ist(-0.5) });
  await run();
  T.eq('not emailed inside the gap', mock.sent.length, 0);
  mock.shiftTime(1.2); await run();
  T.eq('emailed after the gap', mock.sent.length, 1);
});

await T.scenario('A non-allowed address that slipped through is stopped by the safety gate', async () => {
  fresh([lead({ lead_id: 'LD-BAD', email: 'someone@example.com' }), lead({ lead_id: 'LD-OK' })], { DEMO_LAUNCH_AT: ist(-0.5) });
  await run();
  T.eq('only the allowed lead is emailed', mock.sent.map((m) => m.to), [L('LD-OK').email]);
  T.eq('bad lead blocked', [L('LD-BAD').status, L('LD-BAD').email_allowed, L('LD-BAD').launch_step], ['blocked', 'FALSE', '0']);
  T.eq('email_blocked logged', evs('email_blocked').map((e) => e.entity_id), ['LD-BAD']);
  await run(); T.eq('never retried', mock.sent.length, 1);
});

await T.scenario('Telegram failing: broadcast_done_at stays blank, error logged, emails still go out, next run retries the post', async () => {
  fresh([lead({ lead_id: 'LD-TG' })], { DEMO_LAUNCH_AT: ist(-0.5) });
  mock.failNext('telegram', 3);          // the node retries 3 times in one run
  await run();
  T.eq('no post delivered', mock.posts.length, 0);
  T.eq('step 3 NOT marked done', done(), '1:- 3:- 5:-');
  T.check('error event for the post', evs('error').length === 1 && /LAUNCH_BROADCAST#3/.test(evs('error')[0].entity_id), JSON.stringify(evs('error').map((e) => e.entity_id)));
  T.eq('the email part of the run still happened', mock.sent.length, 1);
  await run();
  T.eq('next run posts it (latest due = step 3; step 1 becomes stale)', [mock.posts.length, done()], [1, '1:done 3:done 5:-']);
  T.eq('lead not emailed twice', mock.sent.length, 1);
});

await T.scenario('Gmail failing: email_failed logged, launch_step not advanced, lead retried on the next run; others unaffected', async () => {
  fresh([lead({ lead_id: 'LD-G1' }), lead({ lead_id: 'LD-G2' })], { DEMO_LAUNCH_AT: ist(-0.5) });
  mock.failNext('gmail', 1);
  await run();
  T.eq('one delivered, one failed', [mock.sent.length, evs('email_failed').length], [1, 1]);
  T.eq('launch_step: failed lead still 0', [L('LD-G1').launch_step, L('LD-G2').launch_step], ['0', '2']);
  await run();
  T.eq('retried: both done, exactly one email each', [mock.sent.length, new Set(mock.sent.map((m) => m.to)).size], [2, 2]);
});

await T.scenario('Missing BRIEF offer_code: no launch email is sent (code can never be guessed), channel post unaffected', async () => {
  fresh([lead({ lead_id: 'LD-NC' })], { DEMO_LAUNCH_AT: ist(-0.5) });
  mock.tabs.BRIEF = mock.tabs.BRIEF.filter((r) => r.key !== 'offer_code');
  await run();
  T.eq('no email', mock.sent.length, 0);
  T.check('error names offer_code', evs('error').some((e) => /offer_code/.test(e.detail)), JSON.stringify(evs('error').map((e) => e.detail)));
  T.eq('lead untouched', L('LD-NC').launch_step, '0');
  T.eq('the channel post still went out', mock.posts.length, 1);
});

await T.scenario('A channel template that contains {{offer_code}} is never posted (the code stays private)', async () => {
  fresh([], { DEMO_LAUNCH_AT: ist(-0.5) });
  S('LAUNCH_BROADCAST#3').body_template += ' code {{offer_code}}';
  await run();
  T.eq('nothing posted', mock.posts.length, 0);
  T.check('error logged', evs('error').some((e) => /offer_code/.test(e.detail)), JSON.stringify(evs('error').map((e) => e.detail)));
  T.eq('step stays undone', done(), '1:- 3:- 5:-');
});

await T.scenario('Rows with missing/invalid fields are skipped and logged; other rows still processed', async () => {
  fresh([lead({ lead_id: '', email: 'kayademo.customers+noid@gmail.com' }), lead({ lead_id: 'LD-NOMAIL', email: '' }), lead({ lead_id: 'LD-BADSTEP', launch_step: 'x' }), lead({ lead_id: 'LD-NONAME', first_name: '' }), lead({ lead_id: 'LD-FINE' })], { DEMO_LAUNCH_AT: ist(-0.5) });
  S('LAUNCH_BROADCAST#5').delay_days = 'two';
  mock.setting('MAX_SENDS_PER_RUN', 10);
  const r = await run();
  T.eq('run finished', r.status, 200);
  T.eq('fine lead emailed', mock.sent.map((m) => m.to), [L('LD-FINE').email]);
  const details = evs('error').map((e) => e.detail).join(' | ');
  T.check('errors name the problems', /lead_id/.test(details) && /email/.test(details) && /launch_step/.test(details) && /first_name/.test(details) && /LAUNCH_BROADCAST#5/.test(details), details);
  T.eq('channel post still published', mock.posts.length, 1);
});

await T.scenario('Sheets returning numbers/booleans instead of text still works', async () => {
  fresh([lead({ lead_id: 'LD-TY' })], { DEMO_LAUNCH_AT: ist(-0.5) });
  mock.typed = true;
  await run();
  T.eq('email sent and post published', [mock.sent.length, mock.posts.length], [1, 1]);
  mock.typed = false;
});

await T.scenario('A node failing mid-run (EVENTS_LOG append) does not cause a repeat post or email', async () => {
  fresh([lead({ lead_id: 'LD-M1' }), lead({ lead_id: 'LD-M2' })], { DEMO_LAUNCH_AT: ist(-0.5) });
  mock.failNext('sheets:EVENTS_LOG:append', 3);
  const r = await run();
  T.check('run reports an error', r.status === 500, `status ${r.status}`);
  T.eq('the post was marked done before the failure', done(), '1:- 3:done 5:-'.replace('1:-', '1:done'));
  const afterFirst = [mock.posts.length, mock.sent.length];
  await run(); await run();
  T.eq('no second post; each lead exactly once', [mock.posts.length, mock.sent.length, new Set(mock.sent.map((m) => m.to)).size], [1, 2, 2]);
  T.check('first run had made progress', afterFirst[0] === 1);
});

await T.scenario('A read failing (LEADS) stops the run before anything is sent; the next run recovers', async () => {
  fresh([lead({ lead_id: 'LD-R' })], { DEMO_LAUNCH_AT: ist(-0.5) });
  mock.failNext('sheets:LEADS:read', 3);
  const r = await run();
  T.check('run reports an error', r.status === 500, `status ${r.status}`);
  T.eq('nothing posted or sent', [mock.posts.length, mock.sent.length], [0, 0]);
  await run();
  T.eq('recovered', [mock.posts.length, mock.sent.length], [1, 1]);
});

await T.scenario('SETTINGS missing TELEGRAM_CHANNEL_ID: clear error, nothing happens', async () => {
  fresh([lead()], { DEMO_LAUNCH_AT: ist(-0.5) });
  mock.tabs.SETTINGS = mock.tabs.SETTINGS.filter((r) => r.key !== 'TELEGRAM_CHANNEL_ID');
  const r = await run();
  T.check('run errors', r.status === 500, `status ${r.status}`);
  T.eq('nothing posted or sent', [mock.posts.length, mock.sent.length], [0, 0]);
  T.check('stored error names the key', /missing a value for: TELEGRAM_CHANNEL_ID/.test(await n8n.lastExecutionText()));
});

await T.scenario('Run budget: a launch run with one channel post + 3 emails stays under 45 s with the real 6 s pause', async () => {
  fresh(eight().slice(0, 4), { DEMO_LAUNCH_AT: ist(-0.5), SEND_DELAY_SECONDS: 6 });
  const r = await run();
  T.eq('1 post + 3 emails', [mock.posts.length, mock.sent.length], [1, 3]);
  T.check(`run took ${Math.round(r.ms / 1000)} s (< 45 s)`, r.ms < 45000, `${r.ms} ms`);
});

await T.scenario('Two runs back to back never double-post or double-send', async () => {
  fresh(eight().slice(0, 4), { DEMO_LAUNCH_AT: ist(-0.5) });
  await run(); await run();
  T.eq('1 post, 4 emails (3 + 1), each lead once', [mock.posts.length, mock.sent.length, new Set(mock.sent.map((m) => m.to)).size], [1, 4, 4]);
  await run(); await run();
  T.eq('still the same', [mock.posts.length, mock.sent.length], [1, 4]);
});
} finally {
  const md = T.markdown(engine);
  writeFileSync(join(here, `results-${engine}.md`), md + '\n');
  console.log(`\n${md}`);
  await n8n.stop(); await mock.close();
}
process.exit(T.failed ? 1 : 0);
