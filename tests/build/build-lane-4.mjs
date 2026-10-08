import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lane, root } from './lib.mjs';

const L = new Lane(4, 'Sequence sender', 'sequence-sender', 4);
const REQUIRED = ['DEMO_MODE', 'DEMO_MINUTES_PER_DAY', 'LAUNCH_DATE', 'LAUNCH_TIME', 'EARLY_ACCESS_DAYS', 'WAITLIST_FORM_URL', 'SENDER_NAME', 'SENDER_EMAIL', 'ALLOWED_DEMO_INBOXES', 'MAX_SENDS_PER_RUN', 'SEND_DELAY_SECONDS', 'MIN_EMAIL_GAP_DAYS', 'UNSUBSCRIBE_LINE'];

L.frame(
  '## 📬 Lane 4 · Sequence sender  ·  trigger: every minute (cron `15 * * * * *`)\n' +
  '**What it does:** finds waitlist leads whose next nurture email is due (status `new`/`nurturing`, consent TRUE, gap respected), renders the WAITLIST_NURTURE step, passes it through the demo safety gate, sends it with Gmail, **updates the lead row straight away**, then logs it. At most `MAX_SENDS_PER_RUN` emails per run; a reply or unsubscribe (Lane 7 changes the status) stops the sequence by itself.\n' +
  '**Tabs:** reads SETTINGS, LEADS, SEQUENCES, BRIEF · writes LEADS (`status, seq_step, next_action_at, last_contacted_at, thread_ids, email_allowed, updated_at`) and EVENTS_LOG.\n' +
  '**Credentials:** Kaya Demo · Google Sheets, Kaya Demo · Gmail Sender.  **Docs:** SPEC.md §7.4 · docs/lane-4.md explains every node.', 5200);
L.sticky('How the loop works', '### How one round works\nPick due leads gives ONE item per lead. For each lead the loop runs: needs an email? → safety gate → allowed? → Gmail → **Decide outcome** (every path meets here) → update the lead → log → pause → next lead.\nThe lead row is updated BEFORE the next lead is touched, so a crash can never send the same step twice.', 1000, 900, 1700, 90, 7);

const trigger = L.schedule('Every minute', '15 * * * * *', 0, 400);
const readSettings = L.read('SETTINGS', 220, 400, { note: 'Reads every row of SETTINGS' });
const settings = L.code('Settings to object', 'settings.js', 440, 400, { note: 'Rows → one settings item', subst: { REQUIRED_LIST: JSON.stringify(REQUIRED) } });
const readLeads = L.read('LEADS', 660, 400);
const readSeq = L.read('SEQUENCES', 880, 400);
const readBrief = L.read('BRIEF', 1100, 400);
const pick = L.code('Pick due leads', 'l4-pick.js', 1320, 400, { note: 'Due, rendered, one per lead' });
const loop = L.loop('Loop over leads', 1540, 400, 'One lead per round');
const needs = L.ifBool('Needs email?', 'needs_email', 1760, 560, 'false = nothing to send');
const gate = L.code('Demo safety gate', '_gate.js', 1980, 480, { note: 'Is the address allowed?' });
const allowed = L.ifBool('Recipient allowed?', 'gate_ok', 2200, 480, 'true = may send');
const gmail = L.gmail('Send nurture email', 2420, 400, 'Sends one email');
const decide = L.code('Decide outcome', 'l4-decide.js', 2860, 560, { mode: 'runOnceForEachItem', note: 'All paths meet here' });
const hasUpdate = L.ifBool('Has row update?', 'has_update', 3080, 560, 'false = nothing to write');
const prep = L.code('Prepare lead update', 'unwrap-update.js', 3300, 480, { mode: 'runOnceForEachItem', note: 'Only owned columns' });
const update = L.update('LEADS', 'lead_id', 'Update LEAD row', 3520, 480, 'Right after the send');
const logs = L.code('Build log events', 'l4-logs.js', 3740, 560, { note: 'One row per action' });
const save = L.append('EVENTS_LOG', 'Save to EVENTS_LOG', 3960, 560);
const pause = L.code('Prepare pause', 'pause.js', 4180, 560, { note: 'SEND_DELAY_SECONDS' });
const wait = L.wait('Pause between emails', 4400, 560, 'Then next lead');

L.chain(trigger, readSettings, settings, readLeads, readSeq, readBrief, pick, loop);
L.link(loop, needs, 1);
L.link(needs, gate, 0); L.link(needs, decide, 1);
L.link(gate, allowed);
L.link(allowed, gmail, 0); L.link(allowed, decide, 1);
L.link(gmail, decide, 0); L.link(gmail, decide, 1);
L.link(decide, hasUpdate);
L.link(hasUpdate, prep, 0); L.link(hasUpdate, logs, 1);
L.chain(prep, update, logs, save, pause, wait, loop);

writeFileSync(join(root, 'lanes', 'lane-4-sequence-sender.json'), JSON.stringify(L.build('Kaya Jewels demo · Lane 4 · Sequence sender'), null, 2) + '\n');
console.log('wrote lane 4:', L.nodes.length, 'nodes');
