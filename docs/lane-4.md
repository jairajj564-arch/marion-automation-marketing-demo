# Lane 4 · Sequence sender (waitlist nurture), node by node

This guide explains every node in `lanes/lane-4-sequence-sender.json`: what it does and **why it is there**. It is written for someone learning n8n and follows the style of `NODES.md` (which explains Lane 1). The rules behind the design are in `SPEC.md` (section 7.4 is this lane).

## What Lane 4 does in one paragraph

Every minute it looks at the **LEADS** tab for people who joined the waitlist and are due their next email in the 4-step **WAITLIST_NURTURE** sequence (welcome → brand story → product peek → early-access reminder). For each due lead (at most `MAX_SENDS_PER_RUN`, 3 by default) it fills in the email template, checks the address is a safe demo address, sends it with Gmail, **immediately writes the new state back to the lead's row**, logs what happened, waits a few seconds and moves on to the next lead. If nothing is due, the run ends silently.

## The shape of Lane 4

```
Every minute → Read SETTINGS → Settings to object → Read LEADS → Read SEQUENCES → Read BRIEF → Pick due leads → Loop over leads
                                                                                                                    │ (one lead per round)
   ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
   ▼
 Needs email? ─true→ Demo safety gate → Recipient allowed? ─true→ Send nurture email ─┬─ sent ───────┐
      │ false (finish / bad row)                    │ false (blocked)                  └─ failed ─────┤
      └─────────────────────────────────────────────┴────────────────────────────────────────────────▼
                                                                                          Decide outcome
   Decide outcome → Has row update? ─true→ Prepare lead update → Update LEAD row ─┐
                          │ false (bad row, nothing to write)                      ▼
                          └────────────────────────────────────────────────→ Build log events → Save to EVENTS_LOG
                                                                                          → Prepare pause → Pause between emails → (back to the loop)
```

Two ideas make this safe:

* **Act → update the row → log → wait.** The lead's row is updated *before* the next lead is touched. If n8n crashes after the email left, the row already says "step 1 sent", so the next run does not send step 1 again.
* **Everything meets in one node (`Decide outcome`).** Whatever happened (sent, send failed, address blocked, sequence finished, bad row), one node turns it into "what to write to the sheet" and "what to log". That keeps the rules in one place.

---

## The nodes

### Lane 4 · Sequence sender *(sticky note, the frame)*
**What:** the big coloured note behind the lane (SPEC 5.8). Its first line says which trigger starts the lane; the rest says what the lane reads, writes and which credentials it uses.
**Why:** the final canvas holds 8 lanes. The frame lets you point at "this is Lane 4" in a demo, and the validator uses it to check the lane stays inside its band.

### Lane 4 · How the loop works *(sticky note)*
**What:** a small note under the loop explaining one round in a few sentences.
**Why:** loops are the hardest thing in n8n to read at a glance; this saves you opening nodes while explaining.

### Lane 4 · Every minute *(Schedule Trigger, cron `15 * * * * *`)*
**What:** starts a run once a minute, at 15 seconds past the minute.
**Why:** the lane must notice "a new lead is due" quickly, but a 6-field cron (with seconds) lets the polling lanes start at different seconds (Lane 2 at :00, Lane 4 at :15, Lane 5 at :30, Lane 8 at :50) so they never fight over Google's rate limits. Long waits ("send step 2 in 2 days") are **not** done by waiting; they are stored as a time in the sheet and picked up by a later run (SPEC 5.5), so the lane survives a PC restart.

### Lane 4 · Read SETTINGS *(Google Sheets, Read rows)*
**What:** reads every row of the `SETTINGS` tab (one item per row).
**Why:** the knobs (demo clock, sender name, how many emails per run, the safety allow-list…) live in the sheet so you can change them without editing the workflow. "Retry on fail" is on (3 tries, 3 s apart) because Google sometimes answers with a temporary error. *Execute once* is on so the node reads the tab one time per run.

### Lane 4 · Settings to object *(Code)*
**What:** turns the SETTINGS rows into **one** item such as `{ DEMO_MODE: "TRUE", MAX_SENDS_PER_RUN: "3", … }`, adds `IS_DEMO` and `DAY_MS` (how long one "day" lasts: 2 minutes in demo mode, 24 hours otherwise) and stops with a clear error if a key this lane needs is missing.
**Why:** later nodes can read a setting with `$('Lane 4 · Settings to object').first().json.KEY`. And going from many items to one means the next Sheets node runs once, not 32 times.

