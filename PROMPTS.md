# PROMPTS: sessions 2, 3 and 4

These replace the first draft of the prompts. They match `SPEC.md` exactly (names, columns, statuses, schedules, events).

## How to use
1. PR #1 (session 1) is merged into `main`. Do not merge the session 2, 3 or 4 pull requests yourself: session 5 handles the merge.
2. At claude.ai/code choose **New**, repo `marion-automation-marketing-demo`, branch `main`, model Sonnet, effort Medium.
3. Start one new session per prompt below (copy everything inside the code block). Start all three. They run in parallel and cannot see each other.
4. Each session opens its own pull request.

Each prompt is self-contained: the shared rules are repeated in every one.

---

## Session 2: Lane 2 Publisher + Lane 3 Lead engine

```text
You are session 2 of 5 building a free n8n demo for my automation studio "Marion Enroute" (fake client: Kaya Jewels, a handmade jewellery seller on Instagram in India; campaign: Diwali launch of "The Roshni Edit"). Sessions 3 and 4 run IN PARALLEL with you and cannot see your work. Session 5 will merge every lane into one canvas. Session 1 already built SPEC.md, sheets-template/ and Lane 1.

YOUR JOB: build Lane 2 (Publisher) and Lane 3 (Lead engine).

READ FIRST, in this order: SPEC.md (all of it), PROGRESS.md, README.md, NODES.md, lanes/lane-1-content-engine.json, tools/validate-workflow.mjs.
SPEC.md is the contract. Use its exact tab names, column names, status values, event types, credential names, node names, schedules, timestamp/ID formats and shared code snippets (settings, time helpers, demo clock, safety gate, event builder, template renderer, AI pattern). If this prompt and SPEC.md ever disagree, SPEC.md wins. Never invent new columns, statuses, settings keys or event types. If you truly need one, make the most reasonable choice consistent with SPEC.md, and list it under "Spec gaps" in your PR.

RULES (SPEC section 5 in short)
- Do NOT edit SPEC.md, NODES.md, PROGRESS.md, README.md, sheets-template/, tools/ or lane 1. Other sessions depend on them unchanged.
- Each lane is its own workflow file: lanes/lane-N-<slug>.json, with the trigger(s) named in its section below and a frame sticky note named `Lane N · <title>` (SPEC 5.8). Stay inside your lane's canvas band (validator checks it). Do not connect lanes to each other.
- No Manual Trigger (reserved for Lane 1). No Wait node over 60 seconds, seconds unit only: hours/days go through `next_action_at`, `scheduled_for` or launch offsets plus the schedule.
- Node names: `Lane N · Short action` (IF nodes end with `?`). Node versions exactly as in SPEC 5.13. Credentials by name only with `"id": ""` (SPEC section 1). No real keys or tokens anywhere. Sheet id placeholder `__KAYA_SHEET_ID__`; tab by name.
- Use `{{ $json.field }}` only in node parameters; never `$('Other node')` in a parameter (SPEC 5.12). Cross-node lookups go in Code nodes.
- Sheets: read once per run then filter in Code; append/update with `cellFormat: RAW`, update matching on the key column and writing only the key plus the columns your lane owns (SPEC 5.4, 2.x "Written by").
- Never send twice: per item, act, then update that row, then log, before the next item (SPEC 5.4).
- Every Gmail send sits behind `Lane N · Demo safety gate` then `Lane N · Recipient allowed?` (true output only), with `sendTo` exactly `={{ $json.safe_to }}` and `appendAttribution: false` (SPEC 5.7). Gmail send nodes: `retryOnFail: false`, `onError: continueErrorOutput` (failure branch logs `email_failed` and reschedules; it never advances the step). Telegram nodes as in SPEC 5.7.
- AI calls (where your lane uses AI) use the SPEC 5.10 Gemini then Groq pattern, copied from Lane 1, with retries and a short pause. AI prompts use only BRIEF facts plus the row being processed (SPEC 6.4). If both providers fail, the lane continues with the non-AI fallback written in its section.
- Log every action and failure to EVENTS_LOG using only the event types in SPEC 5.6, with the required `meta_json` keys. A run that finds nothing to do ends quietly with no log row.
- A row with missing or invalid fields is skipped and logged (`error` event, detail names the field). It must never crash the run for other rows.
- Docs: plain-English, beginner-friendly explanation of EVERY node in your lane (what it does and WHY it is there), in the style of NODES.md, in docs/lane-N.md. I am learning n8n.

TESTING (same standard as session 1)
- Run `node tools/validate-workflow.mjs lanes/<file>.json` on every lane file. Fix every error.
- Install n8n 1.123.84 in a scratch folder outside the repo (`npm install n8n@1.123.84`). If npm fails fetching the xlsx tarball from cdn.sheetjs.com (403), add `"overrides": {"xlsx": "0.18.5"}` to that scratch package.json. Import each lane with `n8n import:workflow` after creating dummy credentials with the exact SPEC names, then export and confirm every credential reference got an id (linked by name).
- Run each lane end to end in a real n8n server (`n8n start` with `N8N_LISTEN_ADDRESS=127.0.0.1 N8N_RUNNERS_BROKER_LISTEN_ADDRESS=127.0.0.1 N8N_PORT=<free port> N8N_SECURE_COOKIE=false`, `GENERIC_TIMEZONE=Asia/Kolkata`). In the test copy only: swap the trigger for a Webhook node, swap Google Sheets / Gmail / Telegram nodes for Code-node stubs that read and record state (use a small mock state kept in a Code node or a tiny local HTTP mock), and point Gemini/Groq HTTP nodes at a local mock server. The lane JSON you commit must be the real one, not the test copy.
- Test every scenario listed in your section, plus: a row with missing fields, a node failing mid-run, and a run executed twice in a row (no double action).
- Repeat the full test under both expression engines: default (`vm`) and `N8N_EXPRESSION_ENGINE=legacy`.
- Put test scripts, mocks and a short RESULTS.md (what ran, what passed) under tests/lane-N/. Never commit node_modules or secrets.

DELIVER
- Commit on your branch and open a pull request titled "Session 2: Lane 2 Publisher + Lane 3 Lead engine" containing: what was built, how it was tested (with the scenario results), Spec gaps (anything unclear in SPEC.md and the choice you made), and anything I must configure.
- Do not merge it. Do not push to main.

YOUR LANES

LANE 2 · PUBLISHER (SPEC 7.2) -> lanes/lane-2-publisher.json, docs/lane-2.md
- Trigger: Schedule Trigger v1.2 named `Lane 2 · Every minute`, cron `0 * * * * *`. Run budget about 45 seconds.
- Reads SETTINGS, CONTENT, and LEADS only when a newsletter is due.
- Picks CONTENT rows with `status` in (`approved`, `publishing`) and `scheduled_for` <= now, oldest first (demo clock rules of SPEC 5.3 are already built into `scheduled_for` by Lane 1; just compare timestamps). At most `MAX_POSTS_PER_RUN` Telegram items and at most 1 newsletter per run.
- Telegram items (HTML-escape sheet text, keep each message under 4,000 characters):
  - `ig_caption`, `short_post` -> `TELEGRAM_CHANNEL_ID`: body, blank line, hashtags, blank line, "👉 Join the waitlist: <WAITLIST_FORM_URL>".
  - `blog_article` -> `TELEGRAM_CHANNEL_ID`: "📝 New on the Kaya Jewels blog", bold title, meta_description, "Read: /blog/<slug> (demo)", waitlist link.
  - `reel_idea` -> `TELEGRAM_OWNER_CHAT_ID` (a private shoot brief): "🎬 Reel brief: <title>", media_notes, caption and hashtags.
  - Immediately after each send, update that CONTENT row: `status = published`, `published_at = now`, `publish_ref = tg:<message_id>`, `last_error = ""`, `updated_at`. Log `content_published`. If sending fails after retries: `status = failed`, `last_error`, log `publish_failed`.
- Newsletter (`asset_type = newsletter`): if `approved`, first set `publishing`. Recipients are active leads (SPEC 3.2: status in new/nurturing/nurture_done/replied/hot, consent TRUE, email_allowed not FALSE) whose `last_newsletter_id` differs from this `content_id` and that pass `gapOk` (MIN_EMAIL_GAP_DAYS), up to `MAX_SENDS_PER_RUN`. Per lead: render subject (`title`) and `body` ({{first_name}}, {{unsubscribe_line}}; SPEC 5.11) -> safety gate -> Gmail send -> update the LEAD row (`last_newsletter_id`, `last_contacted_at`, `thread_ids` appended, `updated_at`) -> log `email_sent` (meta includes `content_id`) -> wait `SEND_DELAY_SECONDS`. A blocked address sets the lead `status = blocked`, `email_allowed = FALSE` and logs `email_blocked`. When no eligible lead remains without this newsletter, set the CONTENT row `published`, `published_at`, `publish_ref = newsletter:<total sent> sent` and log `content_published` (channel `email`).
- Columns written: CONTENT `status, published_at, publish_ref, last_error, updated_at`; LEADS `last_newsletter_id, last_contacted_at, thread_ids, updated_at` (plus `status, email_allowed` only when blocked).
- Scenarios to test: a normal due caption; a caption not yet due (untouched); a `pending_approval` row (untouched); each asset type; a row with empty body or missing scheduled_for (skipped, logged); Telegram failing (row `failed`, `last_error` set, other rows still processed); more due rows than MAX_POSTS_PER_RUN; a newsletter over several runs (resumes through `last_newsletter_id`, finishes as `published`); a lead behind the gap rule; a blocked lead; Gmail failing; two runs back to back (no double post, no double email).
- Done when: approving a row whose `scheduled_for` has passed makes it appear in the channel within a minute, exactly once.

LANE 3 · LEAD ENGINE (SPEC 7.3) -> lanes/lane-3-lead-engine.json, docs/lane-3.md
- Trigger: Form Trigger v2.2 named `Lane 3 · Waitlist form`; `options.path = "kaya-waitlist"`, `options.appendAttribution = false`, `responseMode: "onReceived"`. Title "Join the Roshni Edit waitlist". Description "Early access + 10% off for waitlist members. Handmade in Jaipur by Kaya Jewels." Use exactly the 9 fields, labels and option mappings in the table in SPEC 7.3 (field types text, email, dropdown only; the output keys are the labels). Set a friendly completion message ("You're on the list! Check your inbox soon for early-access details.").
- Steps: Settings -> validate and normalise (trim; lowercase email; add "@" to the Instagram handle if missing; map dropdown labels to stored values; reject an invalid email or missing required value by logging an `error` event and stopping) -> read LEADS -> duplicate check on email (case-insensitive): a duplicate logs `lead_duplicate` and stops (no new row) -> score -> safety gate (sets `email_allowed`) -> append LEADS -> log `lead_captured` (plus `email_blocked` when blocked) -> if `segment = hot`, Telegram message to `TELEGRAM_OWNER_CHAT_ID` ("🔥 New hot lead: <first_name> (<city>), score <score>") and log `hot_alert_sent`.
- Scoring (exact, cap 100): budget above_5000 +30, 3000_5000 +25, 1500_3000 +15, under_1500 +5; occasion diwali_outfit +25, gifting +20, wedding_season +20, self_treat +15, just_browsing +0; interest full_set +15, necklaces +12, earrings +10, bangles +10, gifting +10, maang_tikka +8; Instagram handle given +10; phone given +10; consent TRUE +10. Segment: score >= HOT_LEAD_SCORE hot, >= WARM_LEAD_SCORE warm, else cold. `score_reason` lists the parts in the style of the sample rows (e.g. `budget 3000_5000 +25; occasion gifting +20; ...`). Document these rules in docs/lane-3.md.
- New row: `lead_id` (SPEC 5.9, re-roll if it exists), `created_at = now`, `source = waitlist_form`, all form fields, `consent`, `email_allowed`, `score`, `segment`, `score_reason`, `status = new` (or `blocked` when the safety gate fails), `sequence_id = WAITLIST_NURTURE`, `seq_step = 0`, `next_action_at = now` (blank if blocked or consent FALSE), `launch_step = 0`, other tracking columns blank, `updated_at`.
- Lane 3 sends NO email and no welcome message. Lane 4 sends the welcome within a minute (SPEC 7.4). Do not add a Gmail node to this lane.
- Columns written: LEADS (append of a full row, every column of SPEC 2.4).
- Scenarios to test: normal hot, warm and cold leads; consent "No thanks" (saved, `next_action_at` blank); duplicate email in a different letter case (no second row, `lead_duplicate` logged); `someone@example.com` (row saved with `status = blocked`, `email_allowed = FALSE`, `email_blocked` logged); a plus-address of the demo inbox (allowed); missing or invalid email; Instagram handle without "@"; Telegram failing (the lead row must still be saved and logged); the Sheets read returning an empty tab.
- Done when: submitting the form with `kayademo.customers+test1@gmail.com` creates one `new` row; submitting with `someone@example.com` creates a `blocked` row; submitting the same email twice creates one row.
```

