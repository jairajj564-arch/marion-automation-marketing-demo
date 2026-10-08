# Lane 3 · Lead engine, node by node

This guide explains every node in `lanes/lane-3-lead-engine.json`: what it does and **why it is there**. It assumes you are new to n8n and have read the "six n8n ideas" at the top of `NODES.md`. The rules behind the design are in `SPEC.md` (section 7.3).

## What Lane 3 does

A visitor fills in the **waitlist form** ("Join the Roshni Edit waitlist"). Lane 3 then:

1. cleans and checks the answers,
2. ignores people who are already on the list,
3. **scores** the lead and puts it in a segment (hot / warm / cold),
4. runs the email address through the **demo safety gate**,
5. adds **one row to the LEADS tab**,
6. writes the events to EVENTS_LOG,
7. pings you on Telegram if the lead is **hot**.

Lane 3 **sends no email**. Lane 4 notices the new row (`next_action_at` = now) and sends the welcome email within about a minute.

## The form URL

Once the workflow is **active** (switch at the top right of n8n), the form lives at `<your n8n address>/form/kaya-waitlist`, for example `http://localhost:5678/form/kaya-waitlist`. That is the value of the SETTINGS key `WAITLIST_FORM_URL`, which every call to action links to. While you are building, the editor's test button opens `/form-test/kaya-waitlist` instead.

## How a lead is scored (max 100)

| Part | Points |
|---|---|
| **Budget** `above_5000` / `3000_5000` / `1500_3000` / `under_1500` | +30 / +25 / +15 / +5 |
| **Occasion** `diwali_outfit` / `gifting` / `wedding_season` / `self_treat` / `just_browsing` | +25 / +20 / +20 / +15 / +0 |
| **Interest** `full_set` / `necklaces` / `earrings` / `bangles` / `gifting` / `maang_tikka` | +15 / +12 / +10 / +10 / +10 / +8 |
| Instagram handle given | +10 |
| WhatsApp number given | +10 |
| Email consent = yes | +10 |

The total is capped at 100. **Segment:** score ≥ `HOT_LEAD_SCORE` (default 70) → `hot`; ≥ `WARM_LEAD_SCORE` (default 40) → `warm`; otherwise `cold`. `score_reason` lists the parts, for example `budget 3000_5000 +25; occasion gifting +20; interest earrings +10; instagram +10; consent +10`. The maximum possible score is exactly 100 (30 + 25 + 15 + 10 + 10 + 10).

## The form fields

| Label (this exact text is the key in the data) | Type | Required | Stored as |
|---|---|---|---|
| `First name` | text | yes | `first_name` |
| `Email` | email | yes | `email`, lower-cased |
| `City` | text | yes | `city` |
| `Instagram handle` | text | no | `instagram_handle`, with an `@` added if missing |
| `WhatsApp number` | text | no | `phone` |
| `I'm shopping for` | dropdown | yes | `interest`: Earrings → earrings · Necklaces → necklaces · Maang tikka → maang_tikka · Bangles → bangles · Gifting → gifting · A full festive set → full_set |
| `My budget` | dropdown | yes | `budget`: Under ₹1,500 → under_1500 · ₹1,500–₹3,000 → 1500_3000 · ₹3,000–₹5,000 → 3000_5000 · Above ₹5,000 → above_5000 |
| `Occasion` | dropdown | yes | `occasion`: My Diwali outfit → diwali_outfit · Gifting → gifting · Wedding season → wedding_season · Treating myself → self_treat · Just browsing → just_browsing |
| `Email consent` | dropdown | yes | `consent`: "Yes, email me about early access and offers" → TRUE · "No thanks" → FALSE |

A person who says "No thanks" is still saved (we still want to know about them) but `consent` is FALSE and `next_action_at` stays blank, so no lane ever emails them.

## The shape of Lane 3

```
Waitlist form → Read SETTINGS → Settings to object → Validate and normalise → Valid submission?
                                                                                │ false → Build error log → Save error to EVENTS_LOG   (stop)
                                                                                │ true
                                                                           Read LEADS → Check duplicate → Is duplicate?
                                                                                                           │ true → Build duplicate log → Save duplicate to EVENTS_LOG   (stop)
                                                                                                           │ false
   Score lead → Demo safety gate → Build lead row → Save to LEADS → Build log events → Save to EVENTS_LOG
        → Build hot alert → Alert owner on Telegram → Build hot alert log → Save alert to EVENTS_LOG
```

