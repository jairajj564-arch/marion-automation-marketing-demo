// Lane 4 end-to-end tests inside a real n8n server. Usage: node tests/lane-4/run.mjs [vm|legacy]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Mock } from '../lib/mock.mjs';
import { makeTestCopy } from '../lib/testcopy.mjs';
import { startN8n } from '../lib/n8n.mjs';
import { Suite } from '../lib/runner.mjs';
import { ist, minutesBetween } from '../lib/helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const engine = process.argv[2] || 'vm';
const mock = new Mock(); const port = await mock.listen();
const wf = makeTestCopy(join(here, '..', '..', 'lanes', 'lane-4-sequence-sender.json'), { mockPort: port, webhookPath: 'run-lane4' });
const n8n = await startN8n({ workflows: [wf], engine, log: console.log });
const suite = new Suite('Lane 4');
const T = suite;

const blank = { lead_id: '', created_at: '', source: 'manual', first_name: 'Asha', email: '', phone: '', city: 'Delhi', instagram_handle: '', interest: 'earrings', budget: '1500_3000', occasion: 'diwali_outfit', consent: 'TRUE', email_allowed: 'TRUE', score: '50', segment: 'warm', score_reason: '', status: 'new', sequence_id: 'WAITLIST_NURTURE', seq_step: '0', next_action_at: '', last_contacted_at: '', launch_step: '0', last_newsletter_id: '', thread_ids: '', last_reply_at: '', reply_class: '', notes: '', updated_at: '' };
let counter = 0;
const lead = (o = {}) => { counter++; const n = String(counter).padStart(2, '0'); return { ...blank, lead_id: `LD-T-${n}`, email: `kayademo.customers+t${n}@gmail.com`, next_action_at: ist(-1), ...o }; };
const fresh = (leads = [], settings = {}) => {
  mock.reset(); counter = 0;
  mock.tabs.LEADS = leads;
  mock.setting('SEND_DELAY_SECONDS', 1);
  for (const [k, v] of Object.entries(settings)) mock.setting(k, v);
};
const run = async () => { const r = await n8n.run('run-lane4'); return r; };
const L = (id) => mock.find('LEADS', id);
const evs = (t) => mock.events(t);

