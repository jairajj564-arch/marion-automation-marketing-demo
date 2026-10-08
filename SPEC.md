# SPEC: Kaya Jewels Diwali campaign demo (Marion Enroute)

**Version 1.1 · written in session 1, cross-lane rules added in session 5 (marked "session 5") · this file is the contract for every lane.**

The whole project is **one n8n canvas with 8 lanes**. Each lane has its own trigger, is not connected to any other lane, and sits inside its own sticky-note frame. Lanes only "talk" through one Google Sheet. Sessions 2–4 build lanes in parallel without seeing each other, so **everything a lane needs to agree on with another lane is written here**. If this spec and your idea disagree, follow the spec. If the spec is silent, choose the simplest option and write it down in `PROGRESS.md` under "Open decisions".

Words used below: **MUST** = required for the merge to work. **SHOULD** = strongly recommended. "Lane N" = the lane being built.

The fake client is **Kaya Jewels**, a handmade jewellery seller on Instagram (India). The campaign is the **Diwali launch of "The Roshni Edit"**: the waitlist gets early access plus 10% off.

Contents
1. Credentials
2. The Google Sheet (8 tabs, every column)
3. Pipelines and status values
4. SETTINGS keys
5. Shared conventions (naming, time, demo clock, Sheets rules, logging, safety, layout, IDs, AI pattern, templates, node versions)
6. Kaya Jewels brand facts and campaign brief
7. Lane responsibilities (Lanes 1–8)
8. Merge checklist (session 5)

---

## 1. Credentials

No real keys or tokens ever go into this repo. Nodes reference credentials **by name only**, with an empty id:

```json
"credentials": { "googleSheetsOAuth2Api": { "id": null, "name": "Kaya Demo · Google Sheets" } }
```

When the workflow is imported or saved, n8n links each reference to the credential with the **same name and type** (verified on n8n 1.123.84: the CLI import's `replaceInvalidCredentials` and the editor's `matchCredentials` both match by name when the id is empty). **The id MUST be `null`, not `""` (session 5):** the editor's *Import from File* first deletes every reference whose id is not a known credential and only spares `id: null`, so `""` loses all credentials on a UI import (CLI import works with both). So the owner creates these six credentials **first**, copy-pasting the names exactly (the `·` is a middle dot, U+00B7):

| # | Credential name (exact) | n8n credential type (JSON key) | Shown in n8n as | Used by |
|---|---|---|---|---|
| 1 | `Kaya Demo · Google Sheets` | `googleSheetsOAuth2Api` | Google Sheets OAuth2 API | every lane |
| 2 | `Kaya Demo · Gmail Sender` | `gmailOAuth2` | Gmail OAuth2 API | Lanes 2, 4, 5, 6 (send) and 7 (read replies, mark read). This is the "Kaya Jewels" mailbox (SETTINGS `SENDER_EMAIL`). |
| 3 | `Kaya Demo · Gmail Demo Customers` | `gmailOAuth2` | Gmail OAuth2 API | Lane 7 demo reply simulator only. This is the inbox that receives every demo lead/prospect email (`kayademo.customers@gmail.com` and its plus-addresses). |
| 4 | `Kaya Demo · Gemini` | `googlePalmApi` | Google Gemini(PaLM) Api | Lanes 1, 6, 7, 8 (main AI). Free key from Google AI Studio. |
| 5 | `Kaya Demo · Groq` | `groqApi` | Groq | Lanes 1, 6, 7, 8 (fallback AI). Free key from console.groq.com. |
| 6 | `Kaya Demo · Telegram Bot` | `telegramApi` | Telegram API | Lanes 1, 2, 3, 5, 7, 8. Bot from @BotFather; the bot must be an admin of the demo channel. |

Gemini and Groq are called with the core **HTTP Request** node using "Predefined credential type" (`authentication: "predefinedCredentialType"`, `nodeCredentialType: "googlePalmApi"` or `"groqApi"`). Gemini's credential adds `?key=` to the URL; Groq's adds `Authorization: Bearer …`. Both verified against n8n 1.123.84.

---

## 2. The Google Sheet

One spreadsheet named **`Kaya Jewels · Diwali demo (Marion Enroute)`** with exactly these 8 tabs (tab names are case-sensitive): `SETTINGS`, `BRIEF`, `CONTENT`, `LEADS`, `PROSPECTS`, `SEQUENCES`, `EVENTS_LOG`, `DASHBOARD`.

Templates for every tab are in `sheets-template/<TAB>.csv` (header row + sample rows). Import each CSV into its tab with **File → Import → Upload → "Replace current sheet"** and **untick "Convert text to numbers, dates, and formulas"**, so timestamps, phone numbers and `TRUE`/`FALSE` stay plain text.

In n8n every Google Sheets node points at the spreadsheet with the placeholder id `__KAYA_SHEET_ID__` (resource locator `{"__rl": true, "mode": "id", "value": "__KAYA_SHEET_ID__"}`) and at the tab **by name** (`{"__rl": true, "mode": "name", "value": "LEADS"}`). Before importing, the owner replaces `__KAYA_SHEET_ID__` everywhere with the real id (the long part of the sheet URL between `/d/` and `/edit`).

### 2.0 Data types used in the tables

| Type | How it is written | How readers MUST parse it |
|---|---|---|
| `text` | Any UTF-8 text, may contain line breaks. | as is |
| `id` | Text in the formats of section 5.9. | as is, exact match |
| `int` / `number` | Written by lanes as JS numbers. | `Number(value)`. Cells may come back as numbers or numeric text. |
| `bool` | The text `TRUE` or `FALSE` (upper case). | `String(value).trim().toUpperCase() === 'TRUE'` (a cell a human typed may come back as a real boolean). |
| `timestamp` | `yyyy-MM-dd'T'HH:mm:ssZZ` in Asia/Kolkata, e.g. `2026-10-08T14:32:05+05:30`. Blank = not set. | `parseTs()` from section 5.2 (also accepts a few human formats). |
| `date` | `yyyy-MM-dd`, e.g. `2026-10-26`. | `parseDate()` from section 5.2. |
| `time` | `HH:mm` 24-hour, Asia/Kolkata. | split on `:` |
| `enum` | One of the listed values, lower snake_case. | exact match |
| `csv` | Comma-separated list, spaces around commas allowed. | `split(',').map(s => s.trim()).filter(Boolean)` |
| `json` | Compact JSON text. | `JSON.parse`, with a try/catch |

The **"Written by"** column says which lane (or the human, "H") may write a column. A lane MUST NOT write columns it does not own. Every tab's first column is its unique key.

### 2.1 SETTINGS

Key/value tab. One row per setting. Full key list with defaults: section 4.

| Column | Type | Allowed values | Written by | Notes |
|---|---|---|---|---|
| `key` | text | UPPER_SNAKE_CASE, unique | H | |
| `value` | text | depends on `type` | H | Lanes read, never write. |
| `type` | enum | `boolean`, `integer`, `number`, `text`, `timestamp`, `date`, `time`, `csv`, `url`, `email`, `chat_id` | H | documentation only |
| `description` | text | | H | |

Example row: `MAX_SENDS_PER_RUN | 3 | integer | Max emails one run of a sending lane (2, 4, 5, 6) may send. …`

### 2.2 BRIEF

The single source of facts for every AI prompt (section 6). Key/value with an `ai_use` tag.

| Column | Type | Allowed values | Written by | Notes |
|---|---|---|---|---|
| `key` | text | lower_snake_case, unique | H | Some keys are also template placeholders (5.11). |
| `value` | text | | H | May contain the tokens `{{launch_date}}`, `{{public_launch_date}}`, `{{waitlist_form_url}}`; lanes fill them before use. |
| `section` | enum | `brand`, `product`, `campaign`, `policy`, `offer`, `audience`, `rules`, `seo`, `b2b` | H | grouping only |
| `ai_use` | enum | `all`, `consumer`, `b2b`, `rule`, `none` | H | `all` = fact for every prompt · `consumer` = fact for customer-facing lanes (1, 2, 4, 5, 7) · `b2b` = fact for outreach (Lane 6) · `rule` = writing rule for every prompt · `none` = machine use only, never sent to AI |
| `notes` | text | | H | |

Example row: `product_1 | Roshni Kundan Jhumkas: gold-plated brass jhumkas with kundan-style stones and freshwater pearl drops. ₹2,450. | product | all | `

### 2.3 CONTENT

One row per content item. Lane 1 creates rows, a human approves, Lane 2 publishes.

| Column | Type | Allowed values | Written by | Notes |
|---|---|---|---|---|
| `content_id` | id | `CNT-yyyyMMdd-HHmmss-NN` | 1 | key |
| `batch_id` | id | `B-yyyyMMdd-HHmmss` | 1 | one Lane 1 run |
| `created_at` | timestamp | | 1 | |
| `asset_type` | enum | `blog_article`, `ig_caption`, `reel_idea`, `newsletter`, `short_post` | 1 | |
| `channel` | enum | `blog`, `instagram`, `reels`, `email` | 1 | blog_article→blog · ig_caption→instagram · short_post→instagram · reel_idea→reels · newsletter→email |
| `title` | text | | 1, H | blog: H1 · caption: hook (first line) · reel: idea name · newsletter: **email subject** · short_post: angle |
| `body` | text | | 1, H | blog: full Markdown · caption: caption text **without** hashtags · reel: reel caption · newsletter: **HTML body** containing `{{first_name}}` and `{{unsubscribe_line}}` · short_post: post text (≤ 280 chars) |
| `hashtags` | text | `#Tag` words separated by single spaces | 1, H | blog and newsletter: blank |
| `cta` | text | | 1, H | call-to-action sentence used |
| `media_notes` | text | | 1, H | caption: image idea · reel: `Hook: …` / `Shots:` numbered lines / `Audio: …` / `Length: N seconds` |
| `seo_title` | text | ≤ 60 chars | 1, H | blog only |
| `meta_description` | text | | 1, H | blog: meta description (≤ 155) · newsletter: inbox **preview text** |
| `slug` | text | `lowercase-with-hyphens` | 1, H | blog only |
| `target_keyword` | text | lower case | 1, H | blog only, from BRIEF `seo_keywords` |
| `seo_score` | int | 0–100 | 1 | blog: SEO score · others: format/quality score. Each FACT problem costs 10 points. |
| `issues` | text | problems joined with ` \| ` | 1 | blank = none. Fact problems start with `FACT:` and come first. |
| `scheduled_for` | timestamp | | 1, H | when Lane 2 may publish it (demo clock applies, 5.3) |
| `status` | enum | see 3.1 | 1, H, 2 | |
| `source_content_id` | id | | 1 | short_post: the blog's `content_id`; else blank |
| `ai_provider` | enum | `gemini`, `groq` | 1 | which AI wrote it |
| `review_notes` | text | | H | why rejected / what to change |
| `published_at` | timestamp | | 2 | |
| `publish_ref` | text | `tg:<message_id>` or `newsletter:<N> sent` | 2 | |
| `last_error` | text | | 2 | last publishing error |
| `updated_at` | timestamp | | 1, 2 | |

