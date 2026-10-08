#!/usr/bin/env node
// Builds the ONE-canvas workflow lanes/marion-marketing-engine.json from the 8 lane files (SPEC section 8).
//   node tools/build-canvas.mjs
// The lane files stay the source of truth: re-run this after any lane file changes.
// What it does: concatenates nodes and connections, keeps every lane in its own horizontal band
// (SPEC 5.8: lane N at y = (N-1) * 1200 ... + 1000), rewrites each lane's frame sticky as a short coloured
// "Lane N · <name>" note, adds one overview sticky above Lane 1, drops per-file ids, and checks that node
// names, node ids, webhook ids and form paths are unique and that no connection crosses lanes.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'lanes', 'marion-marketing-engine.json');
const WORKFLOW_NAME = 'Marion Enroute · Marketing Engine demo (Kaya Jewels)';

const LANES = [
  { n: 1, file: 'lane-1-content-engine.json', title: 'Content engine', icon: '🪔', trigger: 'manual: Execute workflow → **Lane 1 · Start**',
    lines: [
      'AI (Gemini, Groq as fallback) writes a blog with SEO checks, 5 Instagram captions, 3 reel ideas, a newsletter and 3 short posts, all from the **BRIEF** tab.',
      'Saves 13 rows to **CONTENT** as `pending_approval` with posting times, and sends you a Telegram approval list. **You approve** by setting `status` to `approved` in the sheet.',
    ] },
  { n: 2, file: 'lane-2-publisher.json', title: 'Publisher', icon: '📣', trigger: 'every minute',
    lines: [
      'Approved CONTENT whose `scheduled_for` has passed goes out: captions, short posts and blog teasers to the **Telegram channel** (stand-in for Instagram), reel ideas to your private chat as shoot briefs.',
      'An approved **newsletter** is emailed to active waitlist leads, 3 per minute, until everyone has it (then `published`).',
    ] },
  { n: 3, file: 'lane-3-lead-engine.json', title: 'Lead engine', icon: '📝', trigger: 'waitlist form `<n8n>/form/kaya-waitlist`',
    lines: [
      'A sign-up is cleaned, de-duplicated, scored (budget, occasion, interest, extras) and saved to **LEADS** as `new` (or `blocked` if the address fails the demo safety gate).',
      'Hot leads ping you on Telegram. It sends no email: Lane 4 sends the welcome within a minute.',
    ] },
  { n: 4, file: 'lane-4-sequence-sender.json', title: 'Sequence sender', icon: '💌', trigger: 'every minute',
    lines: [
      'Sends the 4-step **WAITLIST_NURTURE** emails to `new`/`nurturing` leads when `next_action_at` is due (welcome, then 1, 2 and 2 days later; 1 day = 2 minutes in demo mode).',
      'Re-reads each lead just before sending, so a reply (Lane 7) or another lane\'s email stops it. One email per lead per gap, never twice.',
    ] },
  { n: 5, file: 'lane-5-launch-engine.json', title: 'Launch engine', icon: '🚀', trigger: 'every minute',
    lines: [
      'Counts down to the launch (`DEMO_LAUNCH_AT` in demo mode): posts the **LAUNCH_BROADCAST** countdown posts to the channel and emails every active lead the early-access email with the **10% code**, then a reminder.',
      'Leaves a lead to Lane 4 while its nurture email is due, so nobody gets two emails seconds apart.',
    ] },
  { n: 6, file: 'lane-6-outreach.json', title: 'Outreach', icon: '🤝', trigger: 'every 2 minutes',
    lines: [
      'Emails boutiques and micro-influencers in **PROSPECTS** (highest `fit_score` first): an AI-written personal opener, then 2 follow-ups.',
      'Stops for anyone who replied: it re-reads the row right before every send.',
    ] },
  { n: 7, file: 'lane-7-inbox.json', title: 'Inbox', icon: '📬', color: 2, trigger: 'Gmail polling every minute (+ demo reply form `<n8n>/form/kaya-demo-reply`)',
    lines: [
      'Reads replies in the Kaya Jewels inbox, matches them to a lead or prospect (Gmail thread first), and classifies them with AI (keyword rules as fallback).',
      'Updates the row (hot, replied, unsubscribed, interested …), sends a 🔥 **HOT** alert to Telegram and marks the mail read. The demo form fakes a customer reply in the same thread.',
    ] },
  { n: 8, file: 'lane-8-report.json', title: 'Report', icon: '📊', trigger: 'every 5 minutes (sends when due)',
    lines: [
      'Computes the campaign numbers (content, leads, emails, outreach, replies, AI, errors) into **DASHBOARD**.',
      'Sends you a Telegram report with 3 AI insights (every 10 minutes in demo mode, daily at `REPORT_TIME` otherwise).',
    ] },
];

