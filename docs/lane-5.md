# Lane 5 · Launch engine, node by node

This guide explains every node in `lanes/lane-5-launch-engine.json`: what it does and **why it is there**, in the style of `NODES.md`. The rules behind the design are in `SPEC.md` (section 7.5 is this lane; 5.3 explains the demo clock).

## What Lane 5 does in one paragraph

Lane 5 runs the **launch**. It works out *when* launch happens (**T0**), then, every minute, checks which steps of the `LAUNCH_BROADCAST` sequence have fallen due: Telegram **channel posts** ("2 days to go!", "Early access is live", "Open to everyone") and **launch emails** (early-access email with the discount code, and a reminder). Posts go to the public channel; emails go to every active waitlist lead, 3 per run. Everything it does is written back to the sheet immediately, so nothing is posted or sent twice.

## Timing: what is T0?

| Mode | T0 comes from |
|---|---|
| Demo mode (`DEMO_MODE = TRUE`) | SETTINGS `DEMO_LAUNCH_AT` (a real timestamp, e.g. 15 minutes from now). **Blank = Lane 5 does nothing.** |
| Real mode | `LAUNCH_DATE` + `LAUNCH_TIME` (default 26 Oct 2026, 10:00 IST) |

Each step in SEQUENCES has `delay_days` relative to T0 (it may be negative). A step is **due** when `now >= T0 + delay_days`. With the demo clock 1 day = 2 minutes:

| Step | Channel | delay_days | Due (demo, with T0 = start + 6 min) |
|---|---|---|---|
| LAUNCH_BROADCAST#1 | telegram_channel ("2 days to go!") | −2 | start + 2 min |
| LAUNCH_BROADCAST#2 | email (early access + code) | 0 | T0 |
| LAUNCH_BROADCAST#3 | telegram_channel ("Early access is live") | 0 | T0 |
| LAUNCH_BROADCAST#4 | email (reminder) | 1 | T0 + 2 min |
| LAUNCH_BROADCAST#5 | telegram_channel ("Open to everyone") | 2 | T0 + 4 min |

## The shape of Lane 5

```
Every minute → Read SETTINGS → Settings to object → Read SEQUENCES → Read LEADS → Read BRIEF → Pick launch work → Loop over work items
                                                                                                                   │ (one item per round)
  ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  ▼
 Is channel post? ─true→ Post to channel ──────────────────────────┬─ ok / failed ─┐
      │ false                                                       │               │
      ▼                                                             │               │
 Needs email? ─true→ Demo safety gate → Recipient allowed? ─true→ Send launch email ─┤
      │ false (bad row)                          │ false (blocked)                   │
      └──────────────────────────────────────────┴───────────────────────────────────▼
                                                                              Decide outcome
 Decide outcome → Update a step? ─true→ Prepare step updates → Update SEQUENCES step ─────────┐
                        │ false                                                                ▼
                        └→ Update a lead? ─true→ Prepare lead update → Update LEAD row → Build log events → Save to EVENTS_LOG
                                  └ false ───────────────────────────────────────────────→ (same) → Prepare pause → Pause between sends → loop
```

---

## The nodes

### Lane 5 · Launch engine *(sticky note, the frame)*
**What:** the coloured frame behind the lane with the trigger, what it reads and writes, credentials and the SPEC reference.
**Why:** it labels the lane on the 8-lane canvas and the validator uses it to check the lane stays inside its band (SPEC 5.8).

### Lane 5 · How the loop works *(sticky note)*
**What:** a short explanation of one loop round.
**Why:** loops are hard to read at a glance; this note lets you explain the lane in a demo without opening nodes.

### Lane 5 · Every minute *(Schedule Trigger, cron `30 * * * * *`)*
**What:** starts a run each minute at 30 seconds past (Lane 4 runs at :15, Lane 2 at :00).
**Why:** launch moments must be hit within a minute. Staggering the seconds keeps the lanes from all calling Google at once. No long Wait nodes are used: "launch is in 3 days" is just a timestamp that a later run notices (SPEC 5.5), so a PC reboot cannot lose the launch.

### Lane 5 · Read SETTINGS *(Google Sheets, Read rows)* and Lane 5 · Settings to object *(Code)*
**What:** read the SETTINGS tab and turn it into one item with `IS_DEMO` and `DAY_MS` added. It stops with a clear message if a needed key (for example `TELEGRAM_CHANNEL_ID`) is missing.
**Why:** all knobs (demo mode, launch time, batch size, delays, safety allow-list) live in the sheet, and one item means the next read runs once.

### Lane 5 · Read SEQUENCES / Read LEADS / Read BRIEF *(Google Sheets, Read rows)*
**What:** read the step templates, the leads and the brand facts. "Always output data" lets an empty tab still continue; "execute once" reads each tab once per run.
**Why:** one read per tab per run, then all filtering happens in code (SPEC 5.4).

### Lane 5 · Pick launch work *(Code)*
**What:** the brain of the lane:
1. finds T0; **blank `DEMO_LAUNCH_AT` in demo mode = ends quietly**, an invalid launch date logs an `error`;
2. keeps the active `LAUNCH_BROADCAST` steps and checks `now >= T0 + delay_days`;
3. **channel posts:** among due `telegram_channel` steps with a blank `broadcast_done_at`, only the **latest** is posted; older undone ones are *stale* and will only be marked done. The text is filled from BRIEF/SETTINGS; the discount code is deliberately *not* available to channel posts (a template that asks for it is refused);
4. **emails:** `k` = the highest due email step. Active leads (status new / nurturing / nurture_done / replied / hot, consent TRUE, `email_allowed` not FALSE) with `launch_step < k` and enough time since their last email (`MIN_EMAIL_GAP_DAYS`) get step `k`, at most `MAX_SENDS_PER_RUN` per run. A lead who missed step 2 therefore receives only step 4 once step 4 is due;
5. a lead with a bad value or a template with an unknown/empty placeholder produces an `error` item and **no email**.