Example row (shortened): `CNT-20261008-143205-02 | B-20261008-143205 | 2026-10-08T14:32:05+05:30 | ig_caption | instagram | Something is glowing in our Jaipur studio ✨ | Something is glowing… Join the waitlist (link in bio)… | #KayaJewels #RoshniEdit #HandmadeJewellery | Join the waitlist (link in bio)… | Close-up of an artisan's hands… | | | | | 100 | | 2026-10-09T19:00:00+05:30 | pending_approval | | gemini | | | | | 2026-10-08T14:32:05+05:30`

### 2.4 LEADS

Waitlist sign-ups (B2C). Lane 3 creates rows; Lanes 2, 4, 5, 7 update them.

| Column | Type | Allowed values | Written by | Notes |
|---|---|---|---|---|
| `lead_id` | id | `LD-yyyyMMdd-XXXX` | 3 | key |
| `created_at` | timestamp | | 3 | |
| `source` | enum | `waitlist_form`, `sample_data`, `manual` | 3, H | |
| `first_name` | text | | 3 | |
| `email` | text | lower case | 3 | must pass the safety gate to ever be emailed (5.7) |
| `phone` | text | free text | 3 | optional (WhatsApp number) |
| `city` | text | | 3 | |
| `instagram_handle` | text | `@handle` or blank | 3 | |
| `interest` | enum | `earrings`, `necklaces`, `maang_tikka`, `bangles`, `gifting`, `full_set` | 3 | |
| `budget` | enum | `under_1500`, `1500_3000`, `3000_5000`, `above_5000` | 3 | |
| `occasion` | enum | `diwali_outfit`, `gifting`, `wedding_season`, `self_treat`, `just_browsing` | 3 | |
| `consent` | bool | | 3 | `FALSE` = never email |
| `email_allowed` | bool | | 3, 2, 4, 5 | result of the safety gate; a sending lane sets `FALSE` when the gate blocks |
| `score` | int | 0–100 | 3 | rules in 7.3 |
| `segment` | enum | `hot`, `warm`, `cold` | 3 | from SETTINGS `HOT_LEAD_SCORE` / `WARM_LEAD_SCORE` |
| `score_reason` | text | e.g. `budget 3000_5000 +25; occasion gifting +20; …` | 3 | |
| `status` | enum | see 3.2 | 3, 4, 7, H (+2, 4, 5 for `blocked`) | |
| `sequence_id` | enum | `WAITLIST_NURTURE` | 3 | |
| `seq_step` | int | 0 = nothing sent yet | 4 | last nurture step **sent** |
| `next_action_at` | timestamp | blank = nothing scheduled | 3, 4, 7 | when Lane 4 should send the next step |
| `last_contacted_at` | timestamp | | 2, 4, 5 | last automated email of **any** lane (used for `MIN_EMAIL_GAP_DAYS`) |
| `launch_step` | int | 0 = none | 5 | highest LAUNCH_BROADCAST **email** step sent |
| `last_newsletter_id` | id | a `content_id` | 2 | last newsletter this lead received |
| `thread_ids` | csv | Gmail thread ids | 2, 4, 5 | append after every send, keep the last 10; Lane 7 matches replies with it |
| `last_reply_at` | timestamp | | 7 | |
| `reply_class` | enum | `interested`, `question`, `not_now`, `not_interested`, `unsubscribe`, `out_of_office`, `other` | 7 | latest reply |
| `notes` | text | | H, 7 | Lane 7 may append `[date] AI summary` |
| `updated_at` | timestamp | | every writer | |

Example row: `LD-20261003-A7K2 | 2026-10-03T10:14:22+05:30 | sample_data | Ananya | kayademo.customers+lead01@gmail.com | +91 00000 00001 | Mumbai | @ananya.styles_demo | earrings | 1500_3000 | diwali_outfit | TRUE | TRUE | 80 | hot | budget 1500_3000 +15; occasion diwali_outfit +25; interest earrings +10; instagram +10; phone +10; consent +10 | nurturing | WAITLIST_NURTURE | 2 | 2026-10-06T10:15:12+05:30 | 2026-10-04T10:15:12+05:30 | 0 | | | | | | 2026-10-04T10:15:12+05:30`

### 2.5 PROSPECTS

Boutiques (stockist deals) and micro-influencers (collabs). Created by a human (or the sample data); Lane 6 emails them; Lane 7 reads replies.

| Column | Type | Allowed values | Written by | Notes |
|---|---|---|---|---|
| `prospect_id` | id | `PR-Bnn` (boutique), `PR-Inn` (influencer) | H | key |
| `type` | enum | `boutique`, `micro_influencer` | H | |
| `business_name` | text | boutique name or creator page name | H | |
| `contact_name` | text | | H | |
| `email` | text | lower case | H | demo data uses `kayademo.customers+boutiqueN@gmail.com` / `+influencerN` |
| `instagram_handle` | text | | H | |
| `city` | text | | H | |
| `followers` | int | blank for boutiques | H | |
| `niche` | text | | H | |
| `notes` | text | | H | facts the AI may use for the personal opener (and nothing else about the prospect) |
| `fit_score` | int | 0–100 | H | Lane 6 contacts higher scores first |
| `email_allowed` | bool | | H, 6 | advisory; the safety gate at send time decides |
| `sequence_id` | enum | `OUTREACH_BOUTIQUE`, `OUTREACH_INFLUENCER` | H | |
| `status` | enum | see 3.3 | 6, 7, H | |
| `seq_step` | int | 0 = nothing sent | 6 | last outreach step sent |
| `next_action_at` | timestamp | blank = due now (for `new`) | 6, 7 | |
| `last_contacted_at` | timestamp | | 6 | |
| `thread_ids` | csv | | 6 | as in LEADS |
| `last_reply_at` | timestamp | | 7 | |
| `reply_class` | enum | as in LEADS | 7 | |
| `deal_notes` | text | | H, 7 | Lane 7 appends `[date] AI summary` lines |
| `updated_at` | timestamp | | 6, 7, H | |

Example row: `PR-B01 | boutique | Saanjh Boutique | Shalini Rao | kayademo.customers+boutique1@gmail.com | @saanjh.boutique_demo | Pune | | Handloom sarees and festive wear | Stocks handwoven Paithani and Chanderi sarees; … | 85 | TRUE | OUTREACH_BOUTIQUE | new | 0 | | | | | | | 2026-10-07T18:00:00+05:30`

### 2.6 SEQUENCES

Email (and launch post) templates. Read by Lanes 2, 4, 5, 6. Only Lane 5 writes (`broadcast_done_at`).

| Column | Type | Allowed values | Written by | Notes |
|---|---|---|---|---|
| `step_key` | id | `<sequence_id>#<step>` | H | key |
| `sequence_id` | enum | `WAITLIST_NURTURE` (Lane 4), `LAUNCH_BROADCAST` (Lane 5), `OUTREACH_BOUTIQUE`, `OUTREACH_INFLUENCER` (Lane 6) | H | |
| `step` | int | 1, 2, 3 … | H | |
| `channel` | enum | `email`, `telegram_channel` | H | `telegram_channel` only in LAUNCH_BROADCAST |
| `delay_days` | number | may be negative or fractional | H | meaning depends on `delay_basis`; scaled by the demo clock |
| `delay_basis` | enum | `previous_step`, `launch` | H | `previous_step`: days after the previous step was sent (step 1: after enrolment) · `launch`: days relative to the launch moment (5.3) |
| `subject_template` | text | placeholders (5.11) | H | blank for `telegram_channel` |
| `body_template` | text | placeholders (5.11) | H | email: simple HTML · telegram_channel: Telegram HTML (`<b>`, `<i>`, line breaks) |
| `ai_personalize` | bool | | H | `TRUE` = the lane must produce `{{ai_opener}}` with AI (Lane 6 only) |
| `active` | bool | | H | `FALSE` = skip this step |
| `broadcast_done_at` | timestamp | | 5 | `telegram_channel` steps only: set when posted (or skipped as stale) |
| `notes` | text | | H | |

Example row: `OUTREACH_BOUTIQUE#2 | OUTREACH_BOUTIQUE | 2 | email | 3 | previous_step | Re: {{business_name}} x Kaya Jewels for Diwali? | <p>Hi {{contact_name}},</p>… | FALSE | TRUE | | Follow-up 1.`

### 2.7 EVENTS_LOG

Append-only history. Every lane appends; nobody edits. Lane 8 builds the report from it. Rules in 5.6.

| Column | Type | Allowed values | Notes |
|---|---|---|---|
| `event_id` | id | `EV-yyyyMMddHHmmssSSS-XXXX` | key |
| `ts` | timestamp | | |
| `lane` | int | 1–8 | |
| `event_type` | enum | closed list in 5.6 | |
| `entity_type` | enum | `content`, `batch`, `lead`, `prospect`, `sequence`, `ai`, `report`, `system` | |
| `entity_id` | text | the key of the row acted on | |
| `status_from` | text | | blank if no status change |
| `status_to` | text | | blank if no status change |
| `channel` | enum | `email`, `telegram_owner`, `telegram_channel`, `sheet`, `ai`, `form`, `gmail_inbox` | |
| `detail` | text | ≤ 200 chars, human readable | |
| `meta_json` | json | compact JSON object | |
| `execution_id` | text | `$execution.id` | `sample` in template rows |
| `demo_mode` | bool | | value of `DEMO_MODE` at the time |

Example row: `EV-20261003101505000-S009 | 2026-10-03T10:15:05+05:30 | 4 | email_sent | lead | LD-20261003-A7K2 | new | nurturing | email | WAITLIST_NURTURE step 1 sent | {"sequence_id":"WAITLIST_NURTURE","step":1} | sample | FALSE`

### 2.8 DASHBOARD

One row per metric. Lane 8 writes `value` and `updated_at` with **Append or Update** matched on `metric_key`.