const OVERVIEW = `# Marion Enroute — Marketing Engine demo
**Client (fictional):** Kaya Jewels, handmade jewellery on Instagram · **Campaign:** Diwali launch of *The Roshni Edit* (waitlist = early access + 10% off).
**8 lanes, each with its own trigger, not connected to each other.** They only talk through one Google Sheet. Every email goes through a demo safety gate (only your demo inboxes can receive mail).

## How to run the demo (5 steps)
1. **Prepare:** in the sheet's **SETTINGS** tab keep \`DEMO_MODE\` = TRUE (1 day = 2 minutes) and set \`DEMO_LAUNCH_AT\` to about 15 minutes from now. Then switch this workflow to **Active** (top right).
2. **Create content:** click **Execute workflow → Lane 1 · Start**. When the Telegram approval list arrives, set \`status\` = \`approved\` on 3–4 rows in **CONTENT**. Lane 2 posts them to the Telegram channel when they are due.
3. **Capture a lead:** open \`http://localhost:5678/form/kaya-waitlist\` and sign up with \`kayademo.customers+you1@gmail.com\`. Lane 3 scores it, Lane 4 sends the welcome email within a minute and the nurture emails after that.
4. **Watch it run:** Lane 6 emails boutiques and creators every 2 minutes; at \`DEMO_LAUNCH_AT\` Lane 5 posts the launch and emails the early-access code.
5. **Show a hot reply:** open \`http://localhost:5678/form/kaya-demo-reply\`, enter \`kayademo.customers+boutique1@gmail.com\` and pick **Interested**. Within a minute Lane 7 sends a 🔥 HOT alert; Lane 8 posts the campaign report to Telegram.

Setup from zero: **SETUP.md** · what every node does: **NODES.md** and **docs/lane-N.md** · the contract: **SPEC.md**.`;

const frameContent = (lane) => `## ${lane.icon} Lane ${lane.n} · ${lane.title}  ·  trigger: ${lane.trigger}\n${lane.lines.join('\n')}`;

const nodes = [];
const connections = {};
const laneOfName = new Map();
let settings = null;

for (const lane of LANES) {
  const wf = JSON.parse(readFileSync(join(root, 'lanes', lane.file), 'utf8'));
  if (lane.n === 1) settings = wf.settings;
  const frameName = `Lane ${lane.n} · ${lane.title}`;
  if (!wf.nodes.some((node) => node.name === frameName)) throw new Error(`${lane.file}: no frame sticky named "${frameName}"`);
  for (const node of wf.nodes) {
    const copy = JSON.parse(JSON.stringify(node));
    if (copy.name === frameName) {
      // Same place and size as in the lane file (it already covers the lane's band); shorter text, SPEC 5.8 colour
      // (except Lane 7: SPEC's colour 7 renders almost white in n8n 1.123, so the frame would not look like a band).
      copy.parameters = { ...copy.parameters, content: frameContent(lane), color: lane.color ?? ((lane.n - 1) % 7) + 1, height: 1000 };
    }
    laneOfName.set(copy.name, lane.n);
    nodes.push(copy);
  }
  for (const [source, value] of Object.entries(wf.connections)) {
    if (connections[source]) throw new Error(`Connections of "${source}" defined twice`);
    connections[source] = value;
  }
}

// Overview note above Lane 1 (outside every lane band; tools/validate-workflow.mjs allows "Canvas · …" stickies there).
nodes.unshift({
  parameters: { content: OVERVIEW, height: 640, width: 3660, color: 7 },
  type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-240, -720],
  id: '6b3f7c4e-2a51-5d8e-9c0b-0e5a1f2d3c4b', name: 'Canvas · Marion Enroute — Marketing Engine demo',
});

// ---- checks (the validator repeats most of them; failing early here gives a clearer message)
const seen = { name: new Set(), id: new Set(), webhookId: new Set(), formPath: new Set() };
for (const node of nodes) {
  for (const [kind, value] of [['name', node.name], ['id', node.id], ['webhookId', node.webhookId], ['formPath', node.type === 'n8n-nodes-base.formTrigger' ? node.parameters?.options?.path : undefined]]) {
    if (value === undefined) continue;
    if (seen[kind].has(value)) throw new Error(`Duplicate ${kind}: ${value}`);
    seen[kind].add(value);
  }
}
for (const [source, byType] of Object.entries(connections)) {
  for (const outputs of Object.values(byType)) for (const targets of outputs) for (const target of targets || []) {
    if (laneOfName.get(source) !== laneOfName.get(target.node)) throw new Error(`Connection crosses lanes: "${source}" → "${target.node}"`);
  }
}
if (nodes.filter((node) => node.type === 'n8n-nodes-base.manualTrigger').length !== 1) throw new Error('Exactly one Manual Trigger (Lane 1) is allowed');

const canvas = {
  name: WORKFLOW_NAME,
  nodes,
  connections,
  active: false,
  settings,
  tags: [],
};
writeFileSync(OUT, JSON.stringify(canvas, null, 2) + '\n');
console.log(`wrote ${OUT.replace(root + '/', '')}: ${nodes.length} nodes (${nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').length} working nodes, ${nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote').length} sticky notes), 8 lanes`);
