# PROGRESS

Project: free n8n demo for **Marion Enroute**: one canvas, 8 lanes, fake client **Kaya Jewels**, Diwali launch of **The Roshni Edit**. Contract: `SPEC.md` (v1.1). Setup from zero: **`SETUP.md`**.

## Status at a glance

| Session | Scope | Status |
|---|---|---|
| 1 | SPEC, sheet templates, Lane 1 (Content engine), docs, validator | done (PR #1) |
| 2 | Lanes 2 (Publisher) + 3 (Lead engine) | done (PR #2) |
| 3 | Lanes 4 (Sequence sender) + 5 (Launch engine) + 8 (Report) | done (PR #3) |
| 4 | Lanes 6 (Outreach) + 7 (Inbox) | done (PR #4) |
| 5 | Merge, cross-lane review and fixes, one canvas, full test, SETUP.md | **done** |

**What you import:** `lanes/marion-marketing-engine.json` (all 8 lanes, 256 nodes). The individual lane files stay in `lanes/` and are the source the canvas is built from (`node tools/build-canvas.mjs`).

**Not verified anywhere in this repo:** live calls to Google Sheets, Gmail, Telegram, Gemini and Groq, and the real Schedule / Form / Gmail trigger nodes firing on their own (no real accounts in the build environment). Everything else was run inside a real n8n 1.123.84 server. Your first run (SETUP.md part I) is the live test.

---

## Session 5: what was done

### 1. Merge
PRs #2, #3 and #4 merged in that order. The only conflict was `tests/README.md` (sessions 3 and 4 both added one); it is now one index of all three test harnesses. Every session's tests, results and docs are kept.

### 2. Cross-lane review (every lane against SPEC and against each other)

| Check | Result |
|---|---|
| Tab names, column names | all 8 lanes use the SPEC 2 tabs and columns; the end-to-end run checks every single sheet write against SPEC's "Written by" columns: 0 violations |
| Status values, event types | every status a lane writes is in SPEC 3; every `event_type` in every lane is in the closed list of SPEC 5.6 |
| Credential names | all 83 references use the 6 SPEC names; all link by name on import (CLI and editor) |
| SETTINGS keys | every key any lane reads exists in `sheets-template/SETTINGS.csv` |
| Node names, ids, webhook ids, form paths | unique across the canvas (`kaya-waitlist`, `kaya-demo-reply`); now checked by the validator |
| Two lanes writing the same column | only where SPEC says so (LEADS `status/next_action_at/last_contacted_at/thread_ids`, PROSPECTS `status/next_action_at`); the races this allowed are fixed (below) |
| Lead handoffs | Lane 7 → `hot`/`replied`/`unsubscribed` stops Lane 4 (it only sends to `new`/`nurturing`); `unsubscribed` and `blocked` are never emailed by Lanes 2, 4, 5 (end-to-end checked) |
| Prospect handoffs | Lane 7 → `replied`/`interested`/`not_interested`/`do_not_contact` stops Lane 6 (it only sends to `new`/`contacted`), now also mid-run |

**Real conflicts found and fixed (smallest change each):**

1. **Lanes 4 and 5 (and 2) could email the same lead seconds apart.** The gap rule only sees emails already written to the row, but Lane 2 (:00), Lane 4 (:15) and Lane 5 (:30) runs overlap. Fix: Lanes 5 and 2 (newsletter) leave a lead to Lane 4 while its nurture email is due within the next minute (`reservedForNurture`, SPEC 5.3), and Lane 4 re-reads the row before sending (fix 2). Proven: the end-to-end storyline run against the pre-fix lanes delivered a launch email and a nurture email to `lead04` in the same second; with the fix, nobody gets two emails inside `MIN_EMAIL_GAP_DAYS`.
2. **A reply recorded by Lane 7 during a Lane 4/6 run was ignored and then overwritten.** Lanes 4 and 6 picked their rows at the start of a run (up to 45 s / 100 s earlier); a lead who replied "stop" meanwhile still got the next email, and the row update (`nurturing` / `contacted`) overwrote Lane 7's `unsubscribed` / `interested`. Fix: `Re-read LEADS/PROSPECTS` → `Check … is still due` → `Still due?` right before the safety gate; if the row changed, nothing is sent or written (SPEC 5.4).
3. **Demo replies from the shared address.** The Gmail API always sends the demo reply FROM `kayademo.customers@gmail.com` (never a plus-address), which matches no single row, so a reply only matches through its Gmail thread. Fixes in Lane 7's demo form: `Reply to Sender Only` (n8n otherwise also copies the reply back to the plus-address), the address must belong to a lead/prospect, and the mail it answers must have been sent to exactly that address and have a thread id. The end-to-end world reproduces Gmail's per-mailbox thread ids and `In-Reply-To` threading: the reply lands in the outreach thread and Lane 7 matches it by thread.
4. **Credentials vanished on the editor's "Import from File".** With `"id": ""` (old SPEC 1 rule), n8n 1.123's editor deletes every credential reference whose id is unknown and only spares `id: null`: 0 of 83 linked. All files now use `"id": null`: 83/83 linked through the editor and the CLI. The validator rejects `""`.
5. **Layout:** three Lane 2 node pairs overlapped (80 px apart), the Lane 7 demo-helper note half-covered two nodes, a Lane 6 node stuck out of its band. Fixed; the validator now checks overlaps.
6. Lane 6 logged `sequence_completed` with channel `sheet` in one path; SPEC 5.6 says `email` (as Lane 4 does). Aligned.

### 3. Every "Spec gaps" decision of PRs #2–#4, reviewed

Kept unless noted. "Kept" means it does not conflict with SPEC or another lane.

| PR | Decision | Verdict |
|---|---|---|
| #2.1 | Unpublishable rows stay `approved` with `last_error`, logged once | kept |
| #2.2 | Update nodes get only the key + Lane 2's own columns | kept (end-to-end ownership check passes) |
| #2.3 | Reel brief `publish_failed` uses channel `telegram_owner` | kept |
| #2.4 | `approved → publishing` not logged | kept |
| #2.5 | Newsletter `email_sent` meta `{content_id, thread_id}` | kept (Lane 8 counts it) |
| #2.6 | Newsletter placeholders limited to SETTINGS-based ones; empty first name → "there" | kept (Lane 1 newsletters use only `first_name` + `unsubscribe_line`) |
| #2.7 | Required fields per asset type | kept |
| #2.8 | A blocked lead that is hot still pings the owner | kept |
| #2.9 | Rejected form submissions log `error` with empty `entity_id` | kept |
| #2.10 | Lane 3 Telegram failure never loses the lead | kept |
| #2.11 | En dash in budget options | kept (as SPEC 7.3) |
| #2.12 | No Gmail node in Lane 3 | kept |
| #2.13–14 | `lane-src/` generator; docs in `docs/` | kept |
| #3.1–2 | Nurture step = exactly `seq_step + 1`; no active step at all → one `error` | kept |
| #3.3 | Failed launch email only logs `email_failed`; retried next run | kept |
| #3.4 | Offer code never in channel posts | kept |
| #3.5 | Bad row / bad template logs `error` every run until fixed | kept (visible in Lane 8 `errors_period`) |
| #3.6–7 | Lane 8 AI numbers check; "period" definition | kept |
| #3.8 | `handlingExtraData: ignoreIt` on updates | kept |
| #3.9 | Lane 4 / Lane 5 overlap at launch | **fixed** (fix 1) |
| #3.10 | Sheets update failing after a send → one resend possible | kept as a known limit (SPEC 5.4) |
| #4.1 | Bad prospect rows pushed back 1 demo day | kept |
| #4.2 | No further step → `sequence_done` + `sequence_completed` | kept (channel aligned to `email`, fix 6) |
| #4.3 | Lane 7 reads EVENTS_LOG, `message_id` in meta, duplicates dropped | kept |
| #4.4 | Matching never guesses; bare demo address unmatched | kept; demo replies now always in-thread (fix 3) |
| #4.5 | Status guards (`do_not_contact`/`unsubscribed` sticky, `new` prospect replying moves on) | kept (matches the handoffs above) |
| #4.6–7 | AI out-of-office treated like the header case; alert text without quotes | kept |
| #4.8–12 | No `offer_code` in Lane 6; `ignoreIt`; shared Lane 7 first nodes; error channels; `email_blocked` only in the demo form | kept |

### 4. One canvas
`lanes/marion-marketing-engine.json`, workflow **"Marion Enroute · Marketing Engine demo (Kaya Jewels)"**: 256 nodes (238 working nodes, 18 sticky notes), each lane in its own horizontal band (Lane 1 at the top, SPEC 5.8), each band framed by a coloured note `Lane N · <name>` with what it does, and one overview note at the very top ("Marion Enroute — Marketing Engine demo" + the 5-step demo script). No connections cross lanes; one Manual Trigger (Lane 1). Screenshot: `docs/canvas.png`.

### 5. Tests (all on n8n 1.123.84, both expression engines)

See the table in the PR / `tests/README.md` for how to re-run. Results files: `tests/lane-N/RESULTS.md`, `tests/e2e/RESULTS.md`, `tests/IMPORT-CHECK.md`.

| Suite | `vm` (default) | `legacy` |
|---|---|---|
| Lane 2 · Publisher (`tests/lane-2`) | 110/110 | 110/110 |
| Lane 2 · live Schedule Trigger (real cron) | 4/4 | – |
| Lane 3 · Lead engine | 65/65 | 65/65 |
| Lane 4 · Sequence sender | 112/112 | 112/112 |
| Lane 5 · Launch engine | 96/96 | 96/96 |
| Lane 6 · Outreach | 158/158 (20 scenarios) | 158/158 |
| Lane 7 · Inbox | 159/159 (20 scenarios) | 159/159 |
| Lane 8 · Report | 105/105 | 105/105 |
| **End-to-end storyline on the canvas** (`tests/e2e`) | **60/60** (12 scenarios) | **60/60** |
| Import: CLI, canvas + 8 lane files | 9/9 files, 83/83 canvas credential references linked, round trip identical | |
| Import: editor *Import from File* + Save | 256 nodes, 83/83 linked | |
| `tools/validate-workflow.mjs` | canvas + 8 lane files: valid, 0 warnings | |

Lane 1 has no automated suite of its own (session 1 tested it by hand); it runs inside the end-to-end storyline (13 rows, 5 AI calls, approval message, events). The storyline run against the **pre-fix** lanes failed the cross-lane gap check and the reply-addressing check (details in `tests/e2e/RESULTS.md`), so the storyline really catches the bugs fixed here.

---

## Decisions for you (the owner)

1. **Hot leads still get the newsletter and the launch email.** SPEC 3.2 counts `hot` and `replied` as *active* leads for Lanes 2 and 5; only the automatic *nurture* sequence (Lane 4) stops for them. I kept that: a lead who said "interested" is exactly who should get the early-access code. If you prefer that a lead who replied gets **no** automated email at all, remove `'replied', 'hot'` from the `ACTIVE` list in `Lane 2 · Pick newsletter recipients` and `Lane 5 · Pick launch work` (one line each). Unsubscribed and blocked leads never get any email.
2. **Launch date:** `LAUNCH_DATE = 2026-10-26` (10:00 IST) is still the placeholder from session 1. Change it in SETTINGS only.
3. **Gemini model:** `gemini-2.5-flash` with `GEMINI_THINKING_BUDGET = 1024`. If Lane 1 keeps falling back to Groq, try `gemini-2.5-flash-lite`.
4. **Approval happens in the sheet** (Telegram buttons would need a public URL). **Blog** = a teaser in the channel; **reel ideas** = briefs in your private chat (session 1 decisions, unchanged).

## Known limits

* **Sample-data backlog:** the sample LEADS start with 9 overdue nurture emails; Lane 4 sends 3 per minute, oldest first, so for the first ~3 minutes after activation a new sign-up waits its turn (SETUP part I step 4).
* **Newsletter vs launch email:** Lane 2 (newsletter, starts :00) and Lane 5 (launch emails, starts :30) are guarded against each other only by the gap rule. If a newsletter broadcast is still sending when Lane 5 picks its leads in a minute where a launch email step is due, one lead can get both within seconds. Practical rule: don't schedule a newsletter for launch time. (Lane 4 is protected in both directions.)
* **Act → update window:** if Google Sheets fails for a whole retry cycle right after a Gmail send, that row is not updated and the next run sends the same step again (SPEC 5.4; at most one repeat).
* **Lane 7 and lost polls:** if a Lane 7 execution fails completely, the Gmail Trigger does not redeliver that poll's mails; they stay unread in the inbox for you to handle by hand.
* **Google OAuth in Testing mode** expires sign-ins after 7 days (SETUP part D).
* **Real triggers** (Schedule, Form, Gmail Trigger) were checked against n8n's node definitions and import cleanly; in the tests they are replaced by webhooks.

## Change log
* **Session 1**: SPEC v1.0, sheet templates, Lane 1, NODES.md, PROGRESS.md, validator.
* **Sessions 2–4**: Lanes 2–8 with generators, docs and per-lane test suites (PRs #2–#4).
* **Session 5**: merge; cross-lane fixes 1–6 above (SPEC v1.1); `tools/build-canvas.mjs` + the one canvas; validator checks for overlaps, webhook ids, form paths and `"id": null`; `tests/e2e/` (end-to-end storyline, import checks through the CLI and the editor); SETUP.md; README, NODES.md and lane docs updated.
