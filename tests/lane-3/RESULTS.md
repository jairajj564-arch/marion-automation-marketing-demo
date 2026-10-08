# Lane 3 · test results

Lane 3 (`lanes/lane-3-lead-engine.json`) was run end to end inside a **real n8n 1.123.84 server** (`n8n start`, `GENERIC_TIMEZONE=Asia/Kolkata`, `127.0.0.1`), once with the default expression engine (`vm`) and once with `N8N_EXPRESSION_ENGINE=legacy`. Every check below passed on both.

## How it was tested

* The **real Form Trigger is kept**. The test submits the form over HTTP exactly like a browser (multipart POST to `/form/kaya-waitlist`, fields `field-0 … field-8`, dropdown values are the option texts shown on the form page), so the field labels, option texts, completion message and the label-keyed output are all exercised for real.
* `tests/common/harness.mjs` builds a **test copy** in which only Google Sheets and Telegram are replaced by HTTP Request nodes talking to the local mock (`tests/common/mock-server.mjs`). Node names, ids, connections, Code/IF nodes and node settings (retries, error handling) are the committed ones; Telegram retry waits are 200 ms instead of 3 s in the copy. The committed lane JSON is never modified.
* The mock keeps the sheet tabs in memory and applies the same rules as the real Sheets nodes (an unknown column would create a new sheet column and is recorded as a **violation**; append with "ignore extra data"). It can be told to fail Telegram or Sheets calls.
* Because a Form Trigger gives no "finished" signal, a test waits until the workflow has called the mock and then until the mock has been quiet for 1.5 s (5 s when node retries are expected). Execution status and error text come from n8n's own database.
* The import test (`tests/common/import-test.mjs`) is shared with Lane 2; see `tests/lane-2/RESULTS.md`.
* Not covered here (no real accounts in this environment): live calls to Google Sheets and Telegram.

Run it yourself (see `tests/lane-2/RESULTS.md` for the scratch install):

```bash
export KAYA_SCRATCH=<folder that contains n8n/node_modules/.bin/n8n>
node tests/lane-3/run.mjs vm
node tests/lane-3/run.mjs legacy
```

## Results (checks passed / total)

| Scenario | `vm` engine | `legacy` engine |
|---|---|---|
| Done-when 1: kayademo.customers+test1@gmail.com creates one new row | 13/13 | 13/13 |
| Hot, warm and cold leads (scores and segments) | 11/11 | 11/11 |
| Every dropdown option maps to its stored value; scores match the SPEC table | 9/9 | 9/9 |
| Done-when 3: same email twice (different letter case) creates one row | 4/4 | 4/4 |
| Done-when 2: someone@example.com is saved as blocked | 6/6 | 6/6 |
| Plus-address of the demo inbox is allowed; other addresses are blocked | 2/2 | 2/2 |
| Instagram handle gets an @ | 3/3 | 3/3 |
| Invalid or missing values are rejected and logged (no row) | 5/5 | 5/5 |
| Empty LEADS tab (the Sheets read returns nothing) | 2/2 | 2/2 |
| Telegram failing: the lead is still saved and logged | 3/3 | 3/3 |
| Node failing mid-run: LEADS append fails twice, the node retries and succeeds (no double row) | 1/1 | 1/1 |
| Node failing mid-run: LEADS read is down for good (nothing half-written) | 2/2 | 2/2 |
| SETTINGS missing a key: clear error, nothing written | 3/3 | 3/3 |
| Custom thresholds come from SETTINGS | 1/1 | 1/1 |
| **Total** | **65/65** | **65/65** |

| Other test | Result |
|---|---|
| `node tools/validate-workflow.mjs lanes/lane-3-lead-engine.json` | ✔ valid, 0 warnings |
| Import with dummy credentials, export again | 8 credential references, all linked by name; 24 nodes and all connections identical after the round trip (6/6) |

## What the scenarios proved (highlights)

* **Done-when 1:** submitting `kayademo.customers+test1@gmail.com` creates exactly one `new` row with `email_allowed TRUE`, an `LD-yyyyMMdd-XXXX` id, `source waitlist_form`, `sequence_id WAITLIST_NURTURE`, `seq_step 0`, `launch_step 0`, `next_action_at` = now, every other tracking column blank, and every one of the 28 LEADS columns present. One `lead_captured` event, no email, no Telegram message (the lead was not hot). The form page shows the title, the description, the friendly completion message and no n8n attribution.
* **Done-when 2:** `someone@example.com` creates a `blocked` row (`email_allowed FALSE`, `next_action_at` blank) and logs `lead_captured` + `email_blocked` with the gate's reason.
* **Done-when 3:** the same email submitted three times (different letter case, with spaces) creates one row; two `lead_duplicate` events point at the original lead; LEADS was written once.
* **Scoring:** a hot (100), warm (65) and cold (13) lead score exactly as in SPEC 7.3 with the expected `score_reason` strings; all 6 interests, 4 budgets and 5 occasions were submitted and each stored value and score matched an independent re-implementation of the table; `HOT_LEAD_SCORE` / `WARM_LEAD_SCORE` are read from SETTINGS.
* **Consent "No thanks":** the row is saved with `consent FALSE` and a blank `next_action_at`.
* **Hot alert:** one Telegram message to the owner chat, HTML-escaped (`Hina &lt;b&gt;&amp; (Mumbai &amp; Pune)`), one `hot_alert_sent` event; no message for warm or cold leads.
* **Gate:** a plus-address of the demo inbox and the bare demo inbox are allowed; `random.person@gmail.com` and a plus-address on another domain are blocked.
* **Instagram handle:** `meera.jewels` → `@meera.jewels`, `@@  meera .jewels ` → `@meera.jewels`, blank stays blank and earns no points.
* **Invalid submissions:** an invalid email, an empty email, a blank city, an empty first name and `a@b@c.com` are rejected: no row, five `error` events whose detail names the field, nothing else logged.
* **Empty LEADS tab:** the very first lead is saved.
* **Telegram failing:** the hot lead is still saved and `lead_captured` is logged; the failure is logged as an `error` event naming the Telegram node instead of `hot_alert_sent`.
* **Node failing mid-run:** a LEADS append that fails twice succeeds on the node's own retry (one row, one event); a LEADS read that is down for good ends the run with an error in n8n's Executions list and writes nothing; a SETTINGS row missing (`HOT_LEAD_SCORE`) stops the run with a message naming the key.
* **Sheets rules:** no scenario wrote an unknown column.

## Known limits (by design)

* The visitor sees "You're on the list!" as soon as the answers arrive (*Respond: form is submitted*, as SPEC 7.3 requires). A later failure is visible in EVENTS_LOG (validation) or n8n's Executions list (an outage), not to the visitor.
* Two identical submissions in the same second could both read LEADS before either writes and be saved twice. Sequential duplicates (the realistic case) are caught.