| Column | Type | Notes |
|---|---|---|
| `metric_key` | id | key, fixed list below |
| `label` | text | human label |
| `value` | number or timestamp | written by Lane 8 |
| `unit` | enum | `count`, `score`, `percent`, `timestamp` |
| `section` | enum | `content`, `leads`, `email`, `outreach`, `inbox`, `publishing`, `ai`, `system` |
| `updated_at` | timestamp | written by Lane 8 |
| `notes` | text | how it is computed |

Metric keys and definitions ("period" = since the previous `report_sent` event; all time if none):

| metric_key | Definition |
|---|---|
| `content_total` | rows in CONTENT |
| `content_pending_approval` | status = `pending_approval` |
| `content_approved` | status ∈ {`approved`, `publishing`} |
| `content_published` | status = `published` |
| `content_avg_seo_score` | mean `seo_score`, 0 decimals |
| `leads_total` | rows in LEADS |
| `leads_new_period` | `lead_captured` events in period |
| `leads_hot` | segment = `hot` or status = `hot` |
| `leads_warm` / `leads_cold` | segment = `warm` / `cold` |
| `leads_avg_score` | mean `score`, 0 decimals |
| `leads_unsubscribed` | status = `unsubscribed` |
| `leads_blocked` | status = `blocked` |
| `emails_sent_total` / `emails_sent_period` | `email_sent` events, all time / period |
| `emails_blocked_total` | `email_blocked` events, all time |
| `launch_emails_sent` | `email_sent` events with lane = 5 |
| `prospects_total` | rows in PROSPECTS |
| `prospects_contacted` | `seq_step` ≥ 1 |
| `prospects_replied` | status ∈ {`replied`, `interested`, `not_interested`, `do_not_contact`, `won`, `lost`} |
| `prospects_interested` | status ∈ {`interested`, `won`} |
| `outreach_reply_rate_pct` | prospects_replied / prospects_contacted × 100, 1 decimal (0 if none contacted) |
| `replies_total` | `reply_received` events |
| `hot_alerts_total` | `hot_alert_sent` events |
| `channel_posts_total` | `content_published` events with channel `telegram_channel` + `launch_post_published` events |
| `ai_calls_total` / `ai_fallbacks_total` / `ai_failures_total` | `ai_call` / `ai_fallback` / `ai_failed` events |
| `errors_period` | `error` events in period |
| `last_report_at` | timestamp of this report |

---

## 3. Pipelines and status values

A lane may only move a row along the arrows it owns below. Anything else is a human action in the sheet.

### 3.1 Content (`CONTENT.status`)

`pending_approval` · `approved` · `needs_changes` · `rejected` · `publishing` · `published` · `failed`

| From | To | Who | When |
|---|---|---|---|
| (new row) | `pending_approval` | Lane 1 | content generated |
| `pending_approval` | `approved` / `rejected` / `needs_changes` | Human | review in the sheet |
| `needs_changes` | `pending_approval` | Human | after editing the row |
| `approved` | `published` | Lane 2 | Telegram post sent (blog, caption, short post, reel brief) |
| `approved` | `publishing` | Lane 2 | newsletter broadcast started |
| `publishing` | `published` | Lane 2 | no eligible lead is left without this newsletter |
| `approved` / `publishing` | `failed` | Lane 2 | publishing failed after retries (`last_error` set) |
| `failed` | `approved` | Human | to retry |

### 3.2 Leads (`LEADS.status`)

`new` · `nurturing` · `nurture_done` · `replied` · `hot` · `unsubscribed` · `blocked` · `customer`

"Active" leads (may receive newsletters and launch emails) = status ∈ {`new`, `nurturing`, `nurture_done`, `replied`, `hot`} **and** `consent` = TRUE **and** `email_allowed` ≠ FALSE.

| From | To | Who | When |
|---|---|---|---|
| (new row) | `new` | Lane 3 | form submitted, email passes the safety gate |
| (new row) | `blocked` | Lane 3 | email fails the safety gate (row still saved, never emailed) |
| `new` | `nurturing` | Lane 4 | a nurture step was sent and more steps remain |
| `new` / `nurturing` | `nurture_done` | Lane 4 | the last nurture step was sent (or no further active step) |
| any active | `blocked` | Lanes 2, 4, 5 | the safety gate blocks the address at send time |
| `new` / `nurturing` / `nurture_done` / `replied` | `hot` | Lane 7 | reply classified `interested` |
| `new` / `nurturing` / `nurture_done` / `hot` | `replied` | Lane 7 | reply classified `question`, `not_now` or `other` |
| any | `unsubscribed` | Lane 7 | reply classified `unsubscribe` or `not_interested` |
| any | `customer` | Human | placed an order |

Lane 4 only processes `new` and `nurturing`, so a reply automatically stops the nurture sequence. Lane 7 also clears `next_action_at` when it moves a lead to `hot`, `replied` or `unsubscribed`. `out_of_office` changes nothing.

### 3.3 Prospects / outreach (`PROSPECTS.status`)

`new` · `contacted` · `sequence_done` · `replied` · `interested` · `not_interested` · `do_not_contact` · `blocked` · `paused` · `won` · `lost`

| From | To | Who | When |
|---|---|---|---|
| (new row) | `new` | Human | prospect added |
| `new` | `contacted` | Lane 6 | step 1 sent (more steps remain) |
| `contacted` | `contacted` | Lane 6 | a follow-up sent (more steps remain) |
| `new` / `contacted` | `sequence_done` | Lane 6 | last step sent |
| `new` / `contacted` | `blocked` | Lane 6 | safety gate blocked the address |
| `contacted` / `sequence_done` | `replied` | Lane 7 | reply classified `question`, `not_now` or `other` |
| `contacted` / `sequence_done` / `replied` | `interested` | Lane 7 | reply classified `interested` (hot alert) |
| `contacted` / `sequence_done` / `replied` | `not_interested` | Lane 7 | reply classified `not_interested` |
| any | `do_not_contact` | Lane 7 | reply classified `unsubscribe` |
| any | `paused` | Human | Lane 6 skips paused rows |
| `replied` / `interested` | `won` / `lost` | Human | deal outcome |

Lane 6 only processes `new` and `contacted`. Lane 7 clears `next_action_at` on every status change it makes.

---

## 4. SETTINGS keys

Lanes read SETTINGS at the start of every run (so changes apply without editing the workflow) and never write it. Defaults are in `sheets-template/SETTINGS.csv`.

