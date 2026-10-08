import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lane, root } from './lib.mjs';

const L = new Lane(5, 'Launch engine', 'launch-engine', 5);
const REQUIRED = ['DEMO_MODE', 'DEMO_MINUTES_PER_DAY', 'LAUNCH_DATE', 'LAUNCH_TIME', 'EARLY_ACCESS_DAYS', 'WAITLIST_FORM_URL', 'SENDER_NAME', 'SENDER_EMAIL', 'ALLOWED_DEMO_INBOXES', 'MAX_SENDS_PER_RUN', 'SEND_DELAY_SECONDS', 'MIN_EMAIL_GAP_DAYS', 'UNSUBSCRIBE_LINE', 'TELEGRAM_CHANNEL_ID'];

L.frame(
  '## 🚀 Lane 5 · Launch engine  ·  trigger: every minute (cron `30 * * * * *`)\n' +
  '**What it does:** works out the launch moment (`DEMO_LAUNCH_AT` in demo mode, `LAUNCH_DATE` + `LAUNCH_TIME` otherwise), then runs the LAUNCH_BROADCAST steps as they fall due: posts the LATEST due channel step to the Telegram channel (older undone ones are marked done without posting) and sends the highest due email step to every active lead that has not had it yet (`launch_step`), up to `MAX_SENDS_PER_RUN` per run.\n' +
  '**Tabs:** reads SETTINGS, SEQUENCES, LEADS, BRIEF · writes SEQUENCES (`broadcast_done_at`), LEADS (`launch_step, last_contacted_at, thread_ids, status/email_allowed when blocked, updated_at`) and EVENTS_LOG.\n' +
  '**Credentials:** Kaya Demo · Google Sheets, Gmail Sender, Telegram Bot.  **Docs:** SPEC.md §7.5 · docs/lane-5.md explains every node.', 5200);
L.sticky('How the loop works', '### How one round works\n"Pick launch work" returns the channel post first (if one is due), then one item per lead to email. The loop handles one item at a time: post → Telegram, email → safety gate → Gmail. Every path meets in **Decide outcome**, which says what to write back (SEQUENCES for a post, LEADS for an email). The row is updated BEFORE the next item, so nothing is posted or sent twice.', 1000, 900, 1900, 90, 7);

const trigger = L.schedule('Every minute', '30 * * * * *', 0, 400);
const readSettings = L.read('SETTINGS', 220, 400);
const settings = L.code('Settings to object', 'settings.js', 440, 400, { note: 'Rows → one settings item', subst: { REQUIRED_LIST: JSON.stringify(REQUIRED) } });
const readSeq = L.read('SEQUENCES', 660, 400);
const readLeads = L.read('LEADS', 880, 400);
const readBrief = L.read('BRIEF', 1100, 400);
const pick = L.code('Pick launch work', 'l5-pick.js', 1320, 400, { note: 'What is due right now?' });
const loop = L.loop('Loop over work items', 1540, 400, 'One post or email per round');
const isPost = L.ifBool('Is channel post?', 'is_post', 1760, 560, 'true = Telegram post');
const post = L.telegram('Post to channel', 2640, 380, { note: 'To TELEGRAM_CHANNEL_ID', failureOutput: true });
const needs = L.ifBool('Needs email?', 'needs_email', 1980, 700, 'false = nothing to send');
const gate = L.code('Demo safety gate', '_gate.js', 2200, 640, { note: 'Is the address allowed?' });
const allowed = L.ifBool('Recipient allowed?', 'gate_ok', 2420, 640, 'true = may send');
const gmail = L.gmail('Send launch email', 2640, 580, 'Sends one email');
const decide = L.code('Decide outcome', 'l5-decide.js', 2900, 600, { mode: 'runOnceForEachItem', note: 'All paths meet here' });
const isSeq = L.ifBool('Update a step?', 'update_sequence', 3120, 600, 'true = a channel post');
const prepSeq = L.code('Prepare step updates', 'l5-prep-sequence.js', 3340, 460, { note: 'Only broadcast_done_at' });
const updSeq = L.update('SEQUENCES', 'step_key', 'Update SEQUENCES step', 3560, 460, 'Right after the post');
const isLead = L.ifBool('Update a lead?', 'update_lead', 3340, 740, 'false = nothing to write');
const prepLead = L.code('Prepare lead update', 'l5-prep-lead.js', 3560, 740, { note: 'Only owned columns' });
const updLead = L.update('LEADS', 'lead_id', 'Update LEAD row', 3780, 740, 'Right after the send');
const logs = L.code('Build log events', 'l5-logs.js', 4000, 600, { note: 'One row per action' });
const save = L.append('EVENTS_LOG', 'Save to EVENTS_LOG', 4220, 600);
const pause = L.code('Prepare pause', 'pause.js', 4440, 600, { note: 'SEND_DELAY_SECONDS' });
const wait = L.wait('Pause between sends', 4660, 600, 'Then next item');

L.chain(trigger, readSettings, settings, readSeq, readLeads, readBrief, pick, loop);
L.link(loop, isPost, 1);
L.link(isPost, post, 0); L.link(isPost, needs, 1);
L.link(post, decide, 0); L.link(post, decide, 1);
L.link(needs, gate, 0); L.link(needs, decide, 1);
L.link(gate, allowed);
L.link(allowed, gmail, 0); L.link(allowed, decide, 1);
L.link(gmail, decide, 0); L.link(gmail, decide, 1);
L.link(decide, isSeq);
L.link(isSeq, prepSeq, 0); L.link(isSeq, isLead, 1);
L.chain(prepSeq, updSeq, logs);
L.link(isLead, prepLead, 0); L.link(isLead, logs, 1);
L.chain(prepLead, updLead, logs);
L.chain(logs, save, pause, wait, loop);

writeFileSync(join(root, 'lanes', 'lane-5-launch-engine.json'), JSON.stringify(L.build('Kaya Jewels demo · Lane 5 · Launch engine'), null, 2) + '\n');
console.log('wrote lane 5:', L.nodes.length, 'nodes');
