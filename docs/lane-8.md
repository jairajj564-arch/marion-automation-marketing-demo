# Lane 8 · Report, node by node

This guide explains every node in `lanes/lane-8-report.json`: what it does and **why it is there**, in the style of `NODES.md`. The rules behind the design are in `SPEC.md` (7.8 is this lane, 2.8 lists every metric).

## What Lane 8 does in one paragraph

Every 5 minutes Lane 8 wakes up and asks one question in code: **"is a report due?"** If not, it ends silently. If yes it reads the content, leads and prospects, computes the campaign metrics, writes them to the **DASHBOARD** tab, asks the AI for three short insights based *only* on those numbers, and sends the owner a **Telegram report** with the numbers, the insights and a link to the sheet.

## When is a report due?

Let **L** = the time of the latest `report_sent` event in EVENTS_LOG.

| Mode | Due when |
|---|---|
| Demo mode | there is no report yet, or `now − L ≥ DEMO_REPORT_EVERY_MINUTES` (10 by default) |
| Real mode | `now ≥ today at REPORT_TIME` (21:00) **and** L is before today's `REPORT_TIME` (or there is none) |

The trigger is *not* a daily timer on purpose: the lane runs every 5 minutes and decides in code, so a PC that was off at 21:00 still sends the report when it comes back (SPEC 5.5).

"Period" for the metrics that say *period* means "since L" (all time for the first report).

## The shape of Lane 8

```
Every 5 minutes → Read SETTINGS → Settings to object → Read EVENTS_LOG → Check if report is due → Report due? ─false→ (quiet end)
                                                                                                      │ true
 Read CONTENT → Read LEADS → Read PROSPECTS → Compute metrics → Prepare dashboard rows → Save to DASHBOARD → Back to one item
 → Build AI request → Ask Gemini → Read Gemini reply → Check AI answer → Need Groq fallback? ─true→ Ask Groq → Read Groq reply ─┐
                                        ▲                                       │ false                                        │
                                        └───────────────────────────────────────┼──────────────────────────────────────────────┘
                                                                                ▼
                                       Build report message → Send report → Build log events → Save to EVENTS_LOG
```

---

## The nodes

### Lane 8 · Report *(sticky note, the frame)* and Lane 8 · How the AI step works *(sticky note)*
**What:** the coloured frame (trigger, what the lane reads/writes, credentials) and a note explaining the AI rule.
**Why:** labels the lane on the 8-lane canvas; the validator checks that every lane has one (SPEC 5.8).

### Lane 8 · Every 5 minutes *(Schedule Trigger, cron `50 */5 * * * *`)*
**What:** wakes up at :50 seconds of every fifth minute.
**Why:** see "When is a report due?" above: frequent cheap check + a decision in code.

### Lane 8 · Read SETTINGS *(Google Sheets)* and Lane 8 · Settings to object *(Code)*
**What:** read the SETTINGS tab and turn it into one item (plus `IS_DEMO` and `DAY_MS`). Stops with a clear message if a key such as `TELEGRAM_OWNER_CHAT_ID` is missing.
**Why:** the report schedule (`REPORT_TIME`, `DEMO_REPORT_EVERY_MINUTES`), the owner chat, the AI models and the sheet link are all settings, changed without editing the workflow.

### Lane 8 · Read EVENTS_LOG *(Google Sheets)*
**What:** reads the whole history.
**Why:** it is needed twice: to find the last `report_sent`, and (if a report is due) to count events. The tab is read once; "always output data" keeps an empty log from stopping the lane.

### Lane 8 · Check if report is due *(Code)*
**What:** finds L (the latest `report_sent`) and applies the rule above. Outputs `due` (true/false), `reason` and `period_start` (L as a timestamp, blank for the first report).
**Why:** "is it time?" is the only decision this lane makes before spending anything (sheet reads, AI quota, a Telegram message).

### Lane 8 · Report due? *(IF)*
**What:** true → continue; false → the run simply ends (no log row, no message).
**Why:** SPEC 5.5: a polling run that has nothing to do ends quietly.

### Lane 8 · Read CONTENT / Read LEADS / Read PROSPECTS *(Google Sheets)*
**What:** read the three tabs the metrics are counted from. Only reached when a report is due.
**Why:** reading three tabs every 5 minutes would waste Google quota when nothing is due.

### Lane 8 · Compute metrics *(Code)*
**What:** computes every metric of SPEC 2.8 with the exact `metric_key` names and definitions: content (`content_total`, `content_pending_approval`, `content_approved`, `content_published`, `content_avg_seo_score`), leads (`leads_total`, `leads_new_period`, `leads_hot`, `leads_warm`, `leads_cold`, `leads_avg_score`, `leads_unsubscribed`, `leads_blocked`), email (`emails_sent_total`, `emails_sent_period`, `emails_blocked_total`, `launch_emails_sent`), outreach (`prospects_total`, `prospects_contacted`, `prospects_replied`, `prospects_interested`, `outreach_reply_rate_pct`), inbox (`replies_total`, `hot_alerts_total`), publishing (`channel_posts_total`), AI (`ai_calls_total`, `ai_fallbacks_total`, `ai_failures_total`), system (`errors_period`, `last_report_at`). Averages are rounded to whole numbers; the reply rate has one decimal and is 0 when nobody was contacted (no division by zero).
**Why:** all numbers come from one place, computed from the sheets. Nothing is estimated by the AI.