| Key | Default | Type | Meaning | Read by |
|---|---|---|---|---|
| `DEMO_MODE` | `TRUE` | boolean | `TRUE` = compress time for live demos (5.3) | all |
| `DEMO_MINUTES_PER_DAY` | `2` | number | real minutes that represent 1 day in demo mode (1 day = 2 minutes) | all |
| `DEMO_LAUNCH_AT` | *(blank)* | timestamp | demo mode only: the real moment early access "opens" (set it ~15 min ahead before a demo). Blank = Lane 5 does nothing in demo mode | 5, 8 |
| `LAUNCH_DATE` | `2026-10-26` | date | **placeholder** real early-access launch date | 1, 2, 4, 5, 6, 8 |
| `LAUNCH_TIME` | `10:00` | time | launch time of day (IST) | 1, 5 |
| `EARLY_ACCESS_DAYS` | `2` | integer | public launch = launch + this many days | 1, 2, 4, 5, 6 |
| `TIMEZONE` | `Asia/Kolkata` | text | informational, do not change | – |
| `SHEET_URL` | `https://docs.google.com/spreadsheets/d/__KAYA_SHEET_ID__/edit` | url | link used in Telegram messages | 1, 3, 7, 8 |
| `WAITLIST_FORM_URL` | `http://localhost:5678/form/kaya-waitlist` | url | the Lane 3 form; every CTA links here | 1, 2, 4, 5, 6 |
| `SENDER_NAME` | `Kaya Jewels (Demo)` | text | display name on every email | 2, 4, 5, 6 |
| `SENDER_EMAIL` | `kayademo.hello@gmail.com` | email | **placeholder** address of the Gmail Sender account; always allowed by the safety gate; Lane 7 ignores mail from it | 2, 4, 5, 6, 7 |
| `ALLOWED_EMAIL_DOMAINS` | *(blank)* | csv | domains you own for demos (every address on them is allowed). Public domains (gmail.com, yahoo.com, outlook.com, …) are ignored even if listed | gate (5.7) |
| `ALLOWED_DEMO_INBOXES` | `kayademo.customers@gmail.com` | csv | demo inboxes; mail may go to these and their plus-addresses only | gate (5.7) |
| `MAX_SENDS_PER_RUN` | `3` | integer | max emails per run of a sending lane | 2, 4, 5, 6 |
| `SEND_DELAY_SECONDS` | `6` | integer | pause between two emails in one run | 2, 4, 5, 6 |
| `MIN_EMAIL_GAP_DAYS` | `0.5` | number | minimum gap between two automated emails to the same person (scaled) | 2, 4, 5, 6 |
| `MAX_POSTS_PER_RUN` | `2` | integer | max Telegram posts per Lane 2 run | 2 |
| `TELEGRAM_OWNER_CHAT_ID` | `000000000` | chat_id | **placeholder** your private chat with the bot (approvals, alerts, reports) | 1, 2, 3, 7, 8 |
| `TELEGRAM_CHANNEL_ID` | `@kayajewels_demo` | chat_id | **placeholder** the channel that stands in for Instagram | 2, 5 |
| `BRAND_VOICE` | *see CSV* | text | brand voice injected into every AI prompt | 1, 6, 7, 8 |
| `GEMINI_MODEL` | `gemini-2.5-flash` | text | main model (Google AI Studio free tier) | 1, 6, 7, 8 |
| `GEMINI_THINKING_BUDGET` | `1024` | integer | cap on Gemini 2.5 "thinking" tokens (they count against the answer's token budget). Blank = not sent (for models without thinking) | 1, 6, 7, 8 |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | text | fallback model (Groq free tier) | 1, 6, 7, 8 |
| `AI_TEMPERATURE` | `0.7` | number | creativity (use 0.2 for classification in Lane 7) | 1, 6, 8 |
| `AI_WAIT_SECONDS` | `6` | integer | pause between AI calls in a loop | 1, 6, 7, 8 |
| `POST_TIMES` | `11:00,19:00` | csv | daily posting slots used by Lane 1 | 1 |
| `CONTENT_START_IN_DAYS` | `1` | integer | first new post this many days after a Lane 1 run | 1 |
| `HOT_LEAD_SCORE` | `70` | integer | score ≥ this → `hot` | 3, 8 |
| `WARM_LEAD_SCORE` | `40` | integer | score ≥ this → `warm`, else `cold` | 3, 8 |
| `REPORT_TIME` | `21:00` | time | real mode: daily report time | 8 |
| `DEMO_REPORT_EVERY_MINUTES` | `10` | integer | demo mode: report every N real minutes | 8 |
| `UNSUBSCRIBE_LINE` | `Not for you? Just reply "unsubscribe" and we will not email you again.` | text | value of `{{unsubscribe_line}}` | 2, 4, 5, 6 |

A lane MUST stop with a clear error if a key it needs is missing (see `Lane 1 · Settings to object`).

---

## 5. Shared conventions

### 5.1 Node naming

* Every node name (sticky notes included) is `Lane N · Short action in sentence case`, e.g. `Lane 3 · Score lead`, `Lane 4 · Send nurture email`. The separator is space, middle dot `·` (U+00B7), space.
* Names are unique across the whole canvas (the lane prefix guarantees it).
* IF nodes are questions ending with `?`: `Lane 4 · Recipient allowed?`.
* Standard names every lane reuses: `Lane N · Read SETTINGS`, `Lane N · Settings to object`, `Lane N · Read <TAB>`, `Lane N · Demo safety gate`, `Lane N · Recipient allowed?`, `Lane N · Build log events`, `Lane N · Save to EVENTS_LOG`.
* The lane's frame sticky note is named `Lane N · <Lane title>` (e.g. `Lane 2 · Publisher`).
* Lane titles: 1 Content engine · 2 Publisher · 3 Lead engine · 4 Sequence sender · 5 Launch engine · 6 Outreach · 7 Inbox · 8 Report.

### 5.2 Time zone, timestamps, parsing

* Workflow setting `timezone` = `Asia/Kolkata`; every timestamp a lane writes uses Asia/Kolkata.
* Format: `yyyy-MM-dd'T'HH:mm:ssZZ` (Luxon), e.g. `2026-10-08T14:32:05+05:30`. Dates: `yyyy-MM-dd`.
* Copy these helpers into Code nodes that need them (Luxon's `DateTime` and `$now` are available in Code nodes):

```js
const TZ = 'Asia/Kolkata';
const STAMP = "yyyy-MM-dd'T'HH:mm:ssZZ";
const nowTs = () => $now.setZone(TZ).toFormat(STAMP);
// Accepts our own format plus what a human or Google Sheets might produce.
function parseTs(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const text = String(value).trim();
  const tries = [
    () => DateTime.fromISO(text, { zone: TZ }),
    () => DateTime.fromFormat(text, 'yyyy-MM-dd HH:mm:ss', { zone: TZ }),
    () => DateTime.fromFormat(text, 'yyyy-MM-dd HH:mm', { zone: TZ }),
    () => DateTime.fromFormat(text, 'dd/MM/yyyy HH:mm:ss', { zone: TZ }),
    () => DateTime.fromFormat(text, 'dd/MM/yyyy', { zone: TZ }),
  ];
  for (const attempt of tries) { const d = attempt(); if (d.isValid) return d.setZone(TZ); }
  return null;
}
const parseDate = (value) => parseTs(value)?.startOf('day') ?? null;
```

### 5.3 Demo clock (DEMO_MODE)

Every delay measured in days or hours goes through the demo clock. With `DEMO_MODE = TRUE` and `DEMO_MINUTES_PER_DAY = 2`, **1 day = 2 real minutes**, 1 hour = 5 seconds.

`Lane N · Settings to object` adds two derived fields (copy the code from Lane 1):

* `IS_DEMO` (boolean) = `DEMO_MODE` is TRUE
* `DAY_MS` (number) = `IS_DEMO ? DEMO_MINUTES_PER_DAY × 60 000 : 86 400 000`

Rules:

```js
// "N days from now" (N may be fractional or negative)
const addDays = (dateTime, days) => dateTime.plus({ milliseconds: Number(days) * S.DAY_MS });
// A real calendar target (e.g. "tomorrow 11:00") in demo mode keeps its distance from now, squeezed:
const toDemo = (realTarget, now) => S.IS_DEMO
  ? now.plus({ milliseconds: Math.max(0, realTarget.toMillis() - now.toMillis()) * (S.DAY_MS / 86400000) })
  : realTarget;
// The launch moment used for timing (Lane 5, Lane 8). null = not set.
function launchAt(S) {
  if (S.IS_DEMO) return parseTs(S.DEMO_LAUNCH_AT);
  const [hour, minute] = String(S.LAUNCH_TIME).split(':').map(Number);
  return parseDate(S.LAUNCH_DATE)?.set({ hour, minute }) ?? null;
}
const publicLaunchAt = (S) => launchAt(S) && addDays(launchAt(S), Number(S.EARLY_ACCESS_DAYS));
// Gap rule before ANY automated email to a person:
const gapOk = (row, now) => !parseTs(row.last_contacted_at) || now.toMillis() - parseTs(row.last_contacted_at).toMillis() >= Number(S.MIN_EMAIL_GAP_DAYS) * S.DAY_MS;
```

* **One email per gap across lanes (session 5).** `gapOk` only sees emails already written to the row, and the minute lanes overlap (Lane 2 starts at :00, Lane 4 at :15, Lane 5 at :30, each may run ~45 s). So Lanes 2 (newsletter) and 5 (launch emails) leave a lead to Lane 4 while its nurture email is due within the next minute:
  ```js
  const reservedForNurture = (lead) => ['new', 'nurturing'].includes(lead.status) && (!parseTs(lead.next_action_at) || parseTs(lead.next_action_at).toMillis() <= now.toMillis() + 60000);
  ```
  and Lane 4 re-reads the row right before sending (5.4), so an email Lane 2/5 just sent is seen by the gap rule.
* **Dates shown to people** (emails, posts, AI prompts) always use the real `LAUNCH_DATE`, formatted `cccc, d LLLL` (e.g. `Monday, 26 October`), even in demo mode. Only *timing* is compressed.
* No lane changes behaviour because of the demo clock except through these helpers.

### 5.4 Google Sheets rules (database discipline)

* Node: Google Sheets **v4.5**, credential `Kaya Demo · Google Sheets`, document `__KAYA_SHEET_ID__` by id, tab by name.
* **Read**: `operation: "read"`, `options: {}` (returns every row as an item plus `row_number`). Read a tab once per run, then filter in a Code node. A Read node outputs **0 items** for an empty tab, which ends that branch; set `alwaysOutputData: true` if the lane must continue anyway.
* **Append**: `operation: "append"`, `columns.mappingMode: "autoMapInputData"`, `options: { "cellFormat": "RAW", "handlingExtraData": "ignoreIt" }`. The Code node before it outputs **exactly** the tab's columns.
* **Update**: `operation: "update"`, `columns.mappingMode: "autoMapInputData"`, `columns.matchingColumns: ["<key column>"]`, `options: { "cellFormat": "RAW" }`. The Code node before it outputs **only the key column plus the columns this lane owns and is changing**. Only those cells are written (verified in the n8n 1.123 source), so lanes never overwrite each other's columns. To clear a cell write `""`; `null`/missing = leave as is.
* **Append or Update** (`appendOrUpdate`) only for DASHBOARD (Lane 8).
* Always match on the key column (`content_id`, `lead_id`, `prospect_id`, `step_key`, `metric_key`), never on `row_number` (humans sort and filter the sheet).
* `cellFormat: "RAW"` everywhere so Sheets never turns our text into dates or formulas.
* Sheets nodes: `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 3000`.
* **Re-read before send (session 5)**: Lanes 4 and 6, which write `status` that Lane 7 also writes, read their tab again right before the safety gate (`Lane N · Re-read LEADS/PROSPECTS` → `Lane N · Check … is still due` → `Lane N · Still due?`). If the row changed since the pick (status, `seq_step`, gap), the item goes back to the loop: nothing is sent, written or logged. A reply Lane 7 records mid-run therefore stops the email and Lane 7's status is never overwritten.
* **Never send twice**: in every per-item loop the order is *act → update that row → log*, with nothing slow in between. The update for one person happens before the next person is processed. A crash can therefore lose at most one log line, never cause a second email for the same step.

### 5.5 Triggers, schedules and waits (built to survive power cuts)

* No Wait node may pause longer than **60 seconds**, and only in `timeInterval` mode with unit `seconds`. Delays of hours or days are **always** a timestamp column (`next_action_at`, `scheduled_for`, launch offsets) plus a Schedule Trigger that checks "is it due?". If the PC was off, the next run simply picks up everything that became due.
* Polling lanes use Schedule Trigger **v1.2** with a cron expression (6 fields, with seconds) so they never start at the same second:

| Lane | Trigger node | Cron / poll | Budget per run |
|---|---|---|---|
| 1 | Manual Trigger `Lane 1 · Start` | click (the only Manual Trigger on the canvas; n8n allows one) | – |
| 2 | `Lane 2 · Every minute` | `0 * * * * *` | ≤ 45 s |
| 3 | Form Trigger `Lane 3 · Waitlist form` | on submit | ≤ 10 s |
| 4 | `Lane 4 · Every minute` | `15 * * * * *` | ≤ 45 s |
| 5 | `Lane 5 · Every minute` | `30 * * * * *` | ≤ 45 s |
| 6 | `Lane 6 · Every 2 minutes` | `45 */2 * * * *` | ≤ 100 s (AI per prospect) |
| 7 | Gmail Trigger `Lane 7 · New email in sender inbox` | poll `everyMinute` | – |
| 8 | `Lane 8 · Every 5 minutes` | `50 */5 * * * *` | – |

  Schedule Trigger parameters: `{ "rule": { "interval": [ { "field": "cronExpression", "expression": "15 * * * * *" } ] } }`.
* Keep runs short: `MAX_SENDS_PER_RUN × (SEND_DELAY_SECONDS + 3)` must stay under the budget. A polling run that finds nothing to do ends quietly (no log, no message).
* Per-item loops use **Loop Over Items** (`splitInBatches` v3, `batchSize: 1`). Output 0 = **done**, output 1 = **loop**.

### 5.6 EVENTS_LOG (how every lane logs)

* Log one row per **action** (email sent, post published, row created, AI call, alert). Polling lanes that did nothing log nothing.
* Build rows in a Code node `Lane N · Build log events` (or inline in the loop) and append with `Lane N · Save to EVENTS_LOG` (rules in 5.4). In per-item loops, log inside the loop right after the row update.
* Columns exactly as in 2.7. Builder to copy:

```js
const S = $('Lane N · Settings to object').first().json;   // use your lane's node name
const TZ = 'Asia/Kolkata';
const now = $now.setZone(TZ);
const used = new Set();
function eventId() {
  let id;
  do { id = `EV-${now.toFormat('yyyyMMddHHmmssSSS')}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')}`; } while (used.has(id));
  used.add(id);
  return id;
}
function event({ event_type, entity_type, entity_id = '', status_from = '', status_to = '', channel = '', detail = '', meta = {} }) {
  return {
    event_id: eventId(), ts: now.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"), lane: N,   // N = your lane number
    event_type, entity_type, entity_id, status_from, status_to, channel,
    detail: String(detail).slice(0, 200), meta_json: JSON.stringify(meta),
    execution_id: String($execution.id), demo_mode: S.IS_DEMO ? 'TRUE' : 'FALSE',
  };
}
```

* Closed list of `event_type` values (Lane 8 counts these; do not invent new ones without adding them here):

| event_type | Lanes | entity_type | channel | meta_json must include |
|---|---|---|---|---|
| `lane_run` | 1 | system | sheet | items_created, ai_jobs, ai_failed, ai_fallbacks, duration_seconds |
| `content_generated` | 1 | content | sheet | batch_id, asset_type, seo_score, issue_count, ai_provider, scheduled_for |
| `approval_requested` | 1 | batch | telegram_owner | items, telegram_ok |
| `ai_call` | 1, 6, 7, 8 | ai | ai | provider, model, ok, purpose/job_type |
| `ai_fallback` | 1, 6, 7, 8 | ai | ai | reason |
| `ai_failed` | 1, 6, 7, 8 | ai | ai | error |
| `content_published` | 2 | content | telegram_channel / telegram_owner / email | publish_ref |
| `publish_failed` | 2 | content | telegram_channel / email | error |
| `lead_captured` | 3 | lead | form | score, segment |
| `lead_duplicate` | 3 | lead | form | email |
| `hot_alert_sent` | 3, 7 | lead / prospect | telegram_owner | score or reply_class |
| `email_sent` | 2, 4, 5, 6 | lead / prospect | email | sequence_id, step (or content_id), thread_id |
| `email_blocked` | 2, 3, 4, 5, 6, 7 | lead / prospect | email | reason |
| `email_failed` | 2, 4, 5, 6 | lead / prospect | email | error |
| `sequence_completed` | 4, 6 | lead / prospect | email | sequence_id |
| `launch_post_published` | 5 | sequence | telegram_channel | step_key, message_id |
| `reply_received` | 7 | lead / prospect | gmail_inbox | reply_class, thread_id (status_from/status_to filled) |
| `reply_unmatched` | 7 | system | gmail_inbox | from, thread_id |
| `demo_reply_simulated` | 7 | lead / prospect | email | reply_type |
| `dashboard_updated` | 8 | report | sheet | metrics |
| `report_sent` | 8 | report | telegram_owner | period_start |
| `error` | any | any | any | node, message |

### 5.7 Safety (email and Telegram)

**Email.** No lane may ever email an address outside the demo inboxes/domains in SETTINGS. Every Gmail **send** or **reply** node MUST be fed only by the **true** output of an IF node `Lane N · Recipient allowed?`, which reads the field `gate_ok` set by a Code node `Lane N · Demo safety gate` directly before it. The Gmail node's `sendTo` MUST be exactly `={{ $json.safe_to }}` (never a raw sheet value). `tools/validate-workflow.mjs` checks all of this. Gate code to copy:

```js
// Lane N · Demo safety gate: input items carry the recipient in `to_email`.
const S = $('Lane N · Settings to object').first().json;
const PUBLIC = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'rediffmail.com', 'proton.me', 'protonmail.com'];
const list = (value) => String(value ?? '').toLowerCase().split(',').map((part) => part.trim()).filter(Boolean);
function checkRecipient(email) {
  const match = /^([a-z0-9._%-]+)(\+[a-z0-9._%-]*)?@([a-z0-9.-]+\.[a-z]{2,})$/.exec(email);
  if (!match) return { ok: false, reason: 'not a single valid email address' };
  const base = `${match[1]}@${match[3]}`;                      // plus-tag removed
  const inboxes = [...list(S.ALLOWED_DEMO_INBOXES), ...list(S.SENDER_EMAIL)];
  const domains = list(S.ALLOWED_EMAIL_DOMAINS).map((d) => d.replace(/^@/, '')).filter((d) => !PUBLIC.includes(d));
  if (inboxes.includes(base)) return { ok: true, reason: 'demo inbox' };
  if (domains.includes(match[3])) return { ok: true, reason: 'demo domain' };
  return { ok: false, reason: 'not in ALLOWED_DEMO_INBOXES or ALLOWED_EMAIL_DOMAINS' };
}
return $input.all().map((item) => {
  const to = String(item.json.to_email ?? '').trim().toLowerCase();
  const check = checkRecipient(to);
  return { json: { ...item.json, safe_to: check.ok ? to : '', gate_ok: check.ok, gate_reason: check.reason } };
});
```

On the **false** branch the lane sets the row's `status` to `blocked` and `email_allowed` to `FALSE`, and logs `email_blocked`.

Standard Gmail send node (v2.1, credential `Kaya Demo · Gmail Sender`):

```json
{ "resource": "message", "operation": "send", "sendTo": "={{ $json.safe_to }}", "subject": "={{ $json.subject }}",
  "emailType": "html", "message": "={{ $json.html }}",
  "options": { "appendAttribution": false, "senderName": "={{ $json.sender_name }}" } }