---

## The nodes

### Lane 3 · Lead engine *(sticky note)*
**What:** the coloured frame behind the lane: trigger, what it does, tabs it reads and writes, credentials.
**Why:** it labels the lane on the shared canvas. Sticky notes never run.

### Lane 3 · How scoring works *(sticky note)*
**What:** the scoring table on the canvas.
**Why:** so you can explain the scoring in a demo without opening a node.

### Lane 3 · Waitlist form *(Form Trigger)*
**What:** the public form. It has the 9 fields above (text, email and dropdown types only). *Respond when: Form is submitted* means the visitor sees "You're on the list! Check your inbox soon for early-access details." immediately, while the workflow runs in the background. The "automated with n8n" footer is switched off.
**Why:** a Form Trigger is a ready-made web form hosted by n8n itself, with no external form service and no public webhook needed. The data it hands on has the field **labels** as keys (`"First name"`, `"Email"`, …), which is why the labels must stay exactly as they are.

### Lane 3 · Read SETTINGS *(Google Sheets, Read rows)*
**What:** reads every row of the SETTINGS tab.
**Why:** the thresholds (`HOT_LEAD_SCORE`, `WARM_LEAD_SCORE`), the demo inboxes for the safety gate and the owner's Telegram chat id all come from the sheet, so you change them without opening n8n.

### Lane 3 · Settings to object *(Code)*
**What:** turns the rows into one settings item, checks the keys Lane 3 needs (stopping with a clear message such as "The SETTINGS tab is missing a value for: HOT_LEAD_SCORE"), and adds `IS_DEMO` and `DAY_MS`.
**Why:** later nodes can then read `$('Lane 3 · Settings to object').first().json.HOT_LEAD_SCORE`. Going from many items to one also makes the next Sheets node run once.

### Lane 3 · Validate and normalise *(Code)*
**What:** takes the raw answers from the form (it reads them from the trigger node, because the Sheets nodes in between replaced the data) and produces clean values:
* trims spaces; **lower-cases the email** and checks it looks like an address;
* adds `@` to the Instagram handle (`meera.jewels` → `@meera.jewels`, `@@ meera .jewels` → `@meera.jewels`; blank stays blank);
* turns each dropdown label into its stored value (the tables above);
* checks the required fields.

If anything is wrong it returns `ok = false` with a list of plain-English reasons (for example `Email "not-an-email" is not a valid address`, `City is missing`).
**Why:** the browser checks the form, but nothing stops somebody posting to the form URL directly, so the server side checks again. One place cleans everything, so later nodes can trust the data.

### Lane 3 · Valid submission? *(IF)*
**What:** is `ok` true? **True** → continue. **False** → log the problem and stop.
**Why:** a rejected submission must not touch the LEADS tab.

### Lane 3 · Build error log *(Code)*
**What:** builds one `error` event (`Waitlist form rejected: Email … is not a valid address`), with the node name and message in `meta_json`.

### Lane 3 · Save error to EVENTS_LOG *(Google Sheets, Append row)*
**What:** appends it. The run ends: no row, no Telegram message.

### Lane 3 · Read LEADS *(Google Sheets, Read rows)*
**What:** reads every lead once, for the duplicate check. *Always output data* is on, so an **empty tab** still lets the very first lead through.
**Why:** SPEC 5.4: read a tab once, then decide in a Code node.

### Lane 3 · Check duplicate *(Code)*
**What:** looks for the same email in LEADS, ignoring letter case (`Meera@Gmail.com` equals `meera@gmail.com`). It also makes the new `lead_id` (`LD-yyyyMMdd-XXXX`, four random letters or digits) and **re-rolls it if that id already exists**.
**Why:** the same person signing up twice must not get two rows (and two welcome emails).

### Lane 3 · Is duplicate? *(IF)*
**What:** **true** → the duplicate branch. **false** → score the lead.

### Lane 3 · Build duplicate log *(Code)*
**What:** builds a `lead_duplicate` event pointing at the **existing** lead, with the email in `meta_json`.

