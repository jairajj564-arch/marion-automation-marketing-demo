# Lane 6 test results

Run on **n8n 1.123.84** (real server, `n8n start`, `GENERIC_TIMEZONE=Asia/Kolkata`), lane imported as a test copy (see [`../README.md`](../README.md)): triggers became webhooks, Google Sheets / Gmail / Telegram became HTTP stubs against a local mock (the sheet state is seeded from `sheets-template/*.csv`), Gemini / Groq were pointed at the mock. Every other node (Code, IF, Switch, Loop Over Items, Wait) is the real node from the real lane file.

| Engine | Result |
|---|---|
| default (`vm`) | Lane 6 [vm]: 19 scenarios, 146 checks, 0 failed |
| `N8N_EXPRESSION_ENGINE=legacy` | Lane 6 [legacy]: 19 scenarios, 146 checks, 0 failed |

Other checks on the committed lane file:
* `node tools/validate-workflow.mjs lanes/lane-6-outreach.json` -> `✔ valid (0 warning(s))`
* `node tests/_shared/check-syntax.mjs` -> every Code node parses
* `node tests/_shared/import-check.mjs` -> `n8n import:workflow` succeeds and every credential reference is linked by name to the credential with the SPEC name (dummy credentials)

Not verified here (no real accounts in this environment): live calls to Google Sheets, Gmail, Telegram, Gemini and Groq, and the real Gmail Trigger / Form Trigger nodes (their parameters were checked against n8n's node definitions, and the lane imports cleanly). The first real run is the live test.

## Output: default engine (vm)
```text
✔ Lane 6 [vm] · 1 · the 12 sample prospects: 3 per run, highest fit_score first, personalised, one email each (26 checks, 27.2s)
✔ Lane 6 [vm] · 2 · full 3-step sequence in demo time (6 and 8 demo minutes), then silence (14 checks, 5.3s)
✔ Lane 6 [vm] · 3 · statuses that must never be contacted (replied, interested, do_not_contact, paused, ...) (3 checks, 6.7s)
✔ Lane 6 [vm] · 4 · a prospect whose status turns interested / replied / do_not_contact mid-sequence gets nothing more (9 checks, 8.3s)
✔ Lane 6 [vm] · 5 · blocked address (someone@example.com): status blocked, email_allowed FALSE, nothing sent to it (5 checks, 18.9s)
✔ Lane 6 [vm] · 6 · AI down on both providers: template opener, email still sent, ai_failed logged (8 checks, 8.1s)
✔ Lane 6 [vm] · 7 · AI opener rules: invented price / digits / two sentences / too long / forbidden phrase are rejected (22 checks, 19.6s)
✔ Lane 6 [vm] · 8 · Gmail failing for one prospect: email_failed, no step advance, retried later, others unaffected (8 checks, 13.3s)
✔ Lane 6 [vm] · 9 · a prospect inside the gap window is skipped until MIN_EMAIL_GAP_DAYS has passed (3 checks, 1.5s)
✔ Lane 6 [vm] · 10 · rows with missing/invalid fields are skipped and logged, never crash the run (11 checks, 13.4s)
✔ Lane 6 [vm] · 11 · two runs back to back: nobody gets the same step twice (2 checks, 13.3s)
✔ Lane 6 [vm] · 12 · mixed failures in one run (Gemini down, one Gmail failure, one bad row) (5 checks, 7.4s)
✔ Lane 6 [vm] · 13 · EVENTS_LOG write fails mid-run: no email is ever repeated after the crash (6 checks, 9.7s)
✔ Lane 6 [vm] · 14 · template problems: unknown placeholder and the discount code are never rendered; nothing is sent (3 checks, 1.3s)
✔ Lane 6 [vm] · 15 · special characters in names are HTML-escaped in the body, plain in the subject (2 checks, 2.4s)
✔ Lane 6 [vm] · 16 · nothing due: quiet run (no emails, no AI, no log rows); empty PROSPECTS tab too (4 checks, 0.3s)
✔ Lane 6 [vm] · 17 · sequence with no further step is closed; MAX_SENDS_PER_RUN is respected; missing setting stops the run clearly (5 checks, 3.2s)
✔ Lane 6 [vm] · 18 · what the AI is sent: BRIEF facts only, the one prospect, JSON mode, thinking budget, no discount code (7 checks, 2.3s)
✔ Lane 6 [vm] · 19 · Groq request shape when Gemini fails (3 checks, 2.7s)
Lane 6 [vm]: 19 scenarios, 146 checks, 0 failed
```

## Output: legacy engine
```text
✔ Lane 6 [legacy] · 1 · the 12 sample prospects: 3 per run, highest fit_score first, personalised, one email each (26 checks, 26.6s)
✔ Lane 6 [legacy] · 2 · full 3-step sequence in demo time (6 and 8 demo minutes), then silence (14 checks, 5.1s)
✔ Lane 6 [legacy] · 3 · statuses that must never be contacted (replied, interested, do_not_contact, paused, ...) (3 checks, 6.6s)
✔ Lane 6 [legacy] · 4 · a prospect whose status turns interested / replied / do_not_contact mid-sequence gets nothing more (9 checks, 7.7s)
✔ Lane 6 [legacy] · 5 · blocked address (someone@example.com): status blocked, email_allowed FALSE, nothing sent to it (5 checks, 19.0s)
✔ Lane 6 [legacy] · 6 · AI down on both providers: template opener, email still sent, ai_failed logged (8 checks, 8.0s)
✔ Lane 6 [legacy] · 7 · AI opener rules: invented price / digits / two sentences / too long / forbidden phrase are rejected (22 checks, 18.4s)
✔ Lane 6 [legacy] · 8 · Gmail failing for one prospect: email_failed, no step advance, retried later, others unaffected (8 checks, 13.2s)
✔ Lane 6 [legacy] · 9 · a prospect inside the gap window is skipped until MIN_EMAIL_GAP_DAYS has passed (3 checks, 1.3s)
✔ Lane 6 [legacy] · 10 · rows with missing/invalid fields are skipped and logged, never crash the run (11 checks, 13.4s)
✔ Lane 6 [legacy] · 11 · two runs back to back: nobody gets the same step twice (2 checks, 13.1s)
✔ Lane 6 [legacy] · 12 · mixed failures in one run (Gemini down, one Gmail failure, one bad row) (5 checks, 7.4s)
✔ Lane 6 [legacy] · 13 · EVENTS_LOG write fails mid-run: no email is ever repeated after the crash (6 checks, 9.5s)
✔ Lane 6 [legacy] · 14 · template problems: unknown placeholder and the discount code are never rendered; nothing is sent (3 checks, 1.2s)
✔ Lane 6 [legacy] · 15 · special characters in names are HTML-escaped in the body, plain in the subject (2 checks, 2.2s)
✔ Lane 6 [legacy] · 16 · nothing due: quiet run (no emails, no AI, no log rows); empty PROSPECTS tab too (4 checks, 0.3s)
✔ Lane 6 [legacy] · 17 · sequence with no further step is closed; MAX_SENDS_PER_RUN is respected; missing setting stops the run clearly (5 checks, 3.0s)
✔ Lane 6 [legacy] · 18 · what the AI is sent: BRIEF facts only, the one prospect, JSON mode, thinking budget, no discount code (7 checks, 2.3s)
✔ Lane 6 [legacy] · 19 · Groq request shape when Gemini fails (3 checks, 2.4s)
Lane 6 [legacy]: 19 scenarios, 146 checks, 0 failed
```

## "Done when" (SPEC 7.6) checked
| Requirement | Scenario | Result |
|---|---|---|
| the 12 sample prospects each get a personalised first email, 3 per run, highest `fit_score` first | 1 | 4 runs x 3 emails, order B04 (90), I01 (88), I04 (86) first, every email has the AI opener with the business name, 12 different recipients |
| follow-ups after 6 and 8 demo minutes | 2 | `next_action_at - last_contacted_at` = exactly 360 s after step 1 and 480 s after step 2 (3 and 4 days x 2 minutes) |
| nothing is sent after a reply | 3, 4 | prospects with status `replied`, `interested`, `do_not_contact`, `paused`, ... get nothing; a prospect turned `interested` / `replied` / `do_not_contact` mid-sequence gets no further email |

## Notes about the test setup
* The Sheets stub sends one HTTP request per item. n8n's retry of a node repeats the items it had already sent, whereas the real Google Sheets node appends all items in one batch call, so in scenario 13 the failing log writes are made to fail every time (persistent outage) rather than once.
* In scenario 13 the run really ends with an execution error (`Lane 6 · Save to EVENTS_LOG`), the prospect whose log line was lost has already been updated and is **not** emailed again by the next run.