### Lane 4 · Read LEADS *(Google Sheets, Read rows)*
**What:** reads every lead. **Always output data** is on, so an empty tab still lets the run continue (and end quietly).
**Why:** SPEC 5.4 says "read a tab once per run, then filter in a Code node". Filtering in code is clearer and cheaper than asking Google Sheets to filter.

### Lane 4 · Read SEQUENCES *(Google Sheets, Read rows)*
**What:** reads the email templates (all four sequences).
**Why:** the subject and body of every nurture step is data in the sheet, not text inside the workflow. Change a sentence in the sheet and the next email uses it.

### Lane 4 · Read BRIEF *(Google Sheets, Read rows)*
**What:** reads the brand facts.
**Why:** templates contain placeholders such as `{{collection_name}}` and `{{founder_name}}`; their values come from BRIEF so the brand name, collection and offer are written in exactly one place.

### Lane 4 · Pick due leads *(Code)*
**What:** the brain of the lane. In one pass it:
1. keeps only the active nurture steps of `WAITLIST_NURTURE`,
2. fills the BRIEF placeholders (and the launch dates, shown as real dates like "Monday, 26 October" even in demo mode),
3. finds due leads: status `new` or `nurturing`, `consent = TRUE`, `email_allowed` not `FALSE`, `next_action_at` blank or in the past, and long enough since the last email of *any* lane (`MIN_EMAIL_GAP_DAYS`),
4. sorts them oldest-due first and takes at most `MAX_SENDS_PER_RUN` emails,
5. for each lead works out the step (`seq_step + 1`) and renders subject and HTML. Anything people typed (the first name) is HTML-escaped in the body. If a placeholder is unknown or empty, or a row has a bad value, the lead gets an `error` item instead and **nothing is sent**,
6. when there is no active step for the lead, outputs a "finish" item (the sequence is over).

It outputs one item per lead with everything the loop needs. If nothing is due it outputs **no items**, so the rest of the lane does not run (a quiet end, no log row).
**Why:** doing the thinking in one Code node (instead of many small nodes) keeps the rules visible and testable. Not sending when a placeholder is missing prevents emails that read "Hi {{first_name}}". Reading a reply or an unsubscribe is automatic: Lane 7 changes the lead's `status`, and this node only picks `new` / `nurturing`.

### Lane 4 · Loop over leads *(Loop Over Items, batch size 1)*
**What:** hands over one lead at a time. Output 1 ("loop") feeds the lead into the sending chain; output 0 ("done") is empty because there is nothing to do at the end.
**Why:** *never send twice* needs one lead to be fully finished (email sent, row updated, event logged) before the next one starts.

### Lane 4 · Needs email? *(IF)*
**What:** true when the item is a lead to email; false for the "finish this sequence" and "bad row" items.
**Why:** those two kinds skip the safety gate and Gmail and go straight to `Decide outcome`.

### Lane 4 · Demo safety gate *(Code)*
**What:** looks at `to_email` and writes `safe_to`, `gate_ok` and `gate_reason`. An address is allowed only if it is one of `ALLOWED_DEMO_INBOXES` (or its `+tag` version), `SENDER_EMAIL`, or on a domain you own that is listed in `ALLOWED_EMAIL_DOMAINS` (public domains like gmail.com never count).
**Why:** this is the project's most important safety rule (SPEC 5.7): a demo must never email a real stranger, even if one slips into the sheet.

### Lane 4 · Recipient allowed? *(IF)*
**What:** true when `gate_ok` is true. Only the true output reaches Gmail.
**Why:** the validator checks that every Gmail node is fed only by this node's true output. The false output goes to `Decide outcome`, which blocks the lead.

### Lane 4 · Send nurture email *(Gmail, Send)*
**What:** sends one HTML email to `{{ $json.safe_to }}` (never a raw sheet value) with the subject and body prepared earlier, as the display name `SENDER_NAME`, without n8n's "sent by n8n" footer. Retries are **off**; on an error it uses the **error output** (second output).
**Why:** a retry after a timeout could send the same email twice, so it never retries. The error output lets the lane log `email_failed`, schedule another try later and keep going.