It outputs the post first, then one item per email. Nothing due = no items = a quiet end.
**Why:** keeping the decision in one Code node makes the timing rules easy to read and test, and "latest only" stops a late-started launch from spamming the channel with every old announcement.

### Lane 5 · Loop over work items *(Loop Over Items, batch size 1)*
**What:** one post or one email per round.
**Why:** "never send twice" needs each item fully finished (sent, row updated, logged) before the next begins.

### Lane 5 · Is channel post? *(IF)*
**What:** true for the channel post item → Telegram; false for everything else.
**Why:** posts and emails take different roads. Every item passes through here, which also lets `Decide outcome` find "the item of this round".

### Lane 5 · Post to channel *(Telegram, Send message)*
**What:** sends the rendered text to `TELEGRAM_CHANNEL_ID` as HTML (no n8n footer, no link preview). Retries 3 times; if it still fails it uses the error output.
**Why:** the public channel stands in for Instagram. The error output lets the lane leave `broadcast_done_at` blank so the **next run retries**, while still sending the emails of this run.

### Lane 5 · Needs email? *(IF)*
**What:** true for an email item; false for bad-row items, which go straight to `Decide outcome`.
**Why:** bad rows must be logged without touching the gate or Gmail.

### Lane 5 · Demo safety gate *(Code)* and Lane 5 · Recipient allowed? *(IF)*
**What:** the gate checks `to_email` against `ALLOWED_DEMO_INBOXES` (plus-tags allowed), `SENDER_EMAIL` and your own `ALLOWED_EMAIL_DOMAINS`, and writes `safe_to` / `gate_ok`; the IF lets only allowed addresses through.
**Why:** SPEC 5.7. A demo must never email a stranger. Only the IF's true output can reach Gmail.

### Lane 5 · Send launch email *(Gmail, Send)*
**What:** sends the HTML email to `{{ $json.safe_to }}`. No retries (a retry could double-send); errors use the error output.
**Why:** a failed send leaves the lead's `launch_step` unchanged, so the next run (a minute later) simply tries again.

### Lane 5 · Decide outcome *(Code, run once for each item)*
**What:** turns the result of the round into "what to write" and "what to log":
* **post ok** (Telegram answered with a `message_id`): `broadcast_done_at = now` on the posted step *and* on the stale older steps; logs `launch_post_published` (`step_key`, `message_id`);
* **post failed:** writes nothing (so it retries) and logs `error`;
* **email sent:** lead gets `launch_step = k`, `last_contacted_at`, the Gmail `threadId` appended to `thread_ids` (last 10) and `updated_at`; logs `email_sent` (`sequence_id = LAUNCH_BROADCAST`, `step`, `thread_id`);
* **email failed:** writes nothing and logs `email_failed`;
* **blocked by the gate:** `status = blocked`, `email_allowed = FALSE`; logs `email_blocked`;
* **bad row/template:** nothing written; logs `error`.

**Why:** one place holds all the write-back rules.

### Lane 5 · Update a step? *(IF)* → Lane 5 · Prepare step updates *(Code)* → Lane 5 · Update SEQUENCES step *(Google Sheets, Update row on `step_key`)*
**What:** for a successful post, writes only `broadcast_done_at` on each step key.
**Why:** the Sheets update node writes every field it is given, so the Prepare node passes only the key and the one column Lane 5 owns in SEQUENCES.

### Lane 5 · Update a lead? *(IF)* → Lane 5 · Prepare lead update *(Code)* → Lane 5 · Update LEAD row *(Google Sheets, Update row on `lead_id`)*
**What:** writes only the LEADS columns Lane 5 owns (`launch_step`, `last_contacted_at`, `thread_ids`, `status` / `email_allowed` when blocked, `updated_at`), matched by `lead_id`.
**Why:** it runs right after the send. It can never overwrite what Lane 4 (nurture) or Lane 7 (replies) wrote.

### Lane 5 · Build log events *(Code)* → Lane 5 · Save to EVENTS_LOG *(Google Sheets, Append row)*
**What:** one EVENTS_LOG row per event (standard ids, timestamps, execution id, demo flag), appended inside the loop. If a post updated several SEQUENCES rows, it is still logged once.
**Why:** Lane 8 builds the report from these rows (`channel_posts_total`, `launch_emails_sent`, …).

### Lane 5 · Prepare pause *(Code)* → Lane 5 · Pause between sends *(Wait, seconds)*
**What:** after an email attempt waits `SEND_DELAY_SECONDS` (6 s), after a post or a bad row does not wait; then back to the loop.
**Why:** space out emails (3 emails × (6 s + a few seconds) fits the 45-second budget of a minute-run).

---

## Walk-through (demo, `DEMO_LAUNCH_AT` = now + 6 min, 8 active leads)

| Time | What happens |
|---|---|
| start + 2 min | "2 days to go" is posted to the channel (step 1). Nothing else. |
| T0 | Post "Early access is live" (step 3) **and** early-access emails to 3 leads (step 2, with the code). Next two runs: 3 leads, then the last 2. |
| T0 + 2 min | Reminder emails (step 4), 3 per run. |
| T0 + 4 min | "Open to everyone" post (step 5). |
| afterwards | Everything is done; later runs find nothing and end quietly. |