### Lane 3 · Save duplicate to EVENTS_LOG *(Google Sheets, Append row)*
**What:** appends it. The run ends: no new row, no email.

### Lane 3 · Score lead *(Code)*
**What:** applies the scoring table above and adds `score`, `segment` and `score_reason`.
**Why:** scoring with fixed rules (no AI) is explainable: anyone can see exactly why a lead is hot.

### Lane 3 · Demo safety gate *(Code)*
**What:** the standard gate from SPEC 5.7, copied unchanged. It checks the email against `ALLOWED_DEMO_INBOXES` (plus-addresses of those inboxes are fine), `SENDER_EMAIL` and `ALLOWED_EMAIL_DOMAINS`, and sets `gate_ok`, `safe_to` and `gate_reason`.
**Why:** for a real-looking lead like `someone@example.com` the row is still saved (we want to see it in the demo) but marked blocked, so no lane ever emails it. There is no "Recipient allowed?" IF here because Lane 3 has no Gmail node; the result simply decides `email_allowed`.

### Lane 3 · Build lead row *(Code)*
**What:** builds the new LEADS row with **exactly the 28 columns** of SPEC 2.4, in sheet order: `source = waitlist_form`, `status = new` (or `blocked` when the gate said no), `email_allowed` TRUE/FALSE, `sequence_id = WAITLIST_NURTURE`, `seq_step = 0`, `launch_step = 0`, `next_action_at = now` (blank if blocked or consent is FALSE), and the tracking columns left blank.
**Why:** the append node writes every column it receives, so this node controls precisely what lands in the sheet.

### Lane 3 · Save to LEADS *(Google Sheets, Append row)*
**What:** appends the row (`cellFormat: RAW` so phone numbers and timestamps stay as typed). Retry on fail: 3 tries.
**Why:** this is the moment the lead exists. Everything after it (log, alert) can fail without losing the lead.

### Lane 3 · Build log events *(Code)*
**What:** a `lead_captured` event (meta: score and segment) and, when the lead is blocked, an `email_blocked` event with the gate's reason.

### Lane 3 · Save to EVENTS_LOG *(Google Sheets, Append row)*
**What:** appends those events.

### Lane 3 · Build hot alert *(Code)*
**What:** if the lead's segment is `hot`, it builds the message `🔥 New hot lead: <first name> (<city>), score <n>` for `TELEGRAM_OWNER_CHAT_ID` (HTML-escaped). Otherwise it returns nothing and the run ends here.
**Why:** warm and cold leads do not need a ping.

### Lane 3 · Alert owner on Telegram *(Telegram, Send message)*
**What:** sends it with the credential `Kaya Demo · Telegram Bot`. *Retry on fail*: 3 tries. *On error → continue*: if Telegram is down the run still goes on to the next node.
**Why:** the lead is already saved and logged, so a Telegram hiccup must never lose it.

### Lane 3 · Build hot alert log *(Code)*
**What:** if Telegram answered → a `hot_alert_sent` event; if not → an `error` event naming this node and the reason.

### Lane 3 · Save alert to EVENTS_LOG *(Google Sheets, Append row)*
**What:** appends it. The run ends.

---

## Settings Lane 3 reads

`DEMO_MODE`, `DEMO_MINUTES_PER_DAY`, `SENDER_EMAIL`, `ALLOWED_DEMO_INBOXES`, `ALLOWED_EMAIL_DOMAINS` (optional), `TELEGRAM_OWNER_CHAT_ID`, `HOT_LEAD_SCORE`, `WARM_LEAD_SCORE`.

## Things to know when you run it

* **Activate the workflow** before sharing the form link; the production URL does not work while the workflow is inactive.
* **A rejected or crashed submission is not shown to the visitor.** The form says "You're on the list!" as soon as the answers arrive (that is what *Form is submitted* means). If a later step fails, the problem is in EVENTS_LOG (validation) or in n8n's **Executions** list (a Google outage), not on the visitor's screen.
* **Two identical submissions in the same second** can both read LEADS before either writes, and both be saved. Normal sign-ups are seconds apart, so this does not happen in practice.
* To test without a browser, use the form page itself. In a demo, use `kayademo.customers+test1@gmail.com`-style addresses so the welcome email lands in your demo inbox.
