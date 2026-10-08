# PROGRESS

Project: free n8n demo for **Marion Enroute**: one canvas, 8 lanes, fake client **Kaya Jewels**, Diwali launch of **The Roshni Edit**. Plan: 5 sessions. Contract: `SPEC.md`.

## Status at a glance

| Session | Scope | Status |
|---|---|---|
| 1 | SPEC, sheet templates, Lane 1 (Content engine), docs, validator | **done** (this PR) |
| 2 | Lanes 2 (Publisher) + 3 (Lead engine) | to do |
| 3 | Lanes 4 (Sequence sender) + 5 (Launch engine) + 8 (Report) | to do |
| 4 | Lanes 6 (Outreach) + 7 (Inbox) | to do |
| 5 | Merge into one canvas, validate, end-to-end demo run, final docs | to do |

The 2/3/4 split above is a suggestion (see "Open decisions"). Lanes only share the Google Sheet, so any split works.

## Session 1: what was delivered

| File | What it is |
|---|---|
| `SPEC.md` | The contract: credentials, all 8 tabs and columns, status pipelines, SETTINGS keys, conventions (naming, time, demo clock, Sheets rules, logging, safety gate, layout, IDs, AI pattern, templates, node versions), brand brief, per-lane responsibilities, merge checklist |
| `sheets-template/*.csv` | One CSV per tab. SETTINGS (32 keys with defaults), BRIEF (38 facts and rules for the Diwali campaign), LEADS (15 fake waitlist leads in every status), PROSPECTS (6 boutiques + 6 micro-influencers on plus-addresses of `kayademo.customers@gmail.com`), SEQUENCES (4 sequences, 15 steps with HTML templates), CONTENT (2 older published posts), EVENTS_LOG (12 sample events), DASHBOARD (30 metric keys) |
| `lanes/lane-1-content-engine.json` | Lane 1, ready to import (25 nodes) |
| `NODES.md` | Every Lane 1 node explained: what and why |
| `tools/validate-workflow.mjs` | Checks any lane file or the merged file against SPEC (structure, connections, unique names/ids, node versions, credential names, no secrets, safety gate before Gmail, Sheets settings, Wait limits, lane bands). Run: `node tools/validate-workflow.mjs lanes/lane-1-content-engine.json` |

### How Lane 1 was verified