try {
await T.scenario('Full sequence under DEMO_MODE: welcome within a run, then steps 2-4 at 2, 4 and 4 demo-minutes (never twice)', async () => {
  fresh([lead({ lead_id: 'LD-SEQ', first_name: 'Meera', email: 'kayademo.customers+seq@gmail.com' })]);
  let r = await run();
  T.eq('run 1 finished OK', r.status, 200);
  T.eq('step 1 sent', mock.sent.length, 1);
  T.eq('recipient is the lead (via safe_to)', mock.sent[0].to, 'kayademo.customers+seq@gmail.com');
  T.check('subject rendered', mock.sent[0].subject === "You're on the list, Meera ✨", mock.sent[0].subject);
  T.check('no placeholder left in HTML', !/\{\{/.test(mock.sent[0].html), mock.sent[0].html.slice(0, 200));
  T.check('HTML has dates, offer, collection', /Monday, 26 October/.test(mock.sent[0].html) && /Wednesday, 28 October/.test(mock.sent[0].html) && /10% off/.test(mock.sent[0].html) && /The Roshni Edit/.test(mock.sent[0].html));
  T.check('code ROSHNI10 is not revealed by Lane 4', !/ROSHNI10/.test(mock.sent[0].html));
  let l = L('LD-SEQ');
  T.eq('seq_step 1, status nurturing', [l.seq_step, l.status], ['1', 'nurturing']);
  T.eq('thread id stored', l.thread_ids, 'T0001');
  T.check('last_contacted_at set', Boolean(l.last_contacted_at));
  T.check('next_action_at = now + 2 min (1 day scaled)', Math.abs(minutesBetween(l.last_contacted_at, l.next_action_at) - 2) < 0.05, `${l.last_contacted_at} -> ${l.next_action_at}`);
  T.eq('email_sent logged with meta', evs('email_sent').map((e) => JSON.parse(e.meta_json)), [{ sequence_id: 'WAITLIST_NURTURE', step: 1, thread_id: 'T0001' }]);
  T.eq('status_from/to on the event', [evs('email_sent')[0].status_from, evs('email_sent')[0].status_to], ['new', 'nurturing']);
  r = await run();
  T.eq('run 2 right away sends nothing', mock.sent.length, 1);
  T.eq('run 2 logs nothing new', evs().length, 1);
  mock.shiftTime(2.2); r = await run();
  T.eq('after 2.2 min: step 2 sent', mock.sent.length, 2);
  T.check('step 2 subject', /Meet the hands behind The Roshni Edit/.test(mock.sent[1].subject), mock.sent[1].subject);
  l = L('LD-SEQ');
  T.eq('seq_step 2', l.seq_step, '2');
  T.check('next in 4 min', Math.abs(minutesBetween(l.last_contacted_at, l.next_action_at) - 4) < 0.05);
  T.eq('thread ids appended', l.thread_ids, 'T0001,T0002');
  mock.shiftTime(4.2); await run();
  T.eq('after 4 more min: step 3 sent', mock.sent.length, 3);
  T.check('step 3 subject', /3 Roshni pieces/.test(mock.sent[2].subject));
  T.check('step 3 prices intact', /₹2,450/.test(mock.sent[2].html) && /₹1,200/.test(mock.sent[2].html) && /₹3,900/.test(mock.sent[2].html));
  l = L('LD-SEQ'); T.check('next in 4 min', Math.abs(minutesBetween(l.last_contacted_at, l.next_action_at) - 4) < 0.05);
  mock.shiftTime(4.2); await run();
  T.eq('after 4 more min: step 4 sent', mock.sent.length, 4);
  l = L('LD-SEQ');
  T.eq('last step: nurture_done, next_action_at blank, seq_step 4', [l.status, l.next_action_at, l.seq_step], ['nurture_done', '', '4']);
  T.eq('sequence_completed logged once', evs('sequence_completed').length, 1);
  mock.shiftTime(30); await run();
  T.eq('nothing more is ever sent', mock.sent.length, 4);
  T.eq('only the four sent emails + one completion logged', evs().length, 5);
  T.eq('thread ids kept', L('LD-SEQ').thread_ids, 'T0001,T0002,T0003,T0004');
});

await T.scenario('Lead stops mid-sequence when Lane 7 changes the status (replied / hot / unsubscribed) and for other non-nurture statuses', async () => {
  const ids = {};
  const mk = (status) => { const x = lead({ status, seq_step: '1', next_action_at: ist(-5) }); ids[status] = x.lead_id; return x; };
  fresh(['replied', 'hot', 'unsubscribed', 'customer', 'nurture_done', 'blocked'].map(mk));
  await run();
  T.eq('nobody is emailed', mock.sent.length, 0);
  T.eq('nothing logged (quiet end)', evs().length, 0);
  T.eq('rows unchanged', mock.rows('LEADS').map((x) => x.seq_step), ['1', '1', '1', '1', '1', '1']);
  // live flip: a nurturing lead replies between two runs
  fresh([lead({ lead_id: 'LD-FLIP' })]);
  await run(); T.eq('step 1 went out', mock.sent.length, 1);
  L('LD-FLIP').status = 'replied'; L('LD-FLIP').next_action_at = '';
  mock.shiftTime(10); await run();
  T.eq('after the reply no further email', mock.sent.length, 1);
  L('LD-FLIP').status = 'nurturing'; L('LD-FLIP').next_action_at = ist(-1);
  L('LD-FLIP').status = 'unsubscribed'; await run();
  T.eq('unsubscribed also stops', mock.sent.length, 1);
});

await T.scenario('consent FALSE, email_allowed FALSE and status blocked are never emailed', async () => {
  fresh([lead({ consent: 'FALSE' }), lead({ email_allowed: 'FALSE' }), lead({ status: 'blocked' }), lead({ consent: 'false' })]);
  await run();
  T.eq('no email', mock.sent.length, 0);
  T.eq('no log row', evs().length, 0);
});

await T.scenario('A non-allowed address that slipped into LEADS is stopped by the safety gate', async () => {
  fresh([lead({ lead_id: 'LD-BAD', email: 'someone@example.com' }), lead({ lead_id: 'LD-OK' })]);
  await run();
  T.eq('only the allowed lead was emailed', mock.sent.map((m) => m.to), [L('LD-OK').email]);
  const bad = L('LD-BAD');
  T.eq('bad lead: status blocked, email_allowed FALSE, no next action', [bad.status, bad.email_allowed, bad.next_action_at], ['blocked', 'FALSE', '']);
  T.eq('seq_step untouched', bad.seq_step, '0');
  const ev = evs('email_blocked');
  T.eq('email_blocked logged with reason', [ev.length, JSON.parse(ev[0].meta_json).reason], [1, 'not in ALLOWED_DEMO_INBOXES or ALLOWED_EMAIL_DOMAINS']);
  await run();
  T.eq('blocked lead is never retried', mock.sent.length, 1);
});

await T.scenario('Gmail failing: email_failed logged, seq_step NOT advanced, retried later', async () => {
  fresh([lead({ lead_id: 'LD-FAIL' })]);
  mock.failNext('gmail', 1);
  const r = await run();
  T.eq('run finishes', r.status, 200);
  const l = L('LD-FAIL');
  T.eq('nothing delivered', mock.sent.length, 0);
  T.eq('seq_step and status unchanged', [l.seq_step, l.status, l.last_contacted_at], ['0', 'new', '']);
  T.check('rescheduled about 0.2 demo-minutes (0.1 day) ahead', Math.abs(minutesBetween(ist(0), l.next_action_at) - 0.2) < 0.15, l.next_action_at);
  const ev = evs('email_failed');
  T.eq('email_failed logged once', ev.length, 1);
  T.check('error text in meta', JSON.parse(ev[0].meta_json).error.length > 0 && JSON.parse(ev[0].meta_json).step === 1);
  await run();
  T.eq('not retried before the new next_action_at', mock.sent.length, 0);
  mock.shiftTime(1); await run();
  T.eq('retried after the delay: step 1 now sent', mock.sent.length, 1);
  T.eq('seq_step 1', L('LD-FAIL').seq_step, '1');
});

await T.scenario('Lead inside the MIN_EMAIL_GAP_DAYS window waits (e.g. just got a newsletter)', async () => {
  fresh([lead({ lead_id: 'LD-GAP', last_contacted_at: ist(-0.2) })]);
  await run();
  T.eq('not emailed inside the gap (0.5 day = 1 min)', mock.sent.length, 0);
  T.eq('quiet', evs().length, 0);
  mock.shiftTime(1.1); await run();
  T.eq('emailed once the gap has passed', mock.sent.length, 1);
});

await T.scenario('More due leads than MAX_SENDS_PER_RUN: oldest first, 3 per run, run stays inside the 45 s budget (real 6 s pause)', async () => {
  const leads = [5, 1, 7, 3, 2, 6, 4].map((m) => lead({ lead_id: `LD-Q${m}`, next_action_at: ist(-m * 10) }));
  fresh(leads, { SEND_DELAY_SECONDS: 6 });
  let r = await run();
  T.eq('run 1 sent exactly 3', mock.sent.length, 3);
  T.eq('the three OLDEST due', mock.rows('LEADS').filter((x) => x.seq_step === '1').map((x) => x.lead_id).sort(), ['LD-Q5', 'LD-Q6', 'LD-Q7']);
  T.check(`run took ${Math.round(r.ms / 1000)} s (< 45 s)`, r.ms < 45000);
  r = await run();
  T.eq('run 2 sent 3 more', mock.sent.length, 6);
  r = await run();
  T.eq('run 3 sent the last one', mock.sent.length, 7);
  T.eq('every lead got exactly one email', new Set(mock.sent.map((m) => m.to)).size, 7);
});

await T.scenario('Missing template placeholder / empty first_name: no send, error logged, row untouched, other leads still go out', async () => {
  fresh([lead({ lead_id: 'LD-NONAME', first_name: '' }), lead({ lead_id: 'LD-GOOD' })]);
  await run();
  T.eq('only the good lead emailed', mock.sent.length, 1);
  const err = evs('error');
  T.eq('one error', err.length, 1);
  T.check('error names first_name', /first_name/.test(err[0].detail), err[0].detail);
  T.eq('error entity is the lead', err[0].entity_id, 'LD-NONAME');
  T.eq('bad row unchanged', [L('LD-NONAME').seq_step, L('LD-NONAME').status, L('LD-NONAME').updated_at], ['0', 'new', '']);
  // unknown placeholder inside the template itself
  fresh([lead({ lead_id: 'LD-X' })]);
  mock.find('SEQUENCES', 'WAITLIST_NURTURE#1').body_template += '<p>{{surprise_token}}</p>';
  await run();
  T.eq('nothing sent for a broken template', mock.sent.length, 0);
  T.check('error names the token', /surprise_token/.test(evs('error')[0].detail), evs('error')[0]?.detail);
  // a placeholder whose BRIEF value is gone
  fresh([lead({ lead_id: 'LD-Y' })]);
  mock.tabs.BRIEF = mock.tabs.BRIEF.filter((r) => r.key !== 'founder_name' && r.key !== 'collection_name');
  await run();
  T.eq('no send when a BRIEF value is missing', mock.sent.length, 0);
  T.check('error names collection_name', /collection_name/.test(evs('error')[0]?.detail || ''), evs('error')[0]?.detail);
});

await T.scenario('Rows with missing/invalid fields are skipped and logged without crashing the run', async () => {
  fresh([
    lead({ lead_id: '', email: 'kayademo.customers+noid@gmail.com' }),
    lead({ lead_id: 'LD-NOMAIL', email: '' }),
    lead({ lead_id: 'LD-BADSTEP', seq_step: 'abc' }),
    lead({ lead_id: 'LD-BADTIME', next_action_at: 'whenever' }),
    lead({ lead_id: 'LD-FINE' }),
  ]);
  const r = await run();
  T.eq('run OK', r.status, 200);
  T.eq('the fine lead was emailed', mock.sent.map((m) => m.to), [L('LD-FINE').email]);
  const details = evs('error').map((e) => e.detail).join(' | ');
  T.eq('four errors', evs('error').length, 4);
  T.check('details name the fields', /lead_id/.test(details) && /email/.test(details) && /seq_step/.test(details) && /next_action_at/.test(details), details);
  T.check('bad rows untouched', ['LD-NOMAIL', 'LD-BADSTEP', 'LD-BADTIME'].every((id) => L(id).updated_at === ''));
});

await T.scenario('No active step left: lead is finished without an email (seq_step beyond the last step, or step 2 deactivated)', async () => {
  fresh([lead({ lead_id: 'LD-END', status: 'nurturing', seq_step: '4' }), lead({ lead_id: 'LD-GAPSTEP', status: 'nurturing', seq_step: '1' })]);
  mock.find('SEQUENCES', 'WAITLIST_NURTURE#2').active = 'FALSE';
  await run();
  T.eq('no emails', mock.sent.length, 0);
  T.eq('both finished', [L('LD-END').status, L('LD-GAPSTEP').status], ['nurture_done', 'nurture_done']);
  T.eq('next_action_at cleared', [L('LD-END').next_action_at, L('LD-GAPSTEP').next_action_at], ['', '']);
  T.eq('sequence_completed x2', evs('sequence_completed').length, 2);
  // all steps inactive = misconfiguration, nobody is finished
  fresh([lead({ lead_id: 'LD-SAFE' })]);
  for (const r of mock.rows('SEQUENCES')) r.active = 'FALSE';
  await run();
  T.eq('no email', mock.sent.length, 0);
  T.eq('lead NOT marked done', L('LD-SAFE').status, 'new');
  T.check('one error about SEQUENCES', evs('error').length === 1 && /SEQUENCES/.test(evs('error')[0].detail), evs('error')[0]?.detail);
});

await T.scenario('Empty LEADS tab ends quietly', async () => {
  fresh([]);
  const r = await run();
  T.eq('finishes', r.status, 200);
  T.eq('no email, no log row', [mock.sent.length, evs().length], [0, 0]);
});

await T.scenario('Sheets returning numbers and real booleans (not text) still works', async () => {
  fresh([lead({ lead_id: 'LD-TYPED', seq_step: '0' })]);
  mock.typed = true;
  await run();
  T.eq('step 1 sent', mock.sent.length, 1);
  T.eq('seq_step written', L('LD-TYPED').seq_step, '1');
  mock.typed = false;
});

await T.scenario('Real mode (DEMO_MODE FALSE): next step is a real day later', async () => {
  fresh([lead({ lead_id: 'LD-REAL' })], { DEMO_MODE: 'FALSE' });
  await run();
  const l = L('LD-REAL');
  T.eq('sent', mock.sent.length, 1);
  T.check('next_action_at = +1440 min', Math.abs(minutesBetween(l.last_contacted_at, l.next_action_at) - 1440) < 0.05, `${l.last_contacted_at} -> ${l.next_action_at}`);
  T.eq('demo_mode logged FALSE', evs()[0].demo_mode, 'FALSE');
});

await T.scenario('A name with HTML characters is escaped in the body but not in the subject', async () => {
  fresh([lead({ lead_id: 'LD-ESC', first_name: 'A<b>&Co' })]);
  await run();
  T.check('body escaped', mock.sent[0].html.includes('Hi A&lt;b&gt;&amp;Co,'), mock.sent[0].html.slice(0, 120));
  T.check('subject keeps plain text', mock.sent[0].subject.includes('A<b>&Co'), mock.sent[0].subject);
});

await T.scenario('A node failing mid-run: EVENTS_LOG append fails; the email was already recorded on the lead, so the next run does not resend', async () => {
  fresh([lead({ lead_id: 'LD-MID1' }), lead({ lead_id: 'LD-MID2' })]);
  mock.failNext('sheets:EVENTS_LOG:append', 3);
  const r = await run();
  T.check('run reports an error (status 500)', r.status === 500, `status ${r.status}`);
  T.eq('first lead was emailed once', mock.sent.length, 1);
  T.eq('its row is already updated', mock.rows('LEADS').filter((x) => x.seq_step === '1').length, 1);
  await run();
  T.eq('next run: second lead only, first lead NOT emailed again', [mock.sent.length, new Set(mock.sent.map((m) => m.to)).size], [2, 2]);
});

await T.scenario('A node failing before anything is sent (SEQUENCES read fails): the run stops, nothing is emailed, the next run recovers', async () => {
  fresh([lead({ lead_id: 'LD-RD' })]);
  mock.failNext('sheets:SEQUENCES:read', 3);
  const r = await run();
  T.check('run reports an error', r.status === 500, `status ${r.status}`);
  T.eq('nothing sent', mock.sent.length, 0);
  await run();
  T.eq('recovered', mock.sent.length, 1);
});

await T.scenario('SETTINGS missing a required key: clear error, nothing sent', async () => {
  fresh([lead({ lead_id: 'LD-SET' })]);
  mock.tabs.SETTINGS = mock.tabs.SETTINGS.filter((r) => r.key !== 'MAX_SENDS_PER_RUN');
  const r = await run();
  T.check('run errors', r.status === 500, `status ${r.status}`);
  T.eq('nothing sent', mock.sent.length, 0);
  T.check('stored error message names the key', /missing a value for: MAX_SENDS_PER_RUN/.test(await n8n.lastExecutionText()));
});

await T.scenario('Cross-lane guard (session 5): a lead Lane 7 marks hot/unsubscribed during the run is not emailed and its status is kept', async () => {
  fresh([lead({ lead_id: 'LD-X1' }), lead({ lead_id: 'LD-X2' }), lead({ lead_id: 'LD-X3' })]);
  // After the pick (1st LEADS read), Lane 7 changes two leads before Lane 4 gets to them.
  mock.onRead = (tab, n, m) => { if (tab === 'LEADS' && n === 1) { m.find('LEADS', 'LD-X2').status = 'hot'; m.find('LEADS', 'LD-X3').status = 'unsubscribed'; } };
  const r = await run();
  T.eq('run finished OK', r.status, 200);
  T.eq('only the unchanged lead was emailed', mock.sent.map((x) => x.to), ['kayademo.customers+t01@gmail.com']);
  T.eq('Lane 7 statuses survive (not overwritten by nurturing)', [L('LD-X2').status, L('LD-X3').status], ['hot', 'unsubscribed']);
  T.eq('their seq_step is untouched', [L('LD-X2').seq_step, L('LD-X3').seq_step], ['0', '0']);
  T.eq('nothing logged for them', evs().filter((e) => e.entity_id !== 'LD-X1').length, 0);
  T.check('the lead row was re-read before each send', mock.reads.filter((t) => t === 'LEADS').length === 4, mock.reads.join(','));
});

await T.scenario('Cross-lane guard (session 5): a lead Lane 5 emailed moments ago (after the pick) waits for the gap', async () => {
  fresh([lead({ lead_id: 'LD-G1' })]);
  mock.onRead = (tab, n, m) => { if (tab === 'LEADS' && n === 1) m.find('LEADS', 'LD-G1').last_contacted_at = ist(0); };
  await run();
  T.eq('no nurture email right after the launch email', mock.sent.length, 0);
  T.eq('row untouched (seq_step 0, status new)', [L('LD-G1').seq_step, L('LD-G1').status], ['0', 'new']);
  mock.onRead = null; mock.shiftTime(1.1); await run();
  T.eq('after the gap (0.5 day = 1 demo minute) the welcome goes out', mock.sent.length, 1);
});

await T.scenario('Two runs executed back to back never double-send (with several leads)', async () => {
  fresh([lead(), lead(), lead(), lead()]);
  await run(); await run();
  T.eq('3 emails after run 1 + run 2 combined = 4 leads, each once', [mock.sent.length, new Set(mock.sent.map((m) => m.to)).size], [4, 4]);
  await run(); await run();
  T.eq('still 4', mock.sent.length, 4);
});
} finally {
  const md = suite.markdown(engine);
  writeFileSync(join(here, `results-${engine}.md`), md + '\n');
  console.log(`\n${md}`);
  await n8n.stop(); await mock.close();
}
process.exit(suite.failed ? 1 : 0);
