# Lane 8 · Report: test results

Run on 2026-10-09 with **n8n 1.123.84** (`n8n start`, `GENERIC_TIMEZONE=Asia/Kolkata`), once with the default expression engine (`vm`) and once with `N8N_EXPRESSION_ENGINE=legacy`.

How it was run: the committed lane file is copied, and only in the copy the trigger becomes a Webhook, the Google Sheets / Gmail / Telegram nodes become HTTP nodes talking to a local mock (`tests/lib/mock.mjs`: an in-memory sheet that keeps the real "only the columns you send are written" behaviour, a Gmail that hands out thread ids, a Telegram, and Gemini/Groq endpoints), so every Code, IF, Loop and Wait node of the lane runs unchanged inside the real n8n server. Time is moved forward by shifting every stored timestamp back (`mock.shiftTime`). Re-run with `tests/run-all.sh`.

### Engine: `vm` — 105/105 checks passed

- ✔ **Not due (demo mode, last report 3 min ago, every 10): quiet end, nothing written** (3/3)
- ✔ **First ever report (no report_sent), demo mode: every metric_key gets a value and the Telegram report arrives** (16/16)
- ✔ **Full sample data: metrics match an independent hand count of the CSVs** (29/29)
- ✔ **Period handling: with an earlier report, "period" metrics only count events after it** (6/6)
- ✔ **Due in demo mode: last report older than DEMO_REPORT_EVERY_MINUTES (12 > 10)** (2/2)
- ✔ **Real mode: due after REPORT_TIME when none sent today; not due before REPORT_TIME; not due twice a day** (5/5)
- ✔ **Empty tabs: all zeros, no division by zero, outreach_reply_rate_pct = 0** (5/5)
- ✔ **Both AI providers fail: dashboard + numbers are still sent (no insights), ai_failed logged** (5/5)
- ✔ **Gemini fails, Groq answers: insights used, ai_fallback logged with the reason** (4/4)
- ✔ **AI answer containing an invented number is rejected (Gemini -> Groq); if Groq invents too, report goes out without insights** (7/7)
- ✔ **AI answers that are not valid JSON / have too few insights count as failures; markdown fences are tolerated** (3/3)
- ✔ **AI request carries ONLY the metrics (no leads, no emails, no sheet text) and the right provider settings** (5/5)
- ✔ **Telegram failing: DASHBOARD is still written, error logged, no report_sent, so the next run tries again** (7/7)
- ✔ **A node failing mid-run (DASHBOARD write fails): run errors, nothing sent, next run recovers** (3/3)
- ✔ **SETTINGS missing a key: clear error, nothing happens** (3/3)
- ✔ **Text from sheets/AI is HTML-escaped in the Telegram message** (1/1)
- ✔ **Sheets returning numbers/booleans instead of text still works** (1/1)

### Engine: `legacy` — 105/105 checks passed

- ✔ **Not due (demo mode, last report 3 min ago, every 10): quiet end, nothing written** (3/3)
- ✔ **First ever report (no report_sent), demo mode: every metric_key gets a value and the Telegram report arrives** (16/16)
- ✔ **Full sample data: metrics match an independent hand count of the CSVs** (29/29)
- ✔ **Period handling: with an earlier report, "period" metrics only count events after it** (6/6)
- ✔ **Due in demo mode: last report older than DEMO_REPORT_EVERY_MINUTES (12 > 10)** (2/2)
- ✔ **Real mode: due after REPORT_TIME when none sent today; not due before REPORT_TIME; not due twice a day** (5/5)
- ✔ **Empty tabs: all zeros, no division by zero, outreach_reply_rate_pct = 0** (5/5)
- ✔ **Both AI providers fail: dashboard + numbers are still sent (no insights), ai_failed logged** (5/5)
- ✔ **Gemini fails, Groq answers: insights used, ai_fallback logged with the reason** (4/4)
- ✔ **AI answer containing an invented number is rejected (Gemini -> Groq); if Groq invents too, report goes out without insights** (7/7)
- ✔ **AI answers that are not valid JSON / have too few insights count as failures; markdown fences are tolerated** (3/3)
- ✔ **AI request carries ONLY the metrics (no leads, no emails, no sheet text) and the right provider settings** (5/5)
- ✔ **Telegram failing: DASHBOARD is still written, error logged, no report_sent, so the next run tries again** (7/7)
- ✔ **A node failing mid-run (DASHBOARD write fails): run errors, nothing sent, next run recovers** (3/3)
- ✔ **SETTINGS missing a key: clear error, nothing happens** (3/3)
- ✔ **Text from sheets/AI is HTML-escaped in the Telegram message** (1/1)
- ✔ **Sheets returning numbers/booleans instead of text still works** (1/1)