---

## Session 3: Lanes 4, 5, 8 (Sequences, Launch, Report)

```text
You are session 3 of 5 building a free n8n demo for my automation studio "Marion Enroute" (fake client: Kaya Jewels, a handmade jewellery seller on Instagram in India; campaign: Diwali launch of "The Roshni Edit"). Sessions 2 and 4 run IN PARALLEL with you and cannot see your work. Session 5 will merge every lane into one canvas. Session 1 already built SPEC.md, sheets-template/ and Lane 1.

YOUR JOB: build Lane 4 (Sequence sender), Lane 5 (Launch engine) and Lane 8 (Report).

READ FIRST, in this order: SPEC.md (all of it), PROGRESS.md, README.md, NODES.md, lanes/lane-1-content-engine.json, tools/validate-workflow.mjs.
SPEC.md is the contract. Use its exact tab names, column names, status values, event types, credential names, node names, schedules, timestamp/ID formats and shared code snippets (settings, time helpers, demo clock, safety gate, event builder, template renderer, AI pattern). If this prompt and SPEC.md ever disagree, SPEC.md wins. Never invent new columns, statuses, settings keys or event types. If you truly need one, make the most reasonable choice consistent with SPEC.md, and list it under "Spec gaps" in your PR.

RULES (SPEC section 5 in short)
- Do NOT edit SPEC.md, NODES.md, PROGRESS.md, README.md, sheets-template/, tools/ or lane 1. Other sessions depend on them unchanged.
- Each lane is its own workflow file: lanes/lane-N-<slug>.json, with the trigger(s) named in its section below and a frame sticky note named `Lane N · <title>` (SPEC 5.8). Stay inside your lane's canvas band (validator checks it). Do not connect lanes to each other.
- No Manual Trigger (reserved for Lane 1). No Wait node over 60 seconds, seconds unit only: hours/days go through `next_action_at`, `scheduled_for` or launch offsets plus the schedule.
- Node names: `Lane N · Short action` (IF nodes end with `?`). Node versions exactly as in SPEC 5.13. Credentials by name only with `"id": ""` (SPEC section 1). No real keys or tokens anywhere. Sheet id placeholder `__KAYA_SHEET_ID__`; tab by name.
- Use `{{ $json.field }}` only in node parameters; never `$('Other node')` in a parameter (SPEC 5.12). Cross-node lookups go in Code nodes.
- Sheets: read once per run then filter in Code; append/update with `cellFormat: RAW`, update matching on the key column and writing only the key plus the columns your lane owns (SPEC 5.4, 2.x "Written by").
- Never send twice: per item, act, then update that row, then log, before the next item (SPEC 5.4).
- Every Gmail send sits behind `Lane N · Demo safety gate` then `Lane N · Recipient allowed?` (true output only), with `sendTo` exactly `={{ $json.safe_to }}` and `appendAttribution: false` (SPEC 5.7). Gmail send nodes: `retryOnFail: false`, `onError: continueErrorOutput` (failure branch logs `email_failed` and reschedules; it never advances the step). Telegram nodes as in SPEC 5.7.
- AI calls (where your lane uses AI) use the SPEC 5.10 Gemini then Groq pattern, copied from Lane 1, with retries and a short pause. AI prompts use only BRIEF facts plus the row being processed (SPEC 6.4). If both providers fail, the lane continues with the non-AI fallback written in its section.
- Log every action and failure to EVENTS_LOG using only the event types in SPEC 5.6, with the required `meta_json` keys. A run that finds nothing to do ends quietly with no log row.
- A row with missing or invalid fields is skipped and logged (`error` event, detail names the field). It must never crash the run for other rows.
- Docs: plain-English, beginner-friendly explanation of EVERY node in your lane (what it does and WHY it is there), in the style of NODES.md, in docs/lane-N.md. I am learning n8n.

TESTING (same standard as session 1)
- Run `node tools/validate-workflow.mjs lanes/<file>.json` on every lane file. Fix every error.
- Install n8n 1.123.84 in a scratch folder outside the repo (`npm install n8n@1.123.84`). If npm fails fetching the xlsx tarball from cdn.sheetjs.com (403), add `"overrides": {"xlsx": "0.18.5"}` to that scratch package.json. Import each lane with `n8n import:workflow` after creating dummy credentials with the exact SPEC names, then export and confirm every credential reference got an id (linked by name).
- Run each lane end to end in a real n8n server (`n8n start` with `N8N_LISTEN_ADDRESS=127.0.0.1 N8N_RUNNERS_BROKER_LISTEN_ADDRESS=127.0.0.1 N8N_PORT=<free port> N8N_SECURE_COOKIE=false`, `GENERIC_TIMEZONE=Asia/Kolkata`). In the test copy only: swap the trigger for a Webhook node, swap Google Sheets / Gmail / Telegram nodes for Code-node stubs that read and record state (use a small mock state kept in a Code node or a tiny local HTTP mock), and point Gemini/Groq HTTP nodes at a local mock server. The lane JSON you commit must be the real one, not the test copy.
- Test every scenario listed in your section, plus: a row with missing fields, a node failing mid-run, and a run executed twice in a row (no double action).
- Repeat the full test under both expression engines: default (`vm`) and `N8N_EXPRESSION_ENGINE=legacy`.
- Put test scripts, mocks and a short RESULTS.md (what ran, what passed) under tests/lane-N/. Never commit node_modules or secrets.

DELIVER
- Commit on your branch and open a pull request titled "Session 3: Lanes 4, 5, 8 (Sequences, Launch, Report)" containing: what was built, how it was tested (with the scenario results), Spec gaps (anything unclear in SPEC.md and the choice you made), and anything I must configure.
- Do not merge it. Do not push to main.

YOUR LANES

LANE 4 · SEQUENCE SENDER, WAITLIST NURTURE (SPEC 7.4) -> lanes/lane-4-sequence-sender.json, docs/lane-4.md
- Trigger: Schedule Trigger v1.2 named `Lane 4 · Every minute`, cron `15 * * * * *`. Run budget about 45 seconds.
- Reads SETTINGS, LEADS, SEQUENCES (`sequence_id = WAITLIST_NURTURE`, `active = TRUE`, the 4 steps in the template), BRIEF (placeholder values such as collection_name, founder_name, offer_percent, brand_instagram).
- Due leads: `status` in (`new`, `nurturing`), `consent = TRUE`, `email_allowed` not FALSE, `next_action_at` blank or <= now, and `gapOk` (MIN_EMAIL_GAP_DAYS, SPEC 5.3). Because only `new` and `nurturing` are processed, a reply (Lane 7 changes the status) or an unsubscribe automatically stops the sequence. Oldest `next_action_at` first, at most `MAX_SENDS_PER_RUN` per run.
- Per lead (Loop Over Items, batch size 1): step = `seq_step + 1`. If there is no active step for it: update `status = nurture_done`, `next_action_at = ""`, log `sequence_completed`. Otherwise render subject and body (SPEC 5.11; if a placeholder is unknown or empty, do not send, log `error`, leave the row) -> safety gate -> Gmail send -> IMMEDIATELY update the lead: `seq_step = step`, `status = nurturing` (or `nurture_done` when no later active step), `last_contacted_at = now`, `next_action_at = addDays(now, <next step's delay_days>)` (blank when it was the last step), `thread_ids` with the returned `threadId` appended (keep the last 10), `updated_at` -> log `email_sent` (meta: sequence_id, step, thread_id) and `sequence_completed` when it was the last step -> wait `SEND_DELAY_SECONDS`.
- A blocked address: lead `status = blocked`, `email_allowed = FALSE`, `next_action_at = ""`, log `email_blocked`. A failed send: log `email_failed`, set `next_action_at` = now + 0.1 day (demo clock), do not advance `seq_step`.
- Emails are new messages sent with the Gmail `send` operation (SPEC 5.7); store the threadId so Lane 7 can match replies.
- Columns written: LEADS `status, seq_step, next_action_at, last_contacted_at, thread_ids, email_allowed (only when blocked), updated_at`.
- Scenarios to test: a full sequence playing out under DEMO_MODE (steps 1 to 4 at the SEQUENCES delays scaled by DEMO_MINUTES_PER_DAY; simulate the passing of time by moving `next_action_at` back in the test state); a lead whose status becomes `replied`, `hot` or `unsubscribed` mid-sequence (must stop); a `blocked` lead; consent FALSE; a non-allowed address that slipped through (gate blocks it); Gmail failing; a lead inside the gap window; more due leads than MAX_SENDS_PER_RUN; a missing template placeholder; two runs back to back (no double send).
- Done when: a new form lead gets the welcome email within about a minute, then steps 2 to 4 at 2, 6 and 10 demo minutes (1, 2 and 2 days scaled), never twice.

LANE 5 · LAUNCH ENGINE (SPEC 7.5) -> lanes/lane-5-launch-engine.json, docs/lane-5.md
- Trigger: Schedule Trigger v1.2 named `Lane 5 · Every minute`, cron `30 * * * * *`. Run budget about 45 seconds.
- Reads SETTINGS, SEQUENCES (`sequence_id = LAUNCH_BROADCAST`, `active = TRUE`: 2 email steps, 3 telegram_channel steps in the template), LEADS, BRIEF.
- Timing: `T0 = launchAt(S)` from SPEC 5.3 (real mode: LAUNCH_DATE + LAUNCH_TIME; demo mode: `DEMO_LAUNCH_AT`). If T0 is null (demo mode with blank DEMO_LAUNCH_AT) the run ends quietly. A step is due when now >= `addDays(T0, delay_days)` (delay_days may be negative; `delay_basis` is `launch` for all of these steps).
- Channel steps (`channel = telegram_channel`): among due steps with blank `broadcast_done_at`, post only the LATEST one to `TELEGRAM_CHANNEL_ID` (rendered body, SPEC 5.11), set `broadcast_done_at = now` on it AND on any older undone channel steps (stale, not posted), log `launch_post_published` (meta: step_key, message_id). If the post fails, leave `broadcast_done_at` blank so the next run retries, and log `error`.
- Email steps (`channel = email`): `k` = the highest due email step. Recipients are active leads (status in new/nurturing/nurture_done/replied/hot, consent TRUE, email_allowed not FALSE) with `launch_step < k` and `gapOk`, at most `MAX_SENDS_PER_RUN`. Per lead: render (includes `{{offer_code}}`, `{{offer_percent}}`, `{{launch_date}}`, `{{public_launch_date}}`) -> safety gate -> Gmail send -> IMMEDIATELY update the lead: `launch_step = k`, `last_contacted_at = now`, `thread_ids` appended, `updated_at` -> log `email_sent` (meta: sequence_id = LAUNCH_BROADCAST, step = k, thread_id) -> wait `SEND_DELAY_SECONDS`. A lead who missed an earlier step only gets the latest due step. A blocked address: lead `status = blocked`, `email_allowed = FALSE`, log `email_blocked`.
- Columns written: SEQUENCES `broadcast_done_at`; LEADS `launch_step, last_contacted_at, thread_ids, status and email_allowed (only when blocked), updated_at`.
- Scenarios to test: demo mode with `DEMO_LAUNCH_AT` = now + 6 minutes, stepping time forward in the test state (the "2 days to go" post appears about 2 demo-minutes after the start; at T0 the early-access email and the channel post; the reminder at T0 + 1 day-unit; the public-launch post at T0 + 2 days-units); blank DEMO_LAUNCH_AT (quiet end); real mode with LAUNCH_DATE in the future (nothing due) and in the past (stale posts skipped, only the latest posted); more eligible leads than MAX_SENDS_PER_RUN (spread over runs); unsubscribed, blocked and consent-FALSE leads (skipped); Telegram failing; Gmail failing; two runs back to back and a re-run after a finished launch (no double send, no double post).
- Done when: with `DEMO_LAUNCH_AT` = now + 6 minutes, the "2 days to go" post appears about 2 minutes later, the early-access email and channel post go out at T0 (3 leads per minute), the reminder follows at T0 + 2 minutes and the public-launch post at T0 + 4 minutes (the SEQUENCES offsets scaled by the demo clock).

LANE 8 · REPORT (SPEC 7.8 and 2.8) -> lanes/lane-8-report.json, docs/lane-8.md
- Trigger: Schedule Trigger v1.2 named `Lane 8 · Every 5 minutes`, cron `50 */5 * * * *`. Not a daily trigger: the lane decides in code whether a report is due.
- Reads SETTINGS and EVENTS_LOG first. Due check: L = timestamp of the latest `report_sent` event. Demo mode: due if there is none or now - L >= `DEMO_REPORT_EVERY_MINUTES`. Real mode: due if now >= today at `REPORT_TIME` and L is before today's `REPORT_TIME` (or none). Not due: end quietly (no log, no message). Only when due, read CONTENT, LEADS and PROSPECTS.
- Compute every metric listed in SPEC 2.8 (use the exact `metric_key` names and definitions; "period" = since L, all time if none). The funnel the owner cares about: content created/approved/published, leads captured and by segment, emails sent/blocked, replies, hot alerts, outreach contacted/replied/interested and reply rate, launch emails, AI calls/fallbacks/failures, errors.
- Write DASHBOARD with `appendOrUpdate` matching on `metric_key` (writes `metric_key`, `value`, `updated_at` only; `label`, `unit`, `section`, `notes` already exist from the template). Log `dashboard_updated` (meta: metrics = number written).
- Optional AI insights using the SPEC 5.10 pattern: send ONLY the computed metrics as JSON and ask for `{ "insights": [string, string, string] }` (what happened, what is working, one recommended action), referring only to the supplied numbers. Reject any insight that contains a number not present in the metrics (treat as AI failure). If both providers fail, send the report without insights and log `ai_failed`. Log `ai_call` / `ai_fallback` as in SPEC 5.6.
- Telegram to `TELEGRAM_OWNER_CHAT_ID`: "📊 Kaya Jewels · campaign report", the period, key numbers (content pending/published, leads total/new/hot, emails sent, outreach contacted/replied/interested and reply rate, AI fallbacks, errors), the insights, and the sheet link (`SHEET_URL`). Log `report_sent` (meta: period_start). If Telegram fails the dashboard is still written; log `error`.
- Columns written: DASHBOARD `metric_key, value, updated_at`. Lane 8 writes nothing else.
- Scenarios to test: not due (quiet end); due in demo mode and in real mode; first ever report (no `report_sent`); empty tabs (all zeros, no division by zero, `outreach_reply_rate_pct` = 0); full sample data (check several metrics by hand against the CSVs in sheets-template/); AI failing on both providers (numbers still sent); an AI answer containing an invented number (rejected); Telegram failing; two runs back to back (second not due).
- Done when: every metric_key in SPEC 2.8 has a value in DASHBOARD after the first due run, and the Telegram report arrives.
```

---

## Session 4: Lane 6 Outreach + Lane 7 Inbox

```text
You are session 4 of 5 building a free n8n demo for my automation studio "Marion Enroute" (fake client: Kaya Jewels, a handmade jewellery seller on Instagram in India; campaign: Diwali launch of "The Roshni Edit"). Sessions 2 and 3 run IN PARALLEL with you and cannot see your work. Session 5 will merge every lane into one canvas. Session 1 already built SPEC.md, sheets-template/ and Lane 1.

YOUR JOB: build Lane 6 (Outreach) and Lane 7 (Inbox).

READ FIRST, in this order: SPEC.md (all of it), PROGRESS.md, README.md, NODES.md, lanes/lane-1-content-engine.json, tools/validate-workflow.mjs.
SPEC.md is the contract. Use its exact tab names, column names, status values, event types, credential names, node names, schedules, timestamp/ID formats and shared code snippets (settings, time helpers, demo clock, safety gate, event builder, template renderer, AI pattern). If this prompt and SPEC.md ever disagree, SPEC.md wins. Never invent new columns, statuses, settings keys or event types. If you truly need one, make the most reasonable choice consistent with SPEC.md, and list it under "Spec gaps" in your PR.

RULES (SPEC section 5 in short)
- Do NOT edit SPEC.md, NODES.md, PROGRESS.md, README.md, sheets-template/, tools/ or lane 1. Other sessions depend on them unchanged.
- Each lane is its own workflow file: lanes/lane-N-<slug>.json, with the trigger(s) named in its section below and a frame sticky note named `Lane N · <title>` (SPEC 5.8). Stay inside your lane's canvas band (validator checks it). Do not connect lanes to each other.
- No Manual Trigger (reserved for Lane 1). No Wait node over 60 seconds, seconds unit only: hours/days go through `next_action_at`, `scheduled_for` or launch offsets plus the schedule.
- Node names: `Lane N · Short action` (IF nodes end with `?`). Node versions exactly as in SPEC 5.13. Credentials by name only with `"id": ""` (SPEC section 1). No real keys or tokens anywhere. Sheet id placeholder `__KAYA_SHEET_ID__`; tab by name.
- Use `{{ $json.field }}` only in node parameters; never `$('Other node')` in a parameter (SPEC 5.12). Cross-node lookups go in Code nodes.
- Sheets: read once per run then filter in Code; append/update with `cellFormat: RAW`, update matching on the key column and writing only the key plus the columns your lane owns (SPEC 5.4, 2.x "Written by").
- Never send twice: per item, act, then update that row, then log, before the next item (SPEC 5.4).
- Every Gmail send sits behind `Lane N · Demo safety gate` then `Lane N · Recipient allowed?` (true output only), with `sendTo` exactly `={{ $json.safe_to }}` and `appendAttribution: false` (SPEC 5.7). Gmail send nodes: `retryOnFail: false`, `onError: continueErrorOutput` (failure branch logs `email_failed` and reschedules; it never advances the step). Telegram nodes as in SPEC 5.7.
- AI calls (where your lane uses AI) use the SPEC 5.10 Gemini then Groq pattern, copied from Lane 1, with retries and a short pause. AI prompts use only BRIEF facts plus the row being processed (SPEC 6.4). If both providers fail, the lane continues with the non-AI fallback written in its section.
- Log every action and failure to EVENTS_LOG using only the event types in SPEC 5.6, with the required `meta_json` keys. A run that finds nothing to do ends quietly with no log row.
- A row with missing or invalid fields is skipped and logged (`error` event, detail names the field). It must never crash the run for other rows.
- Docs: plain-English, beginner-friendly explanation of EVERY node in your lane (what it does and WHY it is there), in the style of NODES.md, in docs/lane-N.md. I am learning n8n.

TESTING (same standard as session 1)
- Run `node tools/validate-workflow.mjs lanes/<file>.json` on every lane file. Fix every error.
- Install n8n 1.123.84 in a scratch folder outside the repo (`npm install n8n@1.123.84`). If npm fails fetching the xlsx tarball from cdn.sheetjs.com (403), add `"overrides": {"xlsx": "0.18.5"}` to that scratch package.json. Import each lane with `n8n import:workflow` after creating dummy credentials with the exact SPEC names, then export and confirm every credential reference got an id (linked by name).
- Run each lane end to end in a real n8n server (`n8n start` with `N8N_LISTEN_ADDRESS=127.0.0.1 N8N_RUNNERS_BROKER_LISTEN_ADDRESS=127.0.0.1 N8N_PORT=<free port> N8N_SECURE_COOKIE=false`, `GENERIC_TIMEZONE=Asia/Kolkata`). In the test copy only: swap the trigger for a Webhook node, swap Google Sheets / Gmail / Telegram nodes for Code-node stubs that read and record state (use a small mock state kept in a Code node or a tiny local HTTP mock), and point Gemini/Groq HTTP nodes at a local mock server. The lane JSON you commit must be the real one, not the test copy.
- Test every scenario listed in your section, plus: a row with missing fields, a node failing mid-run, and a run executed twice in a row (no double action).
- Repeat the full test under both expression engines: default (`vm`) and `N8N_EXPRESSION_ENGINE=legacy`.
- Put test scripts, mocks and a short RESULTS.md (what ran, what passed) under tests/lane-N/. Never commit node_modules or secrets.

DELIVER
- Commit on your branch and open a pull request titled "Session 4: Lane 6 Outreach + Lane 7 Inbox" containing: what was built, how it was tested (with the scenario results), Spec gaps (anything unclear in SPEC.md and the choice you made), and anything I must configure.
- Do not merge it. Do not push to main.

YOUR LANES

LANE 6 · OUTREACH (SPEC 7.6) -> lanes/lane-6-outreach.json, docs/lane-6.md
- Trigger: Schedule Trigger v1.2 named `Lane 6 · Every 2 minutes`, cron `45 */2 * * * *`. Run budget about 100 seconds (an AI call per first-touch prospect).
- Reads SETTINGS, PROSPECTS, SEQUENCES (`OUTREACH_BOUTIQUE` and `OUTREACH_INFLUENCER`, 3 steps each, `active = TRUE`), BRIEF (facts with `ai_use` in (all, b2b) plus all `rule` rows).
- Prioritisation: use the existing `fit_score` column (higher first). Do not add an A/B/C column.
- Due prospects: `status` in (`new`, `contacted`), `next_action_at` blank or <= now, `gapOk`, highest `fit_score` first, at most `MAX_SENDS_PER_RUN`. `paused`, `replied`, `interested`, `not_interested`, `do_not_contact`, `blocked`, `sequence_done`, `won`, `lost` are never contacted. Replies are handled by Lane 7, which changes the status and so stops the sequence.
- Per prospect (Loop Over Items, batch size 1): step = `seq_step + 1` in the row's `sequence_id`. If that step has `ai_personalize = TRUE` (step 1), call AI using the SPEC 5.10 pattern with JSON `{ "opener": string }`: ONE friendly sentence of at most 30 words about the prospect, using only that row's `notes`, `niche`, `city`, `business_name` and BRIEF facts; no claims about Kaya Jewels beyond BRIEF; no prices or discounts. Reject an opener containing a number or ₹ not in the BRIEF b2b facts. If AI fails on both providers (or the opener is rejected) use the template opener `I came across {{business_name}} on Instagram and loved what you are building in {{city}}.` and log `ai_failed`. Then render (`{{ai_opener}}`, `{{contact_name}}`, `{{business_name}}`, `{{founder_name}}`, `{{unsubscribe_line}}` etc.; the opt-out line comes from `{{unsubscribe_line}}` in the template; SPEC 5.11) -> safety gate -> Gmail send -> IMMEDIATELY update the row: `seq_step`, `status = contacted` (or `sequence_done` when it was the last step), `last_contacted_at = now`, `next_action_at = addDays(now, <next step's delay_days>)` (blank when last), `thread_ids` appended, `updated_at` -> log `email_sent` (meta: sequence_id, step, thread_id) and `sequence_completed` if last -> wait `SEND_DELAY_SECONDS` (plus `AI_WAIT_SECONDS` when AI was used).
- Blocked address: `status = blocked`, `email_allowed = FALSE`, `next_action_at = ""`, log `email_blocked`. Failed send: log `email_failed`, `next_action_at` = now + 0.1 day (demo clock), `seq_step` unchanged.
- Emails are new messages sent with the Gmail `send` operation; store `threadId` in `thread_ids` for Lane 7.
- Columns written: PROSPECTS `status, seq_step, next_action_at, last_contacted_at, thread_ids, email_allowed (only when blocked), updated_at`.
- Scenarios to test: the 12 sample prospects (boutiques and influencers, 3 per run, highest fit_score first); a full 3-step sequence under DEMO_MODE (time moved forward in the test state); a prospect whose status becomes `interested`, `replied` or `do_not_contact` mid-sequence (no more emails); a `paused` prospect; a blocked address (e.g. `someone@example.com`); AI failing on both providers (template opener used, email still sent); AI returning an opener with an invented price (rejected); Gmail failing; a prospect inside the gap window; a missing contact_name (skipped and logged); two runs back to back (no double send).
- Done when: the 12 sample prospects each receive a personalised first email (3 per run), follow-ups come after 6 and 8 demo minutes, and nothing is sent after a reply.

LANE 7 · INBOX (SPEC 7.7) -> lanes/lane-7-inbox.json, docs/lane-7.md
- Triggers (both in the one file lanes/lane-7-inbox.json; SPEC 7.7 allows the second one): (1) Gmail Trigger v1.2 named `Lane 7 · New email in sender inbox`, credential `Kaya Demo · Gmail Sender`, `pollTimes: { item: [ { mode: "everyMinute" } ] }`, `simple: false`, `filters: { labelIds: ["INBOX"], readStatus: "unread", q: "-from:me" }`. (2) Form Trigger v2.2 named `Lane 7 · Demo reply form` (`options.path = "kaya-demo-reply"`, `appendAttribution: false`) for recording demos: fields `Reply to email sent to` (text: the plus-address) and `Reply type` (dropdown: Interested, Question, Not now, Unsubscribe). It finds the latest message from `SENDER_EMAIL` to that address in the Demo Customers mailbox (Gmail getAll with credential `Kaya Demo · Gmail Demo Customers`, `q: "from:<SENDER_EMAIL> to:<address>"`, limit 1) and replies in the same thread with a short canned text of the chosen type (Gmail `reply`, same credential, `appendAttribution: false`). The reply goes to `SENDER_EMAIL`, which the safety gate always allows; it still passes through `Lane 7 · Demo safety gate` and `Lane 7 · Recipient allowed?`. Log `demo_reply_simulated`. Do NOT make a separate lane-7b file.
- Reads SETTINGS, LEADS, PROSPECTS, BRIEF (for context only).
- Per message from the Gmail Trigger: skip mail from `SENDER_EMAIL`. Skip auto-replies for classification purposes (headers `Auto-Submitted` other than "no", `X-Autoreply`, `Precedence: auto_reply/bulk`, subjects like "Out of office", "Automatic reply") but treat them as class `out_of_office`: log `reply_received` with that class, change nothing on the row, mark the message read. Match the sender: (1) the message `threadId` is in a row's `thread_ids` (LEADS first, then PROSPECTS); (2) else the sender address equals a row's `email` (compare lower-case, also with the plus-tag removed). No match: log `reply_unmatched`, mark read, stop. Strip quoted history (from "On ... wrote:" or lines starting with ">"), keep at most 2,000 characters.
- Classification: SPEC 5.10 AI pattern with temperature 0.2. JSON `{ "reply_class": interested | question | not_now | not_interested | unsubscribe | out_of_office | other, "confidence": number 0 to 1, "summary": "at most 20 words", "suggested_next_step": "at most 25 words" }`. Use only the classes in the SPEC enum. Confidence below 0.6 becomes `other` (never guess). If both providers fail use the SPEC keyword rules: unsubscribe/stop/remove -> `unsubscribe`; out of office/on leave -> `out_of_office`; not interested/no thanks -> `not_interested`; later/next season/not now -> `not_now`; yes/interested/send/price/sample/lookbook -> `interested`; contains "?" -> `question`; else `other`. An unsubscribe request always wins over other signals ("STOP" counts).
- Update the matched row using the status mapping in SPEC 3.2 (leads) or 3.3 (prospects): `last_reply_at`, `reply_class`, new `status`, `next_action_at = ""` (not for `out_of_office`), `updated_at`, and append `[yyyy-MM-dd] <summary>` to `notes` (leads) or `deal_notes` (prospects). Prospects: interested -> `interested`; question, not_now, other -> `replied`; not_interested -> `not_interested`; unsubscribe -> `do_not_contact`. Leads: interested -> `hot`; question, not_now, other -> `replied`; not_interested and unsubscribe -> `unsubscribed`. Do not store the reply text in a new column; the summary goes in notes. Log `reply_received` with status_from, status_to and meta reply_class and thread_id.
- Alerts to `TELEGRAM_OWNER_CHAT_ID`: `interested` -> "🔥 HOT: <name or business> replied: <summary>" plus the suggested next step; `question` -> "❓ <name> asked: <summary>"; `other` with low confidence -> "🤔 Needs a human look: <name>: <summary>". Log `hot_alert_sent`. A failed Telegram message is logged as `error` and must not stop the row update. Finally mark the Gmail message read (Gmail v2.1 `markAsRead`, credential `Kaya Demo · Gmail Sender`).
- Columns written: LEADS `status, last_reply_at, reply_class, next_action_at, notes, updated_at`; PROSPECTS `status, last_reply_at, reply_class, next_action_at, deal_notes, updated_at`.
- Scenarios to test: a prospect replying "interested" (status `interested`, follow-ups stop, hot alert); a lead replying "interested" (status `hot`); "STOP" and "unsubscribe" (stopped forever: lead `unsubscribed`, prospect `do_not_contact`); "not interested"; a question; "maybe later" (`not_now`); an out-of-office auto-reply (ignored, no status change); an unmatched email; matching by thread id and by sender address with a plus-tag; low-confidence classification (`other`, flagged); AI failing on both providers (keyword rules); Gmail mark-read failing; Telegram failing; a reply with quoted history; the demo reply form for each reply type; the same message arriving twice (second time makes no change to the row beyond what the first did and does not alert again).
- Done when: replying "yes please send the lookbook" to a Lane 6 email makes the prospect `interested` within a minute and sends a hot alert; replying "stop" makes it `do_not_contact` and no more emails follow.
```

---

## What changed from the first draft (so you know what to expect)
- Statuses and columns follow SPEC: CONTENT uses `published`, `published_at`, `publish_ref`; prospects use `interested` / `do_not_contact` (no `hot` status); reply classes are `not_now` and `other` (no `later` / `unclear`); the prospect priority is the existing `fit_score`.
- Lane 3 sends no email; Lane 4 sends the welcome. Lane 4 has 4 steps. Lane 5 follows `LAUNCH_BROADCAST` (2 emails + 3 channel posts at launch offsets). Lane 8 runs every 5 minutes with a due check.
- The reply simulator lives inside `lane-7-inbox.json` (no `lane-7b` file). Out-of-office replies are logged as class `out_of_office` and change nothing.
- Follow-ups are new emails sent with the Gmail `send` operation, with the threadId stored for Lane 7 (SPEC 5.7 gate rules apply to `send`).
