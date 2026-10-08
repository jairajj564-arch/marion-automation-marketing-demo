# Lane 2 · Publisher, node by node

This guide explains every node in `lanes/lane-2-publisher.json`: what it does and **why it is there**. It assumes you are new to n8n and have read the "six n8n ideas" at the top of `NODES.md` (workflow, node, item, expression, credential, execution). The rules behind the design are in `SPEC.md` (section 7.2); this file is the friendly tour.

## What Lane 2 does

Every minute it asks one question: **"Is anything approved and due?"**

* A **caption, short post or blog article** that is approved and due is posted to the Telegram channel (the stand-in for Instagram).
* A **reel idea** is sent to *your private chat* as a shoot brief (it is not a public post).
* A **newsletter** is emailed to the waitlist, a few people per minute, until everyone who should have it has it.
* If nothing is due, the run **ends quietly**: no message, no log row.

You control it from the sheet: set a CONTENT row's `status` to `approved`. When its `scheduled_for` time passes, Lane 2 publishes it, exactly once.

## The shape of Lane 2

```
Every minute → Read SETTINGS → Settings to object → Read CONTENT → Pick due content → Route by kind
                                                                                          │
   ┌──────────────────────────────────── post ────────────────────────────────────────────┤
   ▼                                                                                      │
 Loop over posts ─loop→ Build Telegram message → Send to Telegram ─(ok or error)→ Build publish result
   ▲                                                                                      │
   └── Save post to EVENTS_LOG ← Build post log ← Update CONTENT after post ←─────────────┘

   newsletter ─→ Newsletter needs publishing? ─true→ Build publishing update → Mark newsletter publishing ─┐
                                              └false────────────────────────────────────────────────────┤
                                                                          Read LEADS ← ──────────────────┘
   Read LEADS → Pick newsletter recipients → Any recipient to send? ─true→ Loop over recipients ─loop→ Demo safety gate
                                                         └false──┐             │done                       │
                                                                 ▼             ▼                           ▼
                                                     Check newsletter finished              Recipient allowed? ─true→ Send newsletter email
                                                                 │                                          └false→ Build blocked update → Update LEAD as blocked ┐
                                                     Update CONTENT after newsletter                                (Send ok) Build lead update → Update LEAD after send ┤
                                                                 │                                                (Send error) ───────────────────────────────────────┤
                                                     Build newsletter done log → Save …                                                         Build send log ←────────┘
                                                                                                         Save send to EVENTS_LOG → Pause between emails → (back to the loop)

   problem ─→ Build problem update → Update CONTENT with problem → Build problem log → Save problem to EVENTS_LOG
```

## Rules this lane follows

* **Never send twice.** For every post or email the order is *act → update that row → log*. The row is updated before the next item is touched, so a restart can never repeat a finished item.
* **Only touch what Lane 2 owns.** It writes CONTENT `status, published_at, publish_ref, last_error, updated_at` and LEADS `last_newsletter_id, last_contacted_at, thread_ids, updated_at` (plus `status` and `email_allowed` only when an address is blocked). Every Sheets update is fed by a Code node that outputs *only* those columns, because the Sheets "update" node writes every field it receives (and would even create a new sheet column for an unknown one).
* **No email without the safety gate.** The only Gmail node sits behind `Demo safety gate` and `Recipient allowed?` and sends to `{{ $json.safe_to }}`, never to a raw sheet value.
* **A bad row never stops the run.** Problems are reported once and the other rows carry on.

---

## The nodes

### Lane 2 · Publisher *(sticky note)*
**What:** the coloured frame behind the lane with a summary: trigger, what it reads and writes, credentials.
**Why:** the final canvas has 8 lanes; the frame tells anyone looking (you, or a client during a demo) what this lane is. Sticky notes never run.

### Lane 2 · How the newsletter loop works *(sticky note)*
**What:** a small note explaining the newsletter loop in four steps.
**Why:** loops are the hardest part of n8n to read at a glance. This note lets you explain it in a demo without opening a node.