```

Node settings: `retryOnFail: false` (a retry could send twice), `onError: "continueErrorOutput"` (output 1 → log `email_failed`, set `next_action_at` = now + 0.1 day so it is retried later, do not advance `seq_step`). The send output contains `id` and `threadId`; append `threadId` to the row's `thread_ids`.

**Telegram.** Messages go only to `TELEGRAM_OWNER_CHAT_ID` (private: approvals, alerts, reports, reel briefs) or `TELEGRAM_CHANNEL_ID` (public posts). A Code node puts the target in `chat_id` and the text in `text`; the Telegram node (v1.2) uses `chatId: "={{ $json.chat_id }}"`, `text: "={{ $json.text }}"`, `additionalFields: { "appendAttribution": false, "parse_mode": "HTML", "disable_web_page_preview": true }`, `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 3000`. Escape `&`, `<`, `>` in any text that came from the sheet or AI. Max message length 4,096 characters.

**Forms and webhooks.** n8n runs on a PC without a public URL, so lanes MUST NOT rely on incoming webhooks from the internet (no Telegram Trigger, no Gmail push). Form Triggers are fine (opened on the same PC/LAN). Gmail is read by polling.

### 5.8 Canvas layout and sticky notes

* Lane N owns the horizontal band **y = (N−1) × 1200 … (N−1) × 1200 + 1000**. All of its nodes (sticky notes included) stay inside that band; x runs from −240 to at most 6000.
* Frame sticky `Lane N · <Lane title>`: position `[-240, (N−1)×1200]`, `height: 1000`, width as needed, `color: ((N−1) mod 7) + 1`. Its first line is `## Lane N · <Lane title>  ·  trigger: …`, then 3–4 lines: what it does, which tabs it reads/writes, credentials, and the SPEC section. Leave the top ~240 px of the band free for this text: put nodes at y ≥ (N−1)×1200 + 260.
* Extra explanatory sticky notes are welcome (named `Lane N · …`, color 7). They sit in empty space or fully behind a group of nodes, never half over a node; nodes never overlap (`tools/validate-workflow.mjs` checks this, with a node drawn as a 100 × 100 box).
* The merged canvas has one overview sticky above Lane 1, named `Canvas · …` (the only node name without a lane prefix, allowed only above y = 0). In the merged canvas, Lane 7's frame uses color 2 instead of 7, because color 7 renders almost white in n8n 1.123 (session 5).
* Node `notes` + `notesInFlow: true` with 2–5 words are encouraged (shown under the node on the canvas).
* Node ids are UUIDs, unique across the canvas. Do not reuse ids from another lane file.

### 5.9 IDs

| Thing | Format | Example | Made by |
|---|---|---|---|
| content | `CNT-<batch yyyyMMdd-HHmmss>-<NN>` | `CNT-20261008-143205-01` | Lane 1 |
| batch | `B-yyyyMMdd-HHmmss` | `B-20261008-143205` | Lane 1 |
| lead | `LD-<yyyyMMdd>-<4 random A-Z0-9>` (re-roll if it exists) | `LD-20261008-7K3Q` | Lane 3 |
| prospect | `PR-B<nn>` / `PR-I<nn>` | `PR-B01` | human |
| sequence step | `<sequence_id>#<step>` | `OUTREACH_BOUTIQUE#2` | human |
| event | `EV-<yyyyMMddHHmmssSSS>-<4 random A-Z0-9>` | `EV-20261008143205123-K9Q2` | every lane |
| AI request | `<batch_id or entity id>:<job>` | `B-20261008-143205:ig_captions` | AI lanes |

### 5.10 AI call pattern (Gemini first, Groq fallback)

Every AI call in every lane uses this exact block (Lane 1 is the reference implementation: copy it and rename the lane prefix):

```
Lane N · Build AI request ─► Lane N · Ask Gemini ─► Lane N · Read Gemini reply ─► Lane N · Check AI answer ─► Lane N · Need Groq fallback?
                                                                                     ▲                  true │        │ false
                                                Lane N · Read Groq reply ◄─ Lane N · Ask Groq (fallback) ◄──┘        ▼
                                                                                                    (continue / Pause between AI calls)
```

* **Build AI request** (Code) outputs one item with `gemini_model`, `groq_model`, `started_at`, `gemini_body`, `groq_body` and the request context.
  * `gemini_body` = `{ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: 'application/json', responseSchema, thinkingConfig: { thinkingBudget } } }` (`thinkingConfig` only when `GEMINI_THINKING_BUDGET` is a number) (schema types in upper case: `OBJECT`, `ARRAY`, `STRING`, `INTEGER`, `NUMBER`, `BOOLEAN`).
  * `groq_body` = `{ model, temperature, max_tokens (≤ 4000), response_format: { type: 'json_object' }, messages: [ { role: 'system', content: system + ' … Return ONLY one JSON object with exactly this shape: <example JSON>' }, { role: 'user', content: prompt } ] }`.
  * The system prompt is built from `BRAND_VOICE`, the fact rules, the BRIEF rules and the BRIEF facts (section 6.4). Never put facts in a prompt that are not in BRIEF or in the row being processed.
