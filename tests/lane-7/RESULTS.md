# Lane 7 test results

Run on **n8n 1.123.84** (real server, `n8n start`, `GENERIC_TIMEZONE=Asia/Kolkata`), lane imported as a test copy (see [`../README.md`](../README.md)): triggers became webhooks, Google Sheets / Gmail / Telegram became HTTP stubs against a local mock (the sheet state is seeded from `sheets-template/*.csv`), Gemini / Groq were pointed at the mock. Every other node (Code, IF, Switch, Loop Over Items, Wait) is the real node from the real lane file.

_Re-run in session 5 on the merged files (2026-10-09)._

| Engine | Result |
|---|---|
| default (`vm`) | Lane 7 [vm]: 20 scenarios, 159 checks, 0 failed |
| `N8N_EXPRESSION_ENGINE=legacy` | Lane 7 [legacy]: 20 scenarios, 159 checks, 0 failed |

Other checks on the committed lane file:
* `node tools/validate-workflow.mjs lanes/lane-7-inbox.json` -> `✔ valid (0 warning(s))`
* `node tests/_shared/check-syntax.mjs` -> every Code node parses
* `node tests/_shared/import-check.mjs` -> `n8n import:workflow` succeeds and every credential reference is linked by name to the credential with the SPEC name (dummy credentials)

