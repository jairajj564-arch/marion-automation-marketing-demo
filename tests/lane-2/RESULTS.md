# Lane 2 · test results

Lane 2 (`lanes/lane-2-publisher.json`) was run end to end inside a **real n8n 1.123.84 server** (`n8n start`, `GENERIC_TIMEZONE=Asia/Kolkata`, `127.0.0.1`), once with the default expression engine (`vm`) and once with `N8N_EXPRESSION_ENGINE=legacy`. Every check below passed on both.

## How it was tested

* `tests/common/harness.mjs` builds a **test copy** of the real lane file: Google Sheets, Gmail and Telegram nodes become HTTP Request nodes that talk to the local mock `tests/common/mock-server.mjs`, and the Schedule Trigger becomes a Webhook so a test can start a run and wait for it to finish. Node names, ids, connections, every Code/IF/Switch/Loop/Wait node and every node setting (retries, error outputs) are the committed ones. The only other difference: Telegram retry waits are 200 ms instead of 3 s so the suite is faster. The committed lane JSON is never modified.
* The mock keeps the sheet tabs in memory and applies the same rules as the real Sheets nodes (an update only touches the columns it is given; an unknown column would create a new sheet column, which the mock records as a **violation**). It also records every email, Telegram message and write, and can be told to fail Gmail, Telegram or Sheets calls.
* Execution status and error text are read from n8n's own database, so "the run failed with this message" is checked against what n8n recorded.
* `live-schedule.mjs` keeps the **real Schedule Trigger** (cron `0 * * * * *`) and checks that a due approved row appears within the first minute and is not posted again by the later scheduled runs.
* `tests/common/import-test.mjs` creates the six credentials with the exact SPEC names and dummy values, imports the real lane files with `n8n import:workflow`, exports them again and checks every credential reference was linked by name.
* Not covered here (no real accounts in this environment): live calls to Google Sheets, Gmail and Telegram. The mock follows their documented response shapes (Telegram returns the message object, Gmail returns `{id, threadId}`, Sheets update/append echo their input).

Run it yourself:

```bash
npm install n8n@1.123.84            # in a scratch folder OUTSIDE the repo (add "overrides": {"xlsx": "0.18.5"} to its package.json if the xlsx download gives 403)
export KAYA_SCRATCH=<that folder's parent>   # must contain n8n/node_modules/.bin/n8n
node tests/lane-2/run.mjs vm
node tests/lane-2/run.mjs legacy
node tests/lane-2/live-schedule.mjs vm      # about 3 minutes
node tests/common/import-test.mjs lanes/lane-2-publisher.json lanes/lane-3-lead-engine.json
```

## Results (checks passed / total)

_Re-run in session 5 on the merged files (2026-10-09), n8n 1.123.84, both engines._


| Scenario | `vm` engine | `legacy` engine |
|---|---|---|
| Done-when: an approved row whose scheduled_for has passed appears in the channel within a minute, exactly once | 11/11 | 11/11 |
| Rows that must be left alone: not yet due, pending_approval, needs_changes, rejected, published, failed | 3/3 | 3/3 |
| Each asset type: ig_caption, short_post, blog_article, reel_idea | 10/10 | 10/10 |
| Rows with missing or invalid fields are skipped and logged (once), other rows still go out | 16/16 | 16/16 |
| Telegram failing: that row is failed with last_error, other rows still processed | 7/7 | 7/7 |
| More due rows than MAX_POSTS_PER_RUN (2) | 4/4 | 4/4 |
| A very long caption stays under the Telegram limit | 3/3 | 3/3 |
| Newsletter over several runs (7 leads, 3 per run) resumes through last_newsletter_id and finishes as published | 17/17 | 17/17 |
| A lead behind the gap rule (MIN_EMAIL_GAP_DAYS) waits; the newsletter stays publishing until they are mailed | 6/6 | 6/6 |
| Cross-lane guard: a lead Lane 4 is about to email (nurture step due within a minute) is left to Lane 4 and gets the newsletter later | 3/3 | 3/3 |
| Safety gate: blocked and invalid addresses never get mail, the lead is marked blocked | 8/8 | 8/8 |
| Gmail failing: email_failed logged, lead not advanced, retried on a later run, no duplicates | 9/9 | 9/9 |
| Two runs back to back: no double post, no double email | 3/3 | 3/3 |
| Node failing mid-run: Sheets hiccups are retried; a dead LEADS read does not lose or duplicate anything | 7/7 | 7/7 |
| SETTINGS missing a key: clear error, nothing written | 3/3 | 3/3 |
| **Total** | **110/110** | **110/110** |