### Lane 8 · Prepare dashboard rows *(Code)*
**What:** turns the metrics into one row each with only `metric_key`, `value` and `updated_at`.
**Why:** the DASHBOARD tab already has `label`, `unit`, `section` and `notes`. Sending only these three columns means Lane 8 cannot overwrite them (SPEC 5.4).

### Lane 8 · Save to DASHBOARD *(Google Sheets, Append or Update row on `metric_key`)*
**What:** writes each value to the row with the same `metric_key` (adds the row if it is missing).
**Why:** Append-or-Update is the one place the SPEC allows it. It happens *before* the AI and Telegram steps, so the dashboard is updated even if they fail.

### Lane 8 · Back to one item *(Code)*
**What:** the DASHBOARD node returns one item per metric (30 items); this node squeezes them into one item.
**Why:** otherwise the AI call and the Telegram message would run 30 times.

### Lane 8 · Build AI request *(Code)*
**What:** builds the prompt and the request bodies for Gemini (main) and Groq (fallback). The prompt contains **only** the computed metrics as JSON (without the timestamp) and these rules: use only numbers from the JSON, never invent facts, return `{ "insights": [3 strings] }` (what happened, what is working, one recommended action). It also records the list of allowed numbers.
**Why:** sending only numbers means no lead names or emails leave the sheet, and the model cannot make up facts it was never given. Brand voice is added from SETTINGS.

### Lane 8 · Ask Gemini *(HTTP Request)* → Lane 8 · Read Gemini reply *(Code)*
**What:** calls Gemini with the "Kaya Demo · Gemini" credential (3 tries, 5 s apart; an error continues instead of stopping), then extracts the answer text from Gemini's response format.
**Why:** SPEC 5.10. Gemini is the main model (free tier).

### Lane 8 · Check AI answer *(Code)*
**What:** the same check for both providers. It accepts the answer only if it is valid JSON with at least 3 non-empty insights **and every number in the insights is one of the metric values** (so "reply rate 33.3" is fine only if 33.3 is a metric; "grew by 250%" is rejected). A bad Gemini answer sets `try_groq`; a bad Groq answer is an AI failure.
**Why:** this is the "no hallucinated numbers" guarantee. A report that tells the owner a number the sheet does not contain would be worse than no insight.

### Lane 8 · Need Groq fallback? *(IF)* → Lane 8 · Ask Groq (fallback) *(HTTP Request)* → Lane 8 · Read Groq reply *(Code)*
**What:** if Gemini failed or was rejected, the same request goes to Groq (`llama-3.3-70b-versatile` by default), and its answer goes back through *Check AI answer*.
**Why:** a free tier fails now and then; the fallback keeps insights available. If Groq also fails the report goes out without insights and `ai_failed` is logged.

### Lane 8 · Build report message *(Code)*
**What:** writes the Telegram message: `📊 Kaya Jewels · campaign report`, the period, key numbers (content pending/published, leads total/new/hot, emails sent, outreach contacted/replied/interested and reply rate, AI fallbacks, errors), the insights (if any, HTML-escaped), and the sheet link (`SHEET_URL`).
**Why:** the owner reads this on a phone; it needs to be short and use the same numbers as the DASHBOARD.

### Lane 8 · Send report *(Telegram, Send message)*
**What:** sends the message to `TELEGRAM_OWNER_CHAT_ID`. 3 tries; if it still fails, the error output continues so the failure is logged.
**Why:** a Telegram outage must not undo the dashboard update or crash the run.

### Lane 8 · Build log events *(Code)* → Lane 8 · Save to EVENTS_LOG *(Google Sheets, Append row)*
**What:** logs `dashboard_updated` (how many metrics), `ai_call` (+ `ai_fallback` / `ai_failed` when relevant) and then either `report_sent` (with `period_start`) or an `error` saying the Telegram message failed.
**Why:** `report_sent` is what the next due-check looks at. If Telegram failed there is no `report_sent`, so the report is still due and the next run (5 minutes later) tries again. Using only the event types of SPEC 5.6 keeps the counts reliable.

---

## Things you can try in the demo

* Set `DEMO_REPORT_EVERY_MINUTES` to 2 and watch a report arrive every 5-minute run.
* Break the AI (wrong Gemini and Groq keys): the report still arrives, without insights, and the DASHBOARD shows `ai_failures_total` going up.
* Delete `GROQ_MODEL`'s value or Telegram's chat id in SETTINGS: the lane stops with a message naming the missing setting.