* **Ask Gemini** (HTTP Request v4.2): `POST https://generativelanguage.googleapis.com/v1beta/models/{{ $json.gemini_model }}:generateContent`, predefined credential `googlePalmApi`, body `={{ JSON.stringify($json.gemini_body) }}`, `options.timeout: 120000`, `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 5000`, `onError: "continueRegularOutput"` (an error item `{ error: { message, description } }` continues to the next node).
* **Read Gemini reply** (Code): joins `candidates[0].content.parts[].text` (skipping `thought` parts); sets `error` if the call failed, no text came back or `finishReason ≠ STOP`.
* **Check AI answer** (Code, shared by both providers): strips ``` fences, `JSON.parse`, validates required keys/counts, outputs `ai_ok`, `ai_provider`, `ai_error`, `ai_data`, `try_groq` (= not ok and provider is gemini), `groq_body` (only when `try_groq`), `pause_seconds`.
* **Need Groq fallback?** (IF v2.2): `{{ $json.try_groq }}` is true.
* **Ask Groq (fallback)** (HTTP Request v4.2): `POST https://api.groq.com/openai/v1/chat/completions`, predefined credential `groqApi`, body `={{ JSON.stringify($json.groq_body) }}`, same retry/timeout/onError settings.
* **Read Groq reply** (Code): `choices[0].message.content`, plus `fallback_reason` = Gemini's error.
* A pause (`Lane N · Pause between AI calls`, Wait v1.1, `amount: ={{ $json.pause_seconds }}`, unit `seconds`) follows every AI call inside a loop.
* If both providers fail, the lane continues with a safe non-AI default where one exists (Lane 6: template opener; Lane 7: keyword rules; Lane 8: no insights) and logs `ai_failed`.
* Free-tier budget (check current limits in Google AI Studio and the Groq console): Lane 1 = 5 calls per run · Lane 6 = 1 call per first-touch prospect · Lane 7 = 1 call per reply · Lane 8 = 1 call per report. Gemini answers use JSON mode with a schema; Groq uses JSON mode plus an example shape.

### 5.11 Templates and placeholders

SEQUENCES templates and the newsletter body use `{{placeholder}}` tokens. Allowed placeholders:

| Placeholder | Value | Source |
|---|---|---|
| `{{first_name}}` | lead first name | LEADS |
| `{{city}}` | city | LEADS / PROSPECTS |
| `{{contact_name}}`, `{{business_name}}`, `{{instagram_handle}}` | prospect fields | PROSPECTS |
| `{{brand_name}}`, `{{brand_instagram}}`, `{{collection_name}}`, `{{founder_name}}`, `{{offer_code}}`, `{{offer_percent}}` | BRIEF values with that key | BRIEF |
| `{{launch_date}}`, `{{public_launch_date}}` | real dates formatted `cccc, d LLLL` (5.3) | SETTINGS |
| `{{waitlist_form_url}}`, `{{sender_name}}`, `{{unsubscribe_line}}` | `WAITLIST_FORM_URL`, `SENDER_NAME`, `UNSUBSCRIBE_LINE` | SETTINGS |
| `{{ai_opener}}` | one AI-written sentence (Lane 6), `''` when `ai_personalize` is FALSE | AI |

Renderer to copy. Values that came from people or AI MUST be HTML-escaped before rendering into HTML. If any placeholder is unknown or empty-required, **do not send**: log `error` with the missing names and leave the row unchanged.

```js
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function render(template, values) {
  const missing = new Set();
  const text = String(template ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key) => {
    if (values[key] === undefined || values[key] === null) { missing.add(key); return token; }
    return String(values[key]);
  });
  return { text, missing: [...missing] };
}
```

### 5.12 Expressions in node parameters

Inside node **parameters**, expressions use only the current item: `{{ $json.field }}` (and `$now` if needed). Never `$('Other node')…` in a parameter. Cross-node lookups belong in Code nodes, which then pass the value forward as a field. Reason: n8n 1.123's new default expression engine (`N8N_EXPRESSION_ENGINE=vm`) fails on `$('Node').first()` inside parameters ("could not be cloned"), while Code nodes are unaffected. Lane 1 follows this rule and runs on both engines.

### 5.13 Node types and versions

All core nodes. These typeVersions exist in n8n 1.80+ and were checked against n8n **1.123.84** (latest 1.x on npm when this was written). Use exactly these:

| Node | `type` | `typeVersion` |
|---|---|---|
| Manual Trigger | `n8n-nodes-base.manualTrigger` | 1 |
| Schedule Trigger | `n8n-nodes-base.scheduleTrigger` | 1.2 |
| Form Trigger | `n8n-nodes-base.formTrigger` | 2.2 |
| Gmail Trigger | `n8n-nodes-base.gmailTrigger` | 1.2 |
| Code | `n8n-nodes-base.code` | 2 |
| IF | `n8n-nodes-base.if` | 2.2 |
| Switch | `n8n-nodes-base.switch` | 3.2 |
| Edit Fields (Set) | `n8n-nodes-base.set` | 3.4 |
| Filter | `n8n-nodes-base.filter` | 2.2 |
| Merge | `n8n-nodes-base.merge` | 3 |
| Loop Over Items | `n8n-nodes-base.splitInBatches` | 3 |
| Wait | `n8n-nodes-base.wait` | 1.1 |
| HTTP Request | `n8n-nodes-base.httpRequest` | 4.2 |
| Google Sheets | `n8n-nodes-base.googleSheets` | 4.5 |
| Gmail | `n8n-nodes-base.gmail` | 2.1 |
| Telegram | `n8n-nodes-base.telegram` | 1.2 |
| No Operation | `n8n-nodes-base.noOp` | 1 |
| Stop and Error | `n8n-nodes-base.stopAndError` | 1 |
| Sticky Note | `n8n-nodes-base.stickyNote` | 1 |

Code nodes: JavaScript, mode "Run Once for All Items" unless there is a reason. Workflow settings: `{ "executionOrder": "v1", "timezone": "Asia/Kolkata", "saveManualExecutions": true }`.

---

## 6. Kaya Jewels brand facts and campaign brief

**The BRIEF tab is the single source of truth.** The text below mirrors `sheets-template/BRIEF.csv`; if they ever differ, the sheet wins. AI prompts MUST be built from the BRIEF tab at run time, never from text typed into a node.

### 6.1 The brand
* **Kaya Jewels** (Instagram `@kayajewels_demo`), "Handmade jewellery, made to be celebrated."
* Started in 2021 by **Kavya Mehra** at her home in Jaipur, Rajasthan, with two karigars (artisans). Today every piece is handmade in the Jaipur studio by a team of **6 women artisans**; each design takes **2 to 4 days**.
* Sells on Instagram (order by DM) and through its online store. During this campaign every call to action points to the waitlist form.
* Materials: brass with gold plating, kundan-style glass stones, glass beads, freshwater pearls, hand-painted meenakari enamel; one design in 925 sterling silver.

### 6.2 The collection: The Roshni Edit (Diwali 2026)
6 handmade designs inspired by diyas, rangoli and the jharokha windows of Jaipur's old city. **Price range ₹1,200 – ₹6,500.**

| Product | Description | Price |
|---|---|---|
| Roshni Kundan Jhumkas | gold-plated brass jhumkas, kundan-style stones, freshwater pearl drops | ₹2,450 |
| Diya Meenakari Studs | lightweight studs, hand-painted red and green meenakari | ₹1,200 |
| Rangoli Maang Tikka | gold-plated brass maang tikka, pink glass beads | ₹1,850 |
| Jharokha Layered Necklace | two-layer gold-plated brass necklace, jharokha-shaped pendants | ₹3,900 |
| Chandni Silver Bangles (set of 2) | 925 sterling silver, hand-engraved motifs | ₹4,800 |
| Tara Choker Set | kundan-style choker with matching earrings | ₹6,500 |

Shipping: free across India on orders above ₹1,999; dispatched within 3 working days. Packaging: reusable cotton pouch inside a gift box. Care: keep away from water and perfume, wipe with a soft dry cloth, store in the pouch.

### 6.3 Campaign and offer
* Campaign: **Diwali 2026 · The Roshni Edit launch**. Goal: grow the waitlist before launch, then turn waitlist members into first orders during early access.
* **Offer:** waitlist members get **early access** from `{{launch_date}}` until `{{public_launch_date}}` (before the public launch) **plus 10% off** with a code emailed on launch day. The code (`ROSHNI10`, BRIEF key `offer_code`, `ai_use = none`) works once per customer on Roshni Edit pieces during early access.
* **Launch date placeholder:** SETTINGS `LAUNCH_DATE` = `2026-10-26` at `LAUNCH_TIME` 10:00 IST; public launch = + `EARLY_ACCESS_DAYS` (2) → 28 October. Change only in SETTINGS.
* The code is never printed in public content or before launch; only Lane 5 launch emails reveal it (`{{offer_code}}`).
* **Audience:** women aged 22–40 in Indian metros and tier-2 cities who shop on Instagram, love handmade festive jewellery, and buy for their own Diwali outfits or as gifts for sisters, mothers and friends. They want festive pieces that look rich but feel light and are not mass-produced, and plan Diwali shopping early.
* **Tone:** SETTINGS `BRAND_VOICE` ("Warm, festive and personal, like a friend who makes jewellery by hand. Confident but never pushy…"). Indian English, talk to "you", short sentences, light Hindi words (shubh, roshni, ghar) welcome, max 3 emojis per caption. Hashtags: always `#KayaJewels` and `#RoshniEdit`.
* **B2B (Lane 6 only):** boutique stockists buy at 35% off MRP, minimum 20 pieces, stock ships within 7 working days of confirmation, first order includes a printed lookbook and counter display card. Micro-influencers: one gifted piece of their choice (up to ₹3,000) + a personal code giving followers 10% off and the creator 10% commission; 1 reel + 2 stories; no paid fee. Handled personally by the founder.