| Other test | Result |
|---|---|
| `node tools/validate-workflow.mjs lanes/lane-2-publisher.json` | ✔ valid, 0 warnings |
| Import with dummy credentials, export again | 15 credential references, all linked by name; 40 nodes and all connections identical after the round trip (6/6) |
| Live Schedule Trigger, `vm` | row posted 45 s after the server started; 3 scheduled executions, all successful; still exactly one message and one event (4/4) |
| Live Schedule Trigger, `legacy` | row posted 54 s after the server started; 3 scheduled executions, all successful; still one message and one event (4/4) |

## What the scenarios proved (highlights)

* **Done-when:** an approved row whose `scheduled_for` has passed is posted once, within a minute; two more runs change nothing.
* **Untouched rows:** `pending_approval`, `needs_changes`, `rejected`, `published`, `failed` and not-yet-due rows cause no message, no write and no log row.
* **Asset types:** captions and short posts go to the channel with the waitlist link; the blog teaser has the title, meta description, `/blog/<slug> (demo)` and no article body; the reel brief goes to the owner chat and logs `telegram_owner`; sheet text is HTML-escaped; a 15,000-character body is cut to under 4,000 characters without breaking an entity.
* **Bad rows:** empty body, missing or invalid `scheduled_for`, blog without slug, unknown `asset_type` and a newsletter with an unfillable placeholder are skipped, reported once as `error` events (and in `last_error`), never repeated, and never stop the other rows. After a human fixes a row it publishes and `last_error` is cleared.
* **Telegram failing:** the row becomes `failed` with `last_error`, `publish_failed` is logged, the other row is posted; a failed row is not retried until a human sets it back to `approved`.
* **MAX_POSTS_PER_RUN:** five due rows go out two per run, oldest first, none twice.
* **Newsletter:** 7 active leads at 3 per run take three runs; status goes `approved → publishing → published`, `publish_ref` is `newsletter:7 sent`, every lead is emailed once (consent FALSE, unsubscribed, `email_allowed` FALSE, blocked and customer leads are skipped), thread ids are appended (last 10 kept), the pause between emails is respected (the tests use a 1-second `SEND_DELAY_SECONDS`, so a 3-email run took 3 s; with the default 6 s it is about 3 × (6 + 1) ≈ 21 s, inside the 45 s budget).
* **Gap rule:** a lead emailed less than `MIN_EMAIL_GAP_DAYS` ago waits; the newsletter stays `publishing` and finishes once the gap has passed; `MIN_EMAIL_GAP_DAYS = 0` switches the rule off; with `DEMO_MODE = FALSE` a real half day applies.
* **Safety gate:** `someone@example.com`, `random.person@gmail.com`, `not-an-email` and an empty address are never mailed and the lead becomes `blocked` / `email_allowed FALSE` (only those columns are written); plus-addresses of the demo inbox (also in upper case) are mailed; blocked leads stop counting as waiting.
* **Gmail failing:** `email_failed` is logged, the failing lead's row is unchanged, others are sent, the newsletter is not published while the lead is waiting, the next run tries again, and the Gmail node is never retried inside a run (no duplicates).
* **Back to back:** two consecutive runs give one post and one email per lead.
* **Node failing mid-run:** a CONTENT update that fails twice succeeds on the node's own retry (one message, one event); a dead LEADS read marks the run failed, the post processed earlier is not repeated and the newsletter completes on the next run. A SETTINGS row missing, or a non-numeric number, stops the run with a clear message and writes nothing.
* **Sheets rules:** in every scenario only `content_id, status, published_at, publish_ref, last_error, updated_at` (CONTENT) and `lead_id, last_newsletter_id, last_contacted_at, thread_ids, updated_at` (+ `status, email_allowed` when blocked) (LEADS) were written, and CONTENT/LEADS were only ever updated, never appended.

## Known limits (by design)

* If Sheets stays unreachable for a whole retry cycle *after* a send, that one post or email is not recorded and the next run would send it again (the "act → update" gap of SPEC 5.4). The update node retries 3 times to make this rare.
* Two runs that overlap in time (only possible if a run lasts more than a minute) could both pick the same rows. Keep `MAX_SENDS_PER_RUN × (SEND_DELAY_SECONDS + 3)` under about 45 seconds, as SPEC 5.5 already asks.