### Lane 2 · Every minute *(Schedule Trigger)*
**What:** starts the lane when the clock hits second 0 of every minute. It uses a *cron expression* with six fields (`0 * * * * *` = second 0, every minute, every hour, every day).
**Why:** polling every minute is how "approve in the sheet, appears in the channel within a minute" works without any public web address. Lane 2 starts at second 0, Lane 4 at second 15, Lane 5 at second 30 and so on, so the lanes never hit Google Sheets at the same instant. The trigger only fires while the workflow is **active** (the switch at the top right of n8n). If your PC was off, the next run simply picks up everything that became due meanwhile.

### Lane 2 · Read SETTINGS *(Google Sheets, Read rows)*
**What:** reads every row of the `SETTINGS` tab; each row becomes one item (`{ key, value, … }`).
**Why:** all the knobs live in the sheet so you can change them without opening n8n. Retry on fail is on (3 tries, 3 s apart) because Google sometimes answers with a short-lived error.

### Lane 2 · Settings to object *(Code)*
**What:** turns the many SETTINGS items into **one** item (`{ MAX_POSTS_PER_RUN: "2", … }`), checks that every key Lane 2 needs is present and that the numbers are real numbers, caps `SEND_DELAY_SECONDS` at 60, and adds the two demo-clock helpers `IS_DEMO` and `DAY_MS` (how long "one day" lasts: 2 minutes in demo mode).
**Why:** later nodes can then say `$('Lane 2 · Settings to object').first().json.MAX_SENDS_PER_RUN`. It also fails *early with a plain message* ("The SETTINGS tab is missing a value for: …") instead of half-way through a run.

### Lane 2 · Read CONTENT *(Google Sheets, Read rows)*
**What:** reads the whole CONTENT tab once per run. *Always output data* is on, so an empty tab still lets the run continue.
**Why:** SPEC 5.4: read a tab once, then filter in a Code node. Reading once is cheaper and more consistent than asking Google many questions.

### Lane 2 · Pick due content *(Code)*
**What:** the brain of the lane. Looking at every CONTENT row it decides:
* `status` is not `approved` / `publishing` → **ignored** (pending, rejected, published, failed… are never touched).
* `scheduled_for` is in the future → **ignored** until it is due.
* due and valid → becomes an item: **`post`** (up to `MAX_POSTS_PER_RUN`, oldest `scheduled_for` first), or **`newsletter`** (at most one per run; one that is already being broadcast goes before a new one).
* due but **not publishable** (empty body/title/slug, unknown `asset_type`, a missing or invalid `scheduled_for`, a newsletter using a placeholder Lane 2 cannot fill) → a **`problem`** item.

Problems are reported **once**: the message is stored in the row's `last_error`, and a row whose `last_error` already holds that exact message is skipped silently. Without this you would get the same error row in EVENTS_LOG every minute forever. When a human fixes the row, it publishes on the next run and `last_error` is cleared.
**Why:** all the "what is eligible?" logic in one readable place, with the sheet as the only memory.

### Lane 2 · Route by kind *(Switch)*
**What:** sends each item down one of three outputs by its `kind`: `post`, `newsletter` or `problem`.
**Why:** the three jobs need completely different nodes. A Switch is a multi-way IF. Because the Pick node returns *no items* when there is nothing to do, nothing flows out of the Switch and the run ends quietly.

---

### The problem branch

### Lane 2 · Build problem update *(Code)*
**What:** reduces each problem item to exactly `content_id`, `last_error`, `updated_at`.
**Why:** the Sheets update node writes every field it is given. Sending it the extra `kind` field would add a new column to your sheet. So the node before every update strips the item down to the key plus the columns Lane 2 owns.

### Lane 2 · Update CONTENT with problem *(Google Sheets, Update row)*
**What:** finds the row by `content_id` and writes only `last_error` and `updated_at`. The `status` stays `approved`.
**Why:** you see the reason right in the sheet, and Lane 2 does not log the same problem again.

### Lane 2 · Build problem log *(Code)*
**What:** builds one `error` event per problem row (detail names the field, `meta_json` has the node and message).
**Why:** EVENTS_LOG is the history Lane 8 reports from. Every action and failure is logged using only the event types in SPEC 5.6.