Not verified here (no real accounts in this environment): live calls to Google Sheets, Gmail, Telegram, Gemini and Groq, and the real Gmail Trigger / Form Trigger nodes (their parameters were checked against n8n's node definitions, and the lane imports cleanly). The first real run is the live test.

## Output: default engine (vm)
```text
✔ Lane 7 [vm] · 1 · prospect replies "yes please send the lookbook": interested, follow-ups stop, hot alert, mail marked read (13 checks, 1.7s)
✔ Lane 7 [vm] · 2 · lead replies interested -> hot; unsubscribe / STOP -> stopped forever (lead unsubscribed, prospect do_not_contact) (11 checks, 7.8s)
✔ Lane 7 [vm] · 3 · not interested, question, maybe later (8 checks, 4.8s)
✔ Lane 7 [vm] · 4 · out-of-office auto-reply: logged as out_of_office, row unchanged, no AI, no alert, marked read (9 checks, 2.4s)
✔ Lane 7 [vm] · 5 · unmatched mail: reply_unmatched logged, marked read, nothing else (4 checks, 0.3s)
✔ Lane 7 [vm] · 6 · matching: by thread id, by exact sender address, by sender address without the plus-tag, ambiguous = never guess (7 checks, 4.4s)
✔ Lane 7 [vm] · 7 · low-confidence classification becomes `other`, flagged for a human; confident `other` is not (3 checks, 2.7s)
✔ Lane 7 [vm] · 8 · AI down on both providers: keyword rules classify every reply (14 checks, 16.3s)
✔ Lane 7 [vm] · 9 · Gmail mark-read fails: row still updated, alert still sent, error logged (5 checks, 1.5s)
✔ Lane 7 [vm] · 10 · Telegram fails: row still updated, error logged (not hot_alert_sent) (6 checks, 1.7s)
✔ Lane 7 [vm] · 11 · quoted history is removed before the AI sees it; reply capped at 2000 chars (3 checks, 4.7s)
✔ Lane 7 [vm] · 12 · the same message arriving twice: second time changes nothing and does not alert again (5 checks, 3.0s)
✔ Lane 7 [vm] · 13 · several mails in one poll (mixed kinds, in awkward order) are all handled (7 checks, 2.9s)
✔ Lane 7 [vm] · 14 · status guards: sticky do_not_contact / unsubscribed; hot + question -> replied (SPEC 3.2) (5 checks, 6.0s)
✔ Lane 7 [vm] · 15 · what the AI is sent: temperature 0.2, JSON mode, class enum, facts as context, no discount code (6 checks, 3.1s)
✔ Lane 7 [vm] · 16 · missing setting stops the run clearly; empty LEADS/PROSPECTS tabs still work (3 checks, 0.8s)
✔ Lane 7 [vm] · 16b · malformed mails (no sender, no id, no text, no thread) never crash the run (4 checks, 0.6s)
✔ Lane 7 [vm] · 16c · a failing row update (Sheets) does not stop the other mails; the failure is logged and the alert still goes out (6 checks, 2.7s)
✔ Lane 7 [vm] · 17 · demo reply form: each reply type replies in the same thread with canned text and logs demo_reply_simulated (25 checks, 1.5s)
✔ Lane 7 [vm] · 18 · demo reply form: nothing found / bad answers / failed reply are logged as errors, nothing breaks (15 checks, 1.9s)
Lane 7 [vm]: 20 scenarios, 159 checks, 0 failed
```

## Output: legacy engine
```text
✔ Lane 7 [legacy] · 1 · prospect replies "yes please send the lookbook": interested, follow-ups stop, hot alert, mail marked read (13 checks, 1.6s)
✔ Lane 7 [legacy] · 2 · lead replies interested -> hot; unsubscribe / STOP -> stopped forever (lead unsubscribed, prospect do_not_contact) (11 checks, 7.5s)
✔ Lane 7 [legacy] · 3 · not interested, question, maybe later (8 checks, 4.6s)
✔ Lane 7 [legacy] · 4 · out-of-office auto-reply: logged as out_of_office, row unchanged, no AI, no alert, marked read (9 checks, 1.9s)
✔ Lane 7 [legacy] · 5 · unmatched mail: reply_unmatched logged, marked read, nothing else (4 checks, 0.2s)
✔ Lane 7 [legacy] · 6 · matching: by thread id, by exact sender address, by sender address without the plus-tag, ambiguous = never guess (7 checks, 4.0s)
✔ Lane 7 [legacy] · 7 · low-confidence classification becomes `other`, flagged for a human; confident `other` is not (3 checks, 2.5s)
✔ Lane 7 [legacy] · 8 · AI down on both providers: keyword rules classify every reply (14 checks, 15.9s)
✔ Lane 7 [legacy] · 9 · Gmail mark-read fails: row still updated, alert still sent, error logged (5 checks, 1.3s)
✔ Lane 7 [legacy] · 10 · Telegram fails: row still updated, error logged (not hot_alert_sent) (6 checks, 1.5s)
✔ Lane 7 [legacy] · 11 · quoted history is removed before the AI sees it; reply capped at 2000 chars (3 checks, 4.2s)
✔ Lane 7 [legacy] · 12 · the same message arriving twice: second time changes nothing and does not alert again (5 checks, 2.8s)
✔ Lane 7 [legacy] · 13 · several mails in one poll (mixed kinds, in awkward order) are all handled (7 checks, 2.7s)
✔ Lane 7 [legacy] · 14 · status guards: sticky do_not_contact / unsubscribed; hot + question -> replied (SPEC 3.2) (5 checks, 5.8s)
✔ Lane 7 [legacy] · 15 · what the AI is sent: temperature 0.2, JSON mode, class enum, facts as context, no discount code (6 checks, 2.8s)
✔ Lane 7 [legacy] · 16 · missing setting stops the run clearly; empty LEADS/PROSPECTS tabs still work (3 checks, 0.7s)
✔ Lane 7 [legacy] · 16b · malformed mails (no sender, no id, no text, no thread) never crash the run (4 checks, 0.6s)
✔ Lane 7 [legacy] · 16c · a failing row update (Sheets) does not stop the other mails; the failure is logged and the alert still goes out (6 checks, 2.6s)
✔ Lane 7 [legacy] · 17 · demo reply form: each reply type replies in the same thread with canned text and logs demo_reply_simulated (25 checks, 0.8s)
✔ Lane 7 [legacy] · 18 · demo reply form: nothing found / bad answers / failed reply are logged as errors, nothing breaks (15 checks, 1.0s)
Lane 7 [legacy]: 20 scenarios, 159 checks, 0 failed
```

## "Done when" (SPEC 7.7) checked
| Requirement | Scenario | Result |
|---|---|---|
| a reply "yes please send the lookbook" makes the prospect `interested` and sends a hot alert | 1 | status `interested`, `reply_class` `interested`, `next_action_at` cleared, summary appended to `deal_notes`, `🔥 HOT: ...` Telegram message to the owner chat, mail marked read, `reply_received` + `hot_alert_sent` logged. The Gmail Trigger polls every minute, so this happens within a minute of the mail arriving. |
| a reply "stop" makes it `do_not_contact` and no more emails follow | 2 (and Lane 6 scenario 4) | prospect `do_not_contact`, lead `unsubscribed` (also when the AI misreads STOP as friendly); Lane 6 only picks `new` / `contacted`, so nothing more is sent |
| demo reply form | 17, 18 | each of the 4 reply types replies in the found thread with its canned text and logs `demo_reply_simulated`; bad input, nothing found and a failed reply are logged as `error` |

## Notes about the test setup
* The Gmail Trigger and Form Trigger are replaced by webhooks that deliver the messages / form answers the real triggers would. The real trigger nodes are not exercised (no Google account here).
* "Gmail getAll" for the demo helper returns whatever the mock mailbox holds; the Gmail search syntax (`from:<SENDER_EMAIL> to:<address>`) is asserted but not executed by Gmail.