### 6.4 Rules every AI prompt MUST carry
1. The BRIEF facts are the only source of truth; use nothing else (plus the fields of the row being processed, e.g. a prospect's `notes`).
2. Never invent or change product names, prices, materials, discounts, codes, dates, shipping or delivery promises, stock levels, reviews, awards, statistics, people or quotes. If a detail is missing, leave it out.
3. Prices exactly as in the facts (`₹2,450`). The only consumer offer is the waitlist offer.
4. Never claim real/solid gold, hallmarking, certification, waterproof or tarnish-proof finishes, lifetime guarantees, stock numbers, best-seller status, awards or celebrity use; never promise delivery dates (BRIEF `writing_donts`; machine list in `forbidden_phrases`).
5. Output JSON only, in the shape requested.

Lane 1's quality check flags (and costs 10 points per problem) any forbidden phrase, any ₹ price or % not present in the facts, and the discount code.

---

## 7. Lane responsibilities

Each lane: trigger · inputs · outputs · columns read/written · events · outline · done-when. "Settings" = `Lane N · Read SETTINGS` + `Lane N · Settings to object` (5.3). File: `lanes/lane-N-<slug>.json`.

### 7.1 Lane 1 · Content engine (BUILT in session 1: `lanes/lane-1-content-engine.json`)
* **Trigger:** Manual Trigger `Lane 1 · Start`.
* **Reads:** SETTINGS (all keys in 4 marked "1"), BRIEF (all rows).
* **AI jobs (one call each, blog first):** `blog_article` (Markdown 600–900 words + `seo_title` ≤ 60 + `meta_description` 120–155 + `slug` + `target_keyword` from BRIEF `seo_keywords`) · `ig_captions` (5: hook, caption, 8–12 hashtags, CTA to the waitlist, image idea) · `reel_ideas` (3: title, hook, 4–7 shots, caption, hashtags, audio idea, 15–45 s) · `newsletter` (subject, preview text, HTML body with `{{first_name}}` and `{{unsubscribe_line}}`) · `blog_repurpose` (3 short posts ≤ 280 chars, made from the blog written in round 1).
* **Checks:** SEO score for the blog (title/meta length, keyword in title/meta/first paragraph/H2, heading structure, 600–900 words, Flesch readability, keyword density, slug) and format checks for the rest; fact check on all (5 = section 6.4).
* **Writes:** CONTENT append, 13 rows: every column of 2.3, `status = pending_approval`, `scheduled_for` = `POST_TIMES` slots from `CONTENT_START_IN_DAYS` days ahead (demo clock applies), mixed order (blog, caption, newsletter, caption, reel, short post, …).
* **Sends:** one Telegram message to `TELEGRAM_OWNER_CHAT_ID`: "Content ready for approval: N items" + numbered list (type, title, score, slot) + warnings for issues, fallbacks, failed jobs.
* **Logs:** `content_generated` ×N, `ai_call` ×5, `ai_fallback`, `ai_failed`, `approval_requested`, `lane_run`.
* **Failure behaviour:** a job failing on both providers is skipped and reported; if all jobs fail, the run stops with an error naming each reason.

### 7.2 Lane 2 · Publisher
* **Trigger:** `Lane 2 · Every minute` (cron `0 * * * * *`).
* **Reads:** SETTINGS, CONTENT, LEADS (only when a newsletter is due).
* **Picks:** CONTENT rows with `status ∈ {approved, publishing}` and `scheduled_for ≤ now`, oldest first. Up to `MAX_POSTS_PER_RUN` Telegram items and at most 1 newsletter per run.
* **Telegram items** (HTML-escape sheet text; truncate the body so the message stays under 4,000 chars):
  * `ig_caption`, `short_post` → `TELEGRAM_CHANNEL_ID`: `body` + blank line + `hashtags` + blank line + `👉 Join the waitlist: <WAITLIST_FORM_URL>` (the channel has no "link in bio").
  * `blog_article` → `TELEGRAM_CHANNEL_ID`: `📝 <b>New on the Kaya Jewels blog</b>` / `<b>title</b>` / `meta_description` / `Read: /blog/<slug> (demo)` / waitlist link.
  * `reel_idea` → `TELEGRAM_OWNER_CHAT_ID` (a shoot brief, not public): `🎬 <b>Reel brief</b>: title` / `media_notes` / caption + hashtags.
  * After each send, **immediately** update the CONTENT row: `status = published`, `published_at = now`, `publish_ref = tg:<result.message_id>`, `last_error = ''`, `updated_at`. Log `content_published`. On error after retries: `status = failed`, `last_error`, log `publish_failed`.
* **Newsletter** (`asset_type = newsletter`): if `status = approved`, first update it to `publishing`. Recipients = active leads (3.2) with `last_newsletter_id ≠ content_id` and `gapOk`, up to `MAX_SENDS_PER_RUN`. For each: render `title` (subject) and `body` with `{{first_name}}` / `{{unsubscribe_line}}` → safety gate → Gmail send → update the LEAD row (`last_newsletter_id = content_id`, `last_contacted_at`, `thread_ids`, `updated_at`) → log `email_sent` (meta `content_id`) → wait `SEND_DELAY_SECONDS`. When no eligible lead is left without it (count after this run's sends = 0), update CONTENT `status = published`, `published_at`, `publish_ref = newsletter:<total sent> sent` and log `content_published` (channel `email`).
* **Columns written:** CONTENT `status, published_at, publish_ref, last_error, updated_at`; LEADS `last_newsletter_id, last_contacted_at, thread_ids, updated_at` (+ `status, email_allowed` when blocked).
* **Done when:** approving a row whose `scheduled_for` has passed makes it appear in the channel within a minute, exactly once.

### 7.3 Lane 3 · Lead engine
* **Trigger:** Form Trigger v2.2 `Lane 3 · Waitlist form`, `options.path = "kaya-waitlist"` (so the URL is `<n8n>/form/kaya-waitlist`; this production URL only works while the workflow is **active**, the editor's test URL is `/form-test/kaya-waitlist`), `options.appendAttribution = false`, `responseMode: "onReceived"`. Title: `Join the Roshni Edit waitlist`. Description: `Early access + 10% off for waitlist members. Handmade in Jaipur by Kaya Jewels.` Fields (use `text`, `email` and `dropdown` types only; labels exact, because the output keys are the labels):

| Label | Type | Required | Options → stored value |
|---|---|---|---|
| `First name` | text | yes | |
| `Email` | email | yes | lower-cased |
| `City` | text | yes | |
| `Instagram handle` | text | no | add `@` if missing |
| `WhatsApp number` | text | no | stored in `phone` |
| `I'm shopping for` | dropdown | yes | Earrings → `earrings` · Necklaces → `necklaces` · Maang tikka → `maang_tikka` · Bangles → `bangles` · Gifting → `gifting` · A full festive set → `full_set` |
| `My budget` | dropdown | yes | Under ₹1,500 → `under_1500` · ₹1,500–₹3,000 → `1500_3000` · ₹3,000–₹5,000 → `3000_5000` · Above ₹5,000 → `above_5000` |
| `Occasion` | dropdown | yes | My Diwali outfit → `diwali_outfit` · Gifting → `gifting` · Wedding season → `wedding_season` · Treating myself → `self_treat` · Just browsing → `just_browsing` |
| `Email consent` | dropdown | yes | Yes, email me about early access and offers → `TRUE` · No thanks → `FALSE` |

* **Steps:** Settings → validate & normalise → Read LEADS → duplicate check on email (case-insensitive): duplicate → log `lead_duplicate`, stop (no new row, no email) → score → safety gate (sets `email_allowed`) → append LEADS → log `lead_captured` (+ `email_blocked` if blocked) → if `segment = hot`: Telegram owner `🔥 New hot lead: <name> (<city>), score <n>` → log `hot_alert_sent`.
* **Scoring (exact, cap 100):** budget `above_5000` +30 · `3000_5000` +25 · `1500_3000` +15 · `under_1500` +5; occasion `diwali_outfit` +25 · `gifting` +20 · `wedding_season` +20 · `self_treat` +15 · `just_browsing` +0; interest `full_set` +15 · `necklaces` +12 · `earrings` +10 · `bangles` +10 · `gifting` +10 · `maang_tikka` +8; Instagram handle given +10; phone given +10; consent TRUE +10. `segment`: ≥ `HOT_LEAD_SCORE` → hot, ≥ `WARM_LEAD_SCORE` → warm, else cold. `score_reason` lists each part (`budget 3000_5000 +25; …`), as in the sample rows.
* **New row values:** `lead_id` (5.9), `created_at = now`, `source = waitlist_form`, `status = new` (or `blocked`), `sequence_id = WAITLIST_NURTURE`, `seq_step = 0`, `next_action_at = now` (blank if blocked or consent FALSE), `launch_step = 0`, other tracking columns blank. Lane 3 sends **no email**: Lane 4 sends the welcome within a minute.
* **Done when:** submitting the form with `kayademo.customers+test1@gmail.com` creates one `new` row; submitting with `someone@example.com` creates a `blocked` row; submitting the same email twice creates one row.

### 7.4 Lane 4 · Sequence sender (waitlist nurture)
* **Trigger:** `Lane 4 · Every minute` (cron `15 * * * * *`).
* **Reads:** SETTINGS, LEADS, SEQUENCES (`sequence_id = WAITLIST_NURTURE`, `active = TRUE`), BRIEF (placeholder values).
* **Due leads:** `status ∈ {new, nurturing}`, `consent = TRUE`, `email_allowed ≠ FALSE`, `next_action_at` blank or ≤ now, `gapOk`. Oldest `next_action_at` first, max `MAX_SENDS_PER_RUN`.
* **Per lead (loop):** step = `seq_step + 1`; no active step → update `status = nurture_done`, `next_action_at = ''`, log `sequence_completed`. Else render subject/body (5.11) → safety gate → Gmail send → **update the lead row immediately**: `seq_step = step`, `status = nurturing` (or `nurture_done` if no later active step), `last_contacted_at = now`, `next_action_at = addDays(now, next step's delay_days)` (blank if last), `thread_ids += threadId`, `updated_at` → log `email_sent` (meta `sequence_id`, `step`, `thread_id`) and `sequence_completed` if last → wait `SEND_DELAY_SECONDS`.
* **Columns written:** LEADS `status, seq_step, next_action_at, last_contacted_at, thread_ids, email_allowed (blocked only), updated_at`.
* **Done when:** a new form lead gets the welcome email within ~1 minute, then steps 2–4 at 2, 6 and 10 demo minutes (1, 2, 2 days scaled), never twice.

### 7.5 Lane 5 · Launch engine
* **Trigger:** `Lane 5 · Every minute` (cron `30 * * * * *`).
* **Reads:** SETTINGS, SEQUENCES (`LAUNCH_BROADCAST`, active), LEADS, BRIEF.
* `T0 = launchAt(S)` (5.3). If null (demo mode with blank `DEMO_LAUNCH_AT`) → end quietly. Each step's due time = `addDays(T0, delay_days)`.
* **Channel steps** (`channel = telegram_channel`): among due steps with blank `broadcast_done_at`, post only the **latest** one to `TELEGRAM_CHANNEL_ID` (rendered body); set `broadcast_done_at = now` on it **and** on any older undone channel steps (they are stale, not posted). Log `launch_post_published` (meta `step_key`, `message_id`).
* **Email steps** (`channel = email`): `k` = highest due email step. Recipients = active leads (3.2) with `launch_step < k` and `gapOk`, max `MAX_SENDS_PER_RUN`. Render (includes `{{offer_code}}`) → gate → Gmail send → update lead: `launch_step = k`, `last_contacted_at`, `thread_ids`, `updated_at` → log `email_sent` (meta `sequence_id = LAUNCH_BROADCAST`, `step = k`) → wait `SEND_DELAY_SECONDS`. (A lead who missed step 2 gets only step 4 when step 4 is due.)
* **Columns written:** SEQUENCES `broadcast_done_at`; LEADS `launch_step, last_contacted_at, thread_ids, status/email_allowed (blocked only), updated_at`.
* **Done when:** with `DEMO_LAUNCH_AT` = now + 6 min: the "2 days to go" post appears ~2 min later, the early-access email + channel post at T0 (3 leads per minute), the reminder at T0 + 2 min, the public-launch post at T0 + 4 min.

### 7.6 Lane 6 · Outreach (boutiques + micro-influencers)
* **Trigger:** `Lane 6 · Every 2 minutes` (cron `45 */2 * * * *`).
* **Reads:** SETTINGS, PROSPECTS, SEQUENCES (`OUTREACH_BOUTIQUE`, `OUTREACH_INFLUENCER`), BRIEF (facts with `ai_use ∈ {all, b2b}` + rules).
* **Due prospects:** `status ∈ {new, contacted}`, `next_action_at` blank or ≤ now, `gapOk`; highest `fit_score` first; max `MAX_SENDS_PER_RUN`.
* **Per prospect (loop):** step = `seq_step + 1` in the row's `sequence_id`. If `ai_personalize = TRUE`: AI pattern (5.10) with JSON `{ "opener": string }` = one friendly sentence (≤ 30 words) about the prospect, using only `notes`, `niche`, `city`, `business_name` and no claims about Kaya beyond BRIEF. If AI fails: opener = `I came across {{business_name}} on Instagram and loved what you are building in {{city}}.` Then render → gate → Gmail send → **update immediately**: `seq_step`, `status = contacted` (or `sequence_done` if last), `last_contacted_at`, `next_action_at = addDays(now, next delay_days)` (blank if last), `thread_ids`, `updated_at` → log `email_sent` (+ `sequence_completed`) → wait `SEND_DELAY_SECONDS` (+ `AI_WAIT_SECONDS` when AI was used).
* **Columns written:** PROSPECTS `status, seq_step, next_action_at, last_contacted_at, thread_ids, email_allowed (blocked only), updated_at`.
* **Done when:** the 12 sample prospects each receive a personalised first email (3 per run), follow-ups after 6 and 8 demo minutes, nothing after a reply.

### 7.7 Lane 7 · Inbox (reply classification + hot alert)
* **Trigger:** Gmail Trigger v1.2 `Lane 7 · New email in sender inbox`, credential `Kaya Demo · Gmail Sender`, `pollTimes: { item: [ { mode: "everyMinute" } ] }`, `simple: false`, `filters: { labelIds: ["INBOX"], readStatus: "unread", q: "-from:me" }`.
* **Reads:** SETTINGS, LEADS, PROSPECTS, BRIEF (consumer + b2b facts, for context only).
* **Per message:** skip mail from `SENDER_EMAIL`. Match the person: (1) the message `threadId` is in a row's `thread_ids` (LEADS then PROSPECTS); (2) else the sender address equals a row's `email`. No match → log `reply_unmatched`, mark read, stop. Remove quoted history (lines from `On … wrote:` or starting with `>`), keep ≤ 2,000 chars. AI pattern (temperature 0.2) → JSON `{ "reply_class": one of interested|question|not_now|not_interested|unsubscribe|out_of_office|other, "confidence": 0-1, "summary": "≤ 20 words", "suggested_next_step": "≤ 25 words" }`. If AI fails, keyword rules: unsubscribe/stop/remove → `unsubscribe`; out of office/on leave → `out_of_office`; not interested/no thanks → `not_interested`; later/next season/not now → `not_now`; yes/interested/send/price/sample/lookbook → `interested`; contains `?` → `question`; else `other`.
* **Update the row** with the status mapping in 3.2 / 3.3, `last_reply_at`, `reply_class`, `next_action_at = ''` (unless `out_of_office`), `updated_at`, and append `[yyyy-MM-dd] <summary>` to `notes` (leads) or `deal_notes` (prospects). Log `reply_received` with status_from/status_to.
* **Alerts** to `TELEGRAM_OWNER_CHAT_ID`: `interested` → `🔥 HOT: <name/business> replied: "<summary>"` + suggested next step; `question` → `❓ <name> asked: "<summary>"`. Log `hot_alert_sent`.
* Finally mark the message read (Gmail v2.1 `markAsRead`, credential Gmail Sender).
* **Optional demo helper** (allowed second trigger in this lane): Form Trigger `Lane 7 · Demo reply form` (`options.path = "kaya-demo-reply"`), fields `Reply to email sent to` (text: the plus-address) and `Reply type` (dropdown: Interested · Question · Not now · Unsubscribe). It finds the latest message from `SENDER_EMAIL` to that address in the **Demo Customers** mailbox (Gmail getAll, `q: "from:<SENDER_EMAIL> to:<address>"`, limit 1) and replies in the thread with a canned text (Gmail `reply`, credential `Kaya Demo · Gmail Demo Customers`, `options: { appendAttribution: false, replyToSenderOnly: true }`). Session 5: the Gmail API always sends the reply FROM the bare demo inbox (`kayademo.customers@gmail.com`), which matches no single row, so the reply must be matched by its thread. The form therefore only accepts the address of a known lead/prospect, and only replies to a found mail that was sent to exactly that address and has a thread id. The gate checks that the reply goes to `SENDER_EMAIL` (always allowed). Log `demo_reply_simulated`.
* **Columns written:** LEADS `status, last_reply_at, reply_class, next_action_at, notes, updated_at`; PROSPECTS `status, last_reply_at, reply_class, next_action_at, deal_notes, updated_at`.

### 7.8 Lane 8 · Report
* **Trigger:** `Lane 8 · Every 5 minutes` (cron `50 */5 * * * *`).
* **Reads:** SETTINGS, EVENTS_LOG, then (only if due) CONTENT, LEADS, PROSPECTS.
* **Due check:** last `report_sent` event time = L. Demo mode: due if L is empty or now − L ≥ `DEMO_REPORT_EVERY_MINUTES`. Real mode: due if now ≥ today `REPORT_TIME` and L is before today `REPORT_TIME`. Not due → end quietly.
* **Compute** every metric in 2.8 (period = since L). **Write** DASHBOARD with Append or Update on `metric_key` (`metric_key`, `value`, `updated_at`). Log `dashboard_updated`.
* **Optional AI** (pattern 5.10): 3 short insights from the metrics JSON only (`{ "insights": [string, string, string] }`); skip if both providers fail.
* **Telegram** to owner: `📊 <b>Kaya Jewels · campaign report</b>` + period + key numbers (content pending/published, leads total/new/hot, emails sent, outreach contacted/replied/interested and reply rate, AI fallbacks, errors) + insights + sheet link. Log `report_sent` (meta `period_start`).

---

## 8. Merge checklist (session 5)

Goal: one file containing lanes 1–8. **Session 5 result:** `lanes/marion-marketing-engine.json`, workflow name **`Marion Enroute · Marketing Engine demo (Kaya Jewels)`**, built by `node tools/build-canvas.mjs` from the 8 lane files (re-run it after changing a lane). Checks: `tests/IMPORT-CHECK.md`, `tests/e2e/RESULTS.md`.

1. **Collect** `lanes/lane-1-content-engine.json` … `lanes/lane-8-report.json`. Run `node tools/validate-workflow.mjs <file>` on each; fix every ✖ before merging.
2. **Merge**: concatenate all `nodes` arrays; merge all `connections` objects (keys are node names, which are unique because of the lane prefix). Take `settings` from Lane 1 (`executionOrder: v1`, `timezone: Asia/Kolkata`, `saveManualExecutions: true`). Drop each file's `id`, `versionId`, `meta.instanceId`, `pinData`. Set `active: false`.
3. **Uniqueness**: no duplicate node names, no duplicate node ids (regenerate a UUID if two collide), no duplicate `webhookId`s (Form, Wait and Telegram nodes carry one).
4. **One Manual Trigger** only (Lane 1). Every other lane starts with its own Schedule/Form/Gmail trigger. No connection crosses lanes.
5. **Layout**: each lane inside its band (5.8), frame sticky present and named `Lane N · <title>`; nothing overlaps.
6. **Credentials**: every reference uses a name from section 1 with `"id": null`. No API key, token, client secret or real email password anywhere (`validate-workflow.mjs` scans for common key patterns).
7. **Safety**: every Gmail send/reply sits behind `Lane N · Recipient allowed?` (true branch) and uses `={{ $json.safe_to }}`; `appendAttribution: false` on Gmail, Telegram and Form nodes.
8. **Sheets**: all Google Sheets nodes use `__KAYA_SHEET_ID__` by id and a tab by name; writes use `cellFormat: RAW`; updates match on the key column.
9. **Waits**: no Wait over 60 s; delays use `next_action_at` / `scheduled_for` / launch offsets.
10. **Events**: grep all lanes for `event_type` values; every one is in the closed list of 5.6 (Lane 8 relies on it).
11. **Run the validator on the merged file**: `node tools/validate-workflow.mjs lanes/marion-marketing-engine.json` → `✔ valid`.
12. **Import test** (if n8n is available): create the 6 credentials with dummy values, `n8n import:workflow --input=lanes/marion-marketing-engine.json`, export it again and confirm every credential reference got an id (name matching worked).
13. **Demo dry run** (owner, on the PC): fresh sheet from the CSVs → replace `__KAYA_SHEET_ID__` → import → set placeholders in SETTINGS (`SENDER_EMAIL`, Telegram ids, `DEMO_LAUNCH_AT`) → run Lane 1 → approve 3 rows → activate the workflow → submit the form with a plus-address → watch Lanes 2–8 for 20 minutes. Record results in `PROGRESS.md`.
14. **Docs**: update `PROGRESS.md` (what is done, known issues) and `NODES.md` (add a section per lane, same style as Lane 1).
