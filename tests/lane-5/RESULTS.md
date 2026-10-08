# Lane 5 · Launch engine: test results

Run on 2026-10-09 with **n8n 1.123.84** (`n8n start`, `GENERIC_TIMEZONE=Asia/Kolkata`), once with the default expression engine (`vm`) and once with `N8N_EXPRESSION_ENGINE=legacy`.

How it was run: the committed lane file is copied, and only in the copy the trigger becomes a Webhook, the Google Sheets / Gmail / Telegram nodes become HTTP nodes talking to a local mock (`tests/lib/mock.mjs`: an in-memory sheet that keeps the real "only the columns you send are written" behaviour, a Gmail that hands out thread ids, a Telegram, and Gemini/Groq endpoints), so every Code, IF, Loop and Wait node of the lane runs unchanged inside the real n8n server. Time is moved forward by shifting every stored timestamp back (`mock.shiftTime`). Re-run with `tests/run-all.sh`.

### Engine: `vm` — 96/96 checks passed

- ✔ **Demo timeline: 2-days post at ~2 min, early-access email + post at launch (3 leads per run), reminder at T0+2, public post at T0+4** (31/31)
- ✔ **A lead who missed the early-access email only gets the latest due step (reminder)** (6/6)
- ✔ **Demo mode with blank DEMO_LAUNCH_AT ends quietly** (2/2)
- ✔ **Real mode: LAUNCH_DATE in the future -> nothing due** (1/1)
- ✔ **Real mode: LAUNCH_DATE in the past -> stale posts skipped, only the latest posted, one launch email (latest step)** (6/6)
- ✔ **Real mode with an invalid LAUNCH_DATE logs an error and does nothing else** (2/2)
- ✔ **Unsubscribed, blocked, customer, consent-FALSE and email_allowed-FALSE leads are skipped** (2/2)
- ✔ **Cross-lane guard (session 5): a lead Lane 4 is about to email is left to Lane 4, then gets the launch email after the gap** (5/5)
- ✔ **Lead in the MIN_EMAIL_GAP_DAYS window waits, then gets the email** (2/2)
- ✔ **A non-allowed address that slipped through is stopped by the safety gate** (4/4)
- ✔ **Telegram failing: broadcast_done_at stays blank, error logged, emails still go out, next run retries the post** (6/6)
- ✔ **Gmail failing: email_failed logged, launch_step not advanced, lead retried on the next run; others unaffected** (3/3)
- ✔ **Missing BRIEF offer_code: no launch email is sent (code can never be guessed), channel post unaffected** (4/4)
- ✔ **A channel template that contains {{offer_code}} is never posted (the code stays private)** (3/3)
- ✔ **Rows with missing/invalid fields are skipped and logged; other rows still processed** (4/4)
- ✔ **Sheets returning numbers/booleans instead of text still works** (1/1)
- ✔ **A node failing mid-run (EVENTS_LOG append) does not cause a repeat post or email** (4/4)
- ✔ **A read failing (LEADS) stops the run before anything is sent; the next run recovers** (3/3)
- ✔ **SETTINGS missing TELEGRAM_CHANNEL_ID: clear error, nothing happens** (3/3)
- ✔ **Run budget: a launch run with one channel post + 3 emails stays under 45 s with the real 6 s pause** (2/2)
- ✔ **Two runs back to back never double-post or double-send** (2/2)

### Engine: `legacy` — 96/96 checks passed

- ✔ **Demo timeline: 2-days post at ~2 min, early-access email + post at launch (3 leads per run), reminder at T0+2, public post at T0+4** (31/31)
- ✔ **A lead who missed the early-access email only gets the latest due step (reminder)** (6/6)
- ✔ **Demo mode with blank DEMO_LAUNCH_AT ends quietly** (2/2)
- ✔ **Real mode: LAUNCH_DATE in the future -> nothing due** (1/1)
- ✔ **Real mode: LAUNCH_DATE in the past -> stale posts skipped, only the latest posted, one launch email (latest step)** (6/6)
- ✔ **Real mode with an invalid LAUNCH_DATE logs an error and does nothing else** (2/2)
- ✔ **Unsubscribed, blocked, customer, consent-FALSE and email_allowed-FALSE leads are skipped** (2/2)
- ✔ **Cross-lane guard (session 5): a lead Lane 4 is about to email is left to Lane 4, then gets the launch email after the gap** (5/5)
- ✔ **Lead in the MIN_EMAIL_GAP_DAYS window waits, then gets the email** (2/2)
- ✔ **A non-allowed address that slipped through is stopped by the safety gate** (4/4)
- ✔ **Telegram failing: broadcast_done_at stays blank, error logged, emails still go out, next run retries the post** (6/6)
- ✔ **Gmail failing: email_failed logged, launch_step not advanced, lead retried on the next run; others unaffected** (3/3)
- ✔ **Missing BRIEF offer_code: no launch email is sent (code can never be guessed), channel post unaffected** (4/4)
- ✔ **A channel template that contains {{offer_code}} is never posted (the code stays private)** (3/3)
- ✔ **Rows with missing/invalid fields are skipped and logged; other rows still processed** (4/4)
- ✔ **Sheets returning numbers/booleans instead of text still works** (1/1)
- ✔ **A node failing mid-run (EVENTS_LOG append) does not cause a repeat post or email** (4/4)
- ✔ **A read failing (LEADS) stops the run before anything is sent; the next run recovers** (3/3)
- ✔ **SETTINGS missing TELEGRAM_CHANNEL_ID: clear error, nothing happens** (3/3)
- ✔ **Run budget: a launch run with one channel post + 3 emails stays under 45 s with the real 6 s pause** (2/2)
- ✔ **Two runs back to back never double-post or double-send** (2/2)