### Lane 2 · Save problem to EVENTS_LOG *(Google Sheets, Append row)*
**What:** appends those events to the EVENTS_LOG tab.
**Why:** appends use `cellFormat: RAW`, so Google never converts our text into dates or formulas.

---

### The post branch (captions, short posts, blog teasers, reel briefs)

### Lane 2 · Loop over posts *(Loop Over Items, batch size 1)*
**What:** hands the posts to the next nodes **one at a time**. Output 1 ("loop") is the next post; output 0 ("done") ends the branch.
**Why:** *act → update → log* must finish for post 1 before post 2 starts. If something stops half-way, at most one post is in doubt.

### Lane 2 · Build Telegram message *(Code)*
**What:** writes the Telegram text and picks the destination (`chat_id`):
* `ig_caption`, `short_post` → channel: body, blank line, hashtags, blank line, `👉 Join the waitlist: <link>` (a channel has no "link in bio").
* `blog_article` → channel: `📝 New on the Kaya Jewels blog`, bold title, meta description, `Read: /blog/<slug> (demo)` and the waitlist link. The full article stays in the sheet (there is no real website).
* `reel_idea` → **your private chat**: `🎬 Reel brief: <title>`, the shot notes, the caption and hashtags.

All sheet text is HTML-escaped (`&`, `<`, `>`), because the message is sent with `parse_mode: HTML`. The message is kept under 4,000 characters (Telegram's limit is 4,096) by shortening the long free-text part and adding `…`, never cutting an HTML entity in half.
**Why:** one place builds every message, so what is sent is easy to check.

### Lane 2 · Send to Telegram *(Telegram, Send message)*
**What:** sends `text` to `chat_id` using the credential `Kaya Demo · Telegram Bot`. *Retry on fail* is on (3 tries, 3 s apart). *On error → continue using error output* means a failure does not stop the lane: it leaves through the second output.
**Why:** a post that fails after retries must be recorded as failed while the other posts still go out. Both outputs go to the same next node.

### Lane 2 · Build publish result *(Code)*
**What:** looks at what came out of Telegram. If a `message_id` came back → the update is `status = published`, `published_at = now`, `publish_ref = tg:<message_id>`, `last_error = ""`. If not → `status = failed` and `last_error = "Telegram: <reason>"`.
**Why:** success and failure meet here so the *same* update and log nodes handle both.

### Lane 2 · Update CONTENT after post *(Google Sheets, Update row)*
**What:** writes that result to the row **immediately after sending**, matched on `content_id`.
**Why:** this is the "never send twice" step. Once the row says `published`, no later run will pick it up.

### Lane 2 · Build post log *(Code)*
**What:** one event: `content_published` (channel `telegram_channel`, or `telegram_owner` for a reel brief) or `publish_failed` with the error.
**Why:** it reads the message context (asset type, channel) from `Build Telegram message`: inside a loop each node runs once per round, so those rounds line up.

### Lane 2 · Save post to EVENTS_LOG *(Google Sheets, Append row)*
**What:** appends the event, then the item goes back to the loop for the next post.

---

### The newsletter branch

### Lane 2 · Newsletter needs publishing? *(IF)*
**What:** is this newsletter still `approved` (true) or already `publishing` (false)?
**Why:** the first time only, the row must move `approved → publishing` so a human (and Lane 8) can see the broadcast has begun. On later runs the status is already `publishing` and this step is skipped.

### Lane 2 · Build publishing update *(Code)*
**What:** outputs `content_id`, `status = publishing`, `updated_at`.

### Lane 2 · Mark newsletter publishing *(Google Sheets, Update row)*
**What:** writes it. Then both paths (first run and later runs) continue to **Read LEADS**.

### Lane 2 · Read LEADS *(Google Sheets, Read rows)*
**What:** reads the LEADS tab, only now, when a newsletter is really due.
**Why:** the LEADS tab can get long; reading it every minute for nothing would be wasteful. *Always output data* keeps the run going if the tab is empty.

### Lane 2 · Pick newsletter recipients *(Code)*
**What:** from the LEADS rows it works out:
* **Active leads** (SPEC 3.2): `status` is new / nurturing / nurture_done / replied / hot, `consent` is TRUE and `email_allowed` is not FALSE.
* **Waiting**: active leads whose `last_newsletter_id` is not this newsletter.
* **Ready**: waiting leads that pass the gap rule (`last_contacted_at` is at least `MIN_EMAIL_GAP_DAYS` ago, scaled by the demo clock). The first `MAX_SENDS_PER_RUN` of them become recipients.

For each recipient it fills the placeholders (`{{first_name}}`, `{{unsubscribe_line}}`, …). The **subject** is plain text; the **body** is HTML, so names and settings are HTML-escaped before they go in (a name like `<b>` cannot inject markup). If the body has no `{{unsubscribe_line}}`, the line is added at the end. If nobody can be emailed this minute, it outputs a single "summary" item so the run can still decide whether the broadcast is finished. It also records how many leads were waiting before this run.
**Why:** the whole "who gets what, and is it allowed?" decision is in one node, driven only by the sheet.

### Lane 2 · Any recipient to send? *(IF)*
**What:** `recipient_count > 0`? **True** → the sending loop. **False** → straight to *Check newsletter finished*.
**Why:** a loop with zero items does not run at all, so this keeps the "finished?" check alive when nobody is ready.

### Lane 2 · Loop over recipients *(Loop Over Items, batch size 1)*
**What:** one lead at a time. Output 1 is the next lead, output 0 ("done") fires after the last lead.
**Why:** one email, one row update, one log line, one pause, then the next person. Each lead's row is updated before the next lead is touched.

### Lane 2 · Demo safety gate *(Code)*
**What:** the standard gate from SPEC 5.7. It reads the lead's address, strips any `+tag`, and allows it only if the base address is in `ALLOWED_DEMO_INBOXES` or `SENDER_EMAIL`, or the domain is in `ALLOWED_EMAIL_DOMAINS` (public domains like gmail.com are ignored there). It sets `gate_ok`, `safe_to` (the cleaned address, or empty) and a `gate_reason`.
**Why:** this is a demo. Even if a real address ends up in the sheet, no email can leave for it.

### Lane 2 · Recipient allowed? *(IF)*
**What:** is `gate_ok` true? **True** → Gmail. **False** → the blocked path.
**Why:** the only way to reach the Gmail node is through this true output (the validator checks it).

### Lane 2 · Send newsletter email *(Gmail, Send message)*
**What:** sends `subject` and HTML `html` to `{{ $json.safe_to }}` from the `Kaya Demo · Gmail Sender` account, with the display name `SENDER_NAME` and *no* "sent with n8n" footer.
**Settings worth knowing:** *Retry on fail* is **off**. A retry after a half-failed send could email the same person twice, which is worse than trying again on the next minute. *On error → continue using error output*: a failure leaves through the second output and is logged without stopping the lane.

### Lane 2 · Build lead update *(Code)*
**What:** (after a successful send) outputs `lead_id`, `last_newsletter_id = this newsletter`, `last_contacted_at = now`, `thread_ids` (the Gmail thread id added to the list, last 10 kept) and `updated_at`.
**Why:** `last_newsletter_id` is how Lane 2 *resumes*: next minute the lead no longer counts as waiting. `last_contacted_at` makes other lanes respect the gap rule. `thread_ids` lets Lane 7 match this person's replies.

### Lane 2 · Update LEAD after send *(Google Sheets, Update row)*
**What:** writes it, matched on `lead_id`. This happens **before** the next lead is processed.

### Lane 2 · Build blocked update *(Code)*
**What:** (when the gate said no) outputs `lead_id`, `status = blocked`, `email_allowed = FALSE`, `updated_at`.

### Lane 2 · Update LEAD as blocked *(Google Sheets, Update row)*
**What:** writes it. A blocked lead is no longer "active", so it stops counting as waiting, and no lane will try this address again.

### Lane 2 · Build send log *(Code)*
**What:** all three outcomes meet here, once per round: **sent** → `email_sent` (meta: `content_id`, `thread_id`); **blocked** → `email_blocked` (status → blocked, with the reason); **Gmail error** → `email_failed` (with the error). It also passes along the pause length (`SEND_DELAY_SECONDS`) for the Wait node.
**Why:** a failed lead is deliberately *not* advanced: its row is unchanged, so a later run tries again.

### Lane 2 · Save send to EVENTS_LOG *(Google Sheets, Append row)*
**What:** appends that one event.

### Lane 2 · Pause between emails *(Wait, a few seconds)*
**What:** waits `SEND_DELAY_SECONDS` (default 6) and returns to the loop.
**Why:** gentle sending pace and Gmail limits. It is a few seconds, never longer than 60 (SPEC 5.5). Hours-long waits are done with dates in the sheet instead.

### Lane 2 · Check newsletter finished *(Code)*
**What:** arrives from the loop's "done" output (or from *Any recipient to send?* when nobody was ready). It counts the `email_sent` and `email_blocked` events of this run and computes `still waiting = waiting before − sent − blocked`. If **0**, it outputs the CONTENT update `status = published`, `published_at`, `publish_ref = "newsletter:<total sent> sent"`. If anyone is still waiting (a failed send, or someone behind the gap rule) it outputs nothing and the next run carries on.
**Why:** this is the rule from SPEC 7.2: finished means no active lead is left without this newsletter.

### Lane 2 · Update CONTENT after newsletter *(Google Sheets, Update row)*
**What:** marks the newsletter `published`.

### Lane 2 · Build newsletter done log *(Code)*
**What:** one `content_published` event, channel `email`, `publish_ref = newsletter:N sent`.

### Lane 2 · Save newsletter done to EVENTS_LOG *(Google Sheets, Append row)*
**What:** appends it. The run ends.

---

## Settings Lane 2 reads

`DEMO_MODE`, `DEMO_MINUTES_PER_DAY`, `LAUNCH_DATE`, `EARLY_ACCESS_DAYS`, `WAITLIST_FORM_URL`, `SENDER_NAME`, `SENDER_EMAIL`, `ALLOWED_DEMO_INBOXES`, `ALLOWED_EMAIL_DOMAINS` (optional), `MAX_SENDS_PER_RUN`, `SEND_DELAY_SECONDS`, `MIN_EMAIL_GAP_DAYS`, `MAX_POSTS_PER_RUN`, `TELEGRAM_OWNER_CHAT_ID`, `TELEGRAM_CHANNEL_ID`, `UNSUBSCRIBE_LINE`.

## Newsletter placeholders Lane 2 can fill

`{{first_name}}` (falls back to "there"), `{{city}}`, `{{unsubscribe_line}}`, `{{launch_date}}`, `{{public_launch_date}}`, `{{waitlist_form_url}}`, `{{sender_name}}`. Anything else (for example `{{brand_name}}`) makes the newsletter a "problem" row and nothing is sent, because Lane 2 does not read the BRIEF tab (SPEC 5.11: an unfillable placeholder means *do not send*).

## Things to know when you run it

* **Approve, then wait up to a minute.** Set `status` to `approved`; when `scheduled_for` is in the past the next run posts it. Lane 1's `scheduled_for` already includes the demo clock.
* **A `failed` row is not retried by itself.** Read `last_error`, fix the cause (for example the bot is not an admin of the channel), then set `status` back to `approved`.
* **A newsletter shows `publishing` while it is being broadcast** and turns `published` when nobody is left waiting. Leads that were mailed another email less than `MIN_EMAIL_GAP_DAYS` ago simply wait their turn.
* **Runs must not overlap.** A normal run takes a few seconds (a newsletter run up to `MAX_SENDS_PER_RUN × (SEND_DELAY_SECONDS + 3)` seconds, 27 s by default), well inside the one-minute schedule. If you raise those settings so a run lasts longer than a minute, two runs could overlap and see the same rows; keep the product under about 45 seconds.
* **If Google Sheets is unreachable right after a send**, the row update is retried 3 times. If it still fails, that one post or email has been sent but not recorded, and the next run would send it again. This is the one-item window that "act → update" cannot close; the retries make it very unlikely.
