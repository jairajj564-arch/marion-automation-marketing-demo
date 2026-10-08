# Lane 4 · Sequence sender: test results

Run on 2026-10-09 with **n8n 1.123.84** (`n8n start`, `GENERIC_TIMEZONE=Asia/Kolkata`), once with the default expression engine (`vm`) and once with `N8N_EXPRESSION_ENGINE=legacy`.

How it was run: the committed lane file is copied, and only in the copy the trigger becomes a Webhook, the Google Sheets / Gmail / Telegram nodes become HTTP nodes talking to a local mock (`tests/lib/mock.mjs`: an in-memory sheet that keeps the real "only the columns you send are written" behaviour, a Gmail that hands out thread ids, a Telegram, and Gemini/Groq endpoints), so every Code, IF, Loop and Wait node of the lane runs unchanged inside the real n8n server. Time is moved forward by shifting every stored timestamp back (`mock.shiftTime`). Re-run with `tests/run-all.sh`.

### Engine: `vm` — 112/112 checks passed

- ✔ **Full sequence under DEMO_MODE: welcome within a run, then steps 2-4 at 2, 4 and 4 demo-minutes (never twice)** (30/30)
- ✔ **Lead stops mid-sequence when Lane 7 changes the status (replied / hot / unsubscribed) and for other non-nurture statuses** (6/6)
- ✔ **consent FALSE, email_allowed FALSE and status blocked are never emailed** (2/2)
- ✔ **A non-allowed address that slipped into LEADS is stopped by the safety gate** (5/5)
- ✔ **Gmail failing: email_failed logged, seq_step NOT advanced, retried later** (9/9)
- ✔ **Lead inside the MIN_EMAIL_GAP_DAYS window waits (e.g. just got a newsletter)** (3/3)
- ✔ **More due leads than MAX_SENDS_PER_RUN: oldest first, 3 per run, run stays inside the 45 s budget (real 6 s pause)** (6/6)
- ✔ **Missing template placeholder / empty first_name: no send, error logged, row untouched, other leads still go out** (9/9)
- ✔ **Rows with missing/invalid fields are skipped and logged without crashing the run** (5/5)
- ✔ **No active step left: lead is finished without an email (seq_step beyond the last step, or step 2 deactivated)** (7/7)
- ✔ **Empty LEADS tab ends quietly** (2/2)
- ✔ **Sheets returning numbers and real booleans (not text) still works** (2/2)
- ✔ **Real mode (DEMO_MODE FALSE): next step is a real day later** (3/3)
- ✔ **A name with HTML characters is escaped in the body but not in the subject** (2/2)
- ✔ **A node failing mid-run: EVENTS_LOG append fails; the email was already recorded on the lead, so the next run does not resend** (4/4)
- ✔ **A node failing before anything is sent (SEQUENCES read fails): the run stops, nothing is emailed, the next run recovers** (3/3)
- ✔ **SETTINGS missing a required key: clear error, nothing sent** (3/3)
- ✔ **Cross-lane guard (session 5): a lead Lane 7 marks hot/unsubscribed during the run is not emailed and its status is kept** (6/6)
- ✔ **Cross-lane guard (session 5): a lead Lane 5 emailed moments ago (after the pick) waits for the gap** (3/3)
- ✔ **Two runs executed back to back never double-send (with several leads)** (2/2)

### Engine: `legacy` — 112/112 checks passed

- ✔ **Full sequence under DEMO_MODE: welcome within a run, then steps 2-4 at 2, 4 and 4 demo-minutes (never twice)** (30/30)
- ✔ **Lead stops mid-sequence when Lane 7 changes the status (replied / hot / unsubscribed) and for other non-nurture statuses** (6/6)
- ✔ **consent FALSE, email_allowed FALSE and status blocked are never emailed** (2/2)
- ✔ **A non-allowed address that slipped into LEADS is stopped by the safety gate** (5/5)
- ✔ **Gmail failing: email_failed logged, seq_step NOT advanced, retried later** (9/9)
- ✔ **Lead inside the MIN_EMAIL_GAP_DAYS window waits (e.g. just got a newsletter)** (3/3)
- ✔ **More due leads than MAX_SENDS_PER_RUN: oldest first, 3 per run, run stays inside the 45 s budget (real 6 s pause)** (6/6)
- ✔ **Missing template placeholder / empty first_name: no send, error logged, row untouched, other leads still go out** (9/9)
- ✔ **Rows with missing/invalid fields are skipped and logged without crashing the run** (5/5)
- ✔ **No active step left: lead is finished without an email (seq_step beyond the last step, or step 2 deactivated)** (7/7)
- ✔ **Empty LEADS tab ends quietly** (2/2)
- ✔ **Sheets returning numbers and real booleans (not text) still works** (2/2)
- ✔ **Real mode (DEMO_MODE FALSE): next step is a real day later** (3/3)
- ✔ **A name with HTML characters is escaped in the body but not in the subject** (2/2)
- ✔ **A node failing mid-run: EVENTS_LOG append fails; the email was already recorded on the lead, so the next run does not resend** (4/4)
- ✔ **A node failing before anything is sent (SEQUENCES read fails): the run stops, nothing is emailed, the next run recovers** (3/3)
- ✔ **SETTINGS missing a required key: clear error, nothing sent** (3/3)
- ✔ **Cross-lane guard (session 5): a lead Lane 7 marks hot/unsubscribed during the run is not emailed and its status is kept** (6/6)
- ✔ **Cross-lane guard (session 5): a lead Lane 5 emailed moments ago (after the pick) waits for the gap** (3/3)
- ✔ **Two runs executed back to back never double-send (with several leads)** (2/2)