* `tools/validate-workflow.mjs` → valid, 0 warnings.
* Imported with the real n8n CLI (**n8n 1.123.84**, the newest 1.x on npm): import succeeds, and all 7 credential references were linked automatically to credentials created with the SPEC names (`"id": ""` + name works).
* Ran end to end inside a real n8n 1.123.84 server, with Google Sheets and Telegram swapped for stub nodes and Gemini/Groq pointed at a local mock API:
  * **Mixed failures**: Gemini returned HTTP 500 for the reels (retried 3× five seconds apart, then Groq took over) and broken JSON for the newsletter (caught by *Check AI answer*, Groq took over). Result: 13 rows, correct IDs, demo-mode schedule, SEO/quality scores, Telegram text, 22 log events (`ai_fallback` ×2 with reasons).
  * **One job dead on both providers + bad AI content**: newsletter skipped and reported ("Not generated: Newsletter"); a caption containing "real gold", "₹2,999", "20%" and the discount code was scored 60 with 4 `FACT:` issues. Captions wrapped in ```` ```json ```` fences were parsed fine.
  * **Everything down**: the run stops with "Every AI job failed…" listing each job's reason.
  * Request check: Gemini got JSON mode + schema + `?key=` from the credential + `thinkingConfig`; Groq got JSON mode + `Bearer` header; the repurpose prompt contained the blog from round 1.
  * Ran under both n8n expression engines (`vm`, the 1.123 default, and `legacy`).
* **Not verified here** (no real accounts in this environment): live calls to Google Sheets, Gemini, Groq and Telegram. Your first real run is the live test (steps below).

### Finding worth knowing
n8n 1.123.84's new default expression engine (`vm`) fails on `$('Other node').first()` **inside node parameters** ("#<Object> could not be cloned"); the `legacy` engine and Code nodes are fine. Lane 1 therefore only uses `{{ $json.… }}` in parameters, and SPEC 5.12 makes that a rule for every lane. If you ever hit that error in your own workflows, either restructure the same way or start n8n with `N8N_EXPRESSION_ENGINE=legacy`.

## Setup (owner, once)

1. **Google accounts**: a Gmail for the sender (Kaya Jewels, e.g. `kayademo.hello@gmail.com`) and one for the demo customers (`kayademo.customers@gmail.com`). Every demo lead and prospect address is a plus-address of the customers inbox, so all demo mail lands somewhere you control.
2. **Sheet**: create a Google Sheet named `Kaya Jewels · Diwali demo (Marion Enroute)` with 8 tabs named exactly `SETTINGS, BRIEF, CONTENT, LEADS, PROSPECTS, SEQUENCES, EVENTS_LOG, DASHBOARD`. For each tab: **File → Import → Upload** the matching CSV → **Replace current sheet** → **untick "Convert text to numbers, dates, and formulas"**. Copy the sheet id from the URL.
3. **SETTINGS**: set `SENDER_EMAIL`, `TELEGRAM_OWNER_CHAT_ID`, `TELEGRAM_CHANNEL_ID`, `SHEET_URL` (with the real id), and check `LAUNCH_DATE`. Before a demo, set `DEMO_LAUNCH_AT` about 15 minutes ahead.
4. **Telegram**: create a bot with @BotFather, press Start in its chat, create a channel and add the bot as admin.
5. **n8n credentials**: create the 6 credentials with the exact names in SPEC section 1 (copy-paste them; the `·` is a middle dot).
6. **Import Lane 1**: replace `__KAYA_SHEET_ID__` in the JSON with your sheet id (any text editor: find and replace), then Workflows → Import from File. Run it with **Execute workflow**.

## What sessions 2–5 must do

Every session: read `SPEC.md` fully first (sections 2–5 are binding), copy the shared snippets from it (settings, time helpers, safety gate, event builder, AI pattern from Lane 1), keep inside your lane's canvas band, run `node tools/validate-workflow.mjs` on your file, and add your lane to `NODES.md` and this file.

**Session 2: Lane 2 Publisher + Lane 3 Lead engine** (SPEC 7.2, 7.3)
* `lanes/lane-2-publisher.json`: approved + due CONTENT → Telegram channel (captions, short posts, blog teaser) / owner chat (reel briefs); newsletter broadcast to active leads, resumable via `last_newsletter_id`.
* `lanes/lane-3-lead-engine.json`: Form Trigger `kaya-waitlist` with the exact fields and option mapping, dedupe, rule-based score, safety gate, append LEADS (`status new`, `next_action_at now`), hot-lead Telegram alert. No email (Lane 4 sends the welcome).
* Done when: the "done when" lines of 7.2 and 7.3 hold.

**Session 3: Lane 4 Sequence sender + Lane 5 Launch engine + Lane 8 Report** (SPEC 7.4, 7.5, 7.8)
* Lane 4: due leads → render WAITLIST_NURTURE step → gate → Gmail → update row immediately → log.
* Lane 5: launch moment from the demo clock; latest due channel post; highest due email step to active leads via `launch_step`.
* Lane 8: due check from EVENTS_LOG, metrics of SPEC 2.8, DASHBOARD append-or-update, Telegram report, optional AI insights.

**Session 4: Lane 6 Outreach + Lane 7 Inbox** (SPEC 7.6, 7.7)
* Lane 6: due prospects by fit score, AI opener (Gemini → Groq → template), outreach sequences, update immediately.
* Lane 7: Gmail Trigger on the sender inbox, match by thread id then email, AI classification with keyword fallback, status mapping, hot/question alerts, mark read; optional demo reply form using the Demo Customers credential.

**Session 5: merge** (SPEC 8)
* Build `workflow/kaya-demo-all-lanes.json`, run the validator on it, do the import test and the 20-minute demo dry run, finish `NODES.md` and this file.

## Open decisions

1. **Launch date**: `LAUNCH_DATE = 2026-10-26` (10:00 IST, public launch 28 Oct) is a placeholder. Confirm or change it in SETTINGS only.
2. **Gemini model and free tier**: default `gemini-2.5-flash` with `GEMINI_THINKING_BUDGET = 1024`. Google changes free-tier limits often; if Lane 1 keeps falling back to Groq, check AI Studio's rate-limit page and try `gemini-2.5-flash-lite`. Blank the thinking budget for models without thinking (e.g. `gemini-2.0-flash`).
3. **Approval method**: approval happens in the sheet (`status` → `approved`). Telegram buttons would need a public webhook URL, which a home PC does not have. A tunnel (e.g. Cloudflare Tunnel) could add that later.
4. **Blog publishing**: there is no real website, so Lane 2 posts a blog *teaser* to the Telegram channel; the full article stays in the sheet.
5. **Reel ideas**: Lane 2 sends them to your private chat as shoot briefs (they are not public posts).
6. **Session split** for lanes 2–8 (table at the top) is a suggestion.
7. **Placeholder addresses**: `kayademo.hello@gmail.com` and `kayademo.customers@gmail.com` are examples. Use your real demo inboxes and update `SENDER_EMAIL` / `ALLOWED_DEMO_INBOXES`; the sample CSVs use the `kayademo.customers+…@gmail.com` pattern.
8. **n8n version**: built and tested on 1.123.84; node versions in SPEC 5.13 were chosen to exist from about 1.80 onwards. If your n8n is older than ~1.80 and an import complains about a node version, tell the next session.

## Change log
* **Session 1**: SPEC v1.0, sheet templates, Lane 1, NODES.md, PROGRESS.md, validator.