### Lane 4 · Decide outcome *(Code, run once for each item)*
**What:** receives the result from whichever path the lead took and decides:
* **sent** (Gmail returned an id): `seq_step` = the step, `status` = `nurturing` (or `nurture_done` after the last step), `last_contacted_at` = now, `next_action_at` = now + the next step's delay on the demo clock (blank after the last step), the Gmail `threadId` appended to `thread_ids` (last 10 kept); logs `email_sent` (and `sequence_completed` after the last step);
* **failed**: only `next_action_at` = now + 0.1 day, so it is retried soon; `seq_step` does **not** advance; logs `email_failed`;
* **blocked** by the gate: `status = blocked`, `email_allowed = FALSE`, `next_action_at` cleared; logs `email_blocked`;
* **finish** (no active step): `status = nurture_done`, `next_action_at` cleared; logs `sequence_completed`;
* **bad row**: no row change; logs `error` naming the problem.

It does not need to remember the lead: it asks n8n for "the item that went into this round" with `.item` (n8n follows the link between items, which stays correct inside loops).
**Why:** every outcome meets here so the *only* place that knows "what do we write to the sheet" is one short node. It builds the update from scratch, so it can only contain columns this lane owns.

### Lane 4 · Has row update? *(IF)*
**What:** true when there is something to write to LEADS (false only for a bad row).
**Why:** the Sheets node must not be asked to update a row that has no changes.

### Lane 4 · Prepare lead update *(Code, run once for each item)*
**What:** outputs only the key (`lead_id`) and the columns being changed.
**Why:** the Google Sheets update node writes **every** field it receives. Passing it only what Lane 4 owns means it can never overwrite what Lane 7 (replies) or Lane 5 (launch) wrote.

### Lane 4 · Update LEAD row *(Google Sheets, Update row, matching on `lead_id`)*
**What:** writes the changes to the lead's row, found by `lead_id` (not by row number, because people sort and filter the sheet). Values are written as plain text (`RAW`) so Google does not turn timestamps into dates.
**Why:** this is the step that makes "never twice" true: it happens right after the send and before anything slow.

### Lane 4 · Build log events *(Code)*
**What:** creates the EVENTS_LOG rows for this round (one per event, with the standard ids, timestamps, execution id and demo flag).
**Why:** EVENTS_LOG is Lane 8's source for the report. Using only the event types of SPEC 5.6 keeps the counts reliable.

### Lane 4 · Save to EVENTS_LOG *(Google Sheets, Append row)*
**What:** appends the events. "Ignore extra data" is on.
**Why:** logging happens inside the loop, right after the row update, so one crash can lose at most one log line, never cause a duplicate email.

### Lane 4 · Prepare pause *(Code)*
**What:** outputs `pause_seconds` = `SEND_DELAY_SECONDS` (6 by default) after an email was attempted, otherwise 0.
**Why:** a Wait node cannot read settings by itself (expressions in parameters may only use the current item, SPEC 5.12), so this node hands it the number.

### Lane 4 · Pause between emails *(Wait, seconds)*
**What:** waits that many seconds, then returns to the loop.
**Why:** spaces out the emails (looks less like spam, stays inside Gmail limits). It is never longer than 60 seconds; longer delays are done with `next_action_at` (SPEC 5.5).

---

## Walk-through: a new lead in demo mode

| Time | What happens |
|---|---|
| 0:00 | Lane 3 adds the lead: `status new`, `next_action_at` = now. |
| ≤ 1 min | Lane 4 sends step 1 (welcome). Row: `seq_step 1`, `nurturing`, `next_action_at` = +2 min (1 day on the demo clock). |
| +2 min | Step 2 (brand story). Next in +4 min (2 days). |
| +6 min | Step 3 (product peek). Next in +4 min. |
| +10 min | Step 4 (early-access reminder). `seq_step 4`, `nurture_done`, `next_action_at` blank, `sequence_completed` logged. |

If the lead replies at any point, Lane 7 changes the status and Lane 4 simply never picks the lead again.
