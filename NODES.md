# NODES.md: the whole canvas, node by node

**Where each lane is explained** (every node: what it does and why):

| Lane | Guide | Lane file | Trigger |
|---|---|---|---|
| 1 Content engine | this file (below) | `lanes/lane-1-content-engine.json` | manual: **Lane 1 · Start** |
| 2 Publisher | [`docs/lane-2.md`](docs/lane-2.md) | `lanes/lane-2-publisher.json` | every minute |
| 3 Lead engine | [`docs/lane-3.md`](docs/lane-3.md) | `lanes/lane-3-lead-engine.json` | form `/form/kaya-waitlist` |
| 4 Sequence sender | [`docs/lane-4.md`](docs/lane-4.md) | `lanes/lane-4-sequence-sender.json` | every minute |
| 5 Launch engine | [`docs/lane-5.md`](docs/lane-5.md) | `lanes/lane-5-launch-engine.json` | every minute |
| 6 Outreach | [`docs/lane-6.md`](docs/lane-6.md) | `lanes/lane-6-outreach.json` | every 2 minutes |
| 7 Inbox | [`docs/lane-7.md`](docs/lane-7.md) | `lanes/lane-7-inbox.json` | Gmail polling + form `/form/kaya-demo-reply` |
| 8 Report | [`docs/lane-8.md`](docs/lane-8.md) | `lanes/lane-8-report.json` | every 5 minutes |

**The one canvas** `lanes/marion-marketing-engine.json` holds all 8 lanes: one horizontal band per lane (Lane 1 at the top), each framed by a coloured sticky note `Lane N · <name>` with 2–3 lines on what it does, and the overview note `Canvas · Marion Enroute — Marketing Engine demo` above Lane 1 with the 5-step demo script. The lanes are not connected to each other; they only share the Google Sheet. It is built from the lane files by `node tools/build-canvas.mjs`, so the nodes are the same as in the lane files and in the guides.

**Nodes added in session 5** (the merge), all explained in their lane's guide:
* `Lane 4 · Re-read LEADS` → `Lane 4 · Check lead is still due` → `Lane 4 · Still due?` and `Lane 6 · Re-read PROSPECTS` → `Lane 6 · Check prospect is still due` → `Lane 6 · Still due?`: right before an email, the lane looks at the row again. If Lane 7 recorded a reply, or another lane emailed the person seconds ago, nothing is sent and Lane 7's status is kept.
* Lanes 2 (newsletter) and 5 (launch emails) leave a lead to Lane 4 while its nurture email is due (code change inside `Pick newsletter recipients` / `Pick launch work`), so nobody gets two emails seconds apart.
* `Lane 7 · Reply in Demo Customers inbox` now has **Reply to Sender Only**, and the demo form only accepts a known lead/prospect address.

---

# Lane 1 (Content engine), node by node

This guide explains every node in `lanes/lane-1-content-engine.json`: what it does and **why it is there**. It assumes you are new to n8n. The rules behind the design are in `SPEC.md`; this file is the friendly tour.

## First, six n8n ideas you need

1. **Workflow**: the canvas. Ours will hold 8 lanes; Lane 1 is the first.
2. **Node**: one box on the canvas that does one job (read a sheet, call an API, run code…).
3. **Item**: n8n passes data between nodes as a list of *items*. Each item is one JSON object, like one row of a table. If a node receives 13 items, most nodes run once **per item**. Keeping track of "how many items are flowing here?" explains most n8n surprises.
4. **Expression**: anything written as `{{ … }}` inside a node setting is calculated at run time. `{{ $json.chat_id }}` means "the `chat_id` field of the item arriving here".
5. **Credential**: a saved login (API key, Google account). Nodes refer to credentials by name; the secret itself stays inside n8n, never in our JSON files.
6. **Execution**: one run of the workflow. Open **Executions** in n8n to see every run, node by node, with the exact data that went in and out. This is the best debugging tool you have.

## The shape of Lane 1

```
Start → Read SETTINGS → Settings to object → Read BRIEF → Build brief facts → List asset jobs → Loop over asset jobs
                                                                                                    │ loop (one job at a time)
        ┌───────────────────────────────────────────────────────────────────────────────────────────┘
        ▼
  Build AI request → Ask Gemini → Read Gemini reply → Check AI answer → Need Groq fallback? ─true→ Ask Groq → Read Groq reply ─┐
                                                          ▲                     │ false                                         │
                                                          └─────────────────────┼───────────────────────────────────────────────┘
                                                                                ▼
                                                              Pause between AI calls → (back to the loop)

  Loop "done" → Turn answers into content rows → SEO & quality checks → Schedule & assign IDs → Save to CONTENT
             → Build approval message → Telegram me for approval → Build log events → Save to EVENTS_LOG
```

On the canvas the main line runs left to right along the top, the AI loop sits underneath it, and the big yellow sticky note frames the whole lane.

---

## The nodes

### Lane 1 · Content engine *(sticky note)*
**What:** the yellow frame behind the lane, with a short description at the top.
**Why:** the final canvas will have 8 lanes. The frame tells anyone looking at the canvas (you, or a client during a demo) what this lane does, how it starts and which credentials it needs. Sticky notes never run; they are labels.

### Lane 1 · How the AI loop works *(sticky note)*
**What:** a second, smaller note under the left half of the lane explaining the loop in 5 steps.
**Why:** loops are the hardest part of n8n to read at a glance. This note lets you explain the loop in a demo without opening any node.

### Lane 1 · Start *(Manual Trigger)*
**What:** starts the lane when you click **Execute workflow** (when the full canvas has several triggers, pick **Lane 1 · Start** in the dropdown next to the button).
**Why:** content generation should happen when *you* decide, not on a timer, because every run uses free AI quota and creates 13 rows for you to review. n8n allows only **one** Manual Trigger per workflow, so this one is reserved for Lane 1 (SPEC 5.5).

### Lane 1 · Read SETTINGS *(Google Sheets, Read rows)*
**What:** reads every row of the `SETTINGS` tab. Each row becomes one item, e.g. `{ key: "GEMINI_MODEL", value: "gemini-2.5-flash", … }`.
**Why:** all the knobs (demo mode, model names, Telegram chat id, posting times…) live in the sheet so you can change them without touching the workflow.
**Settings worth knowing:** the document id is the placeholder `__KAYA_SHEET_ID__` (replace it with your sheet's id before importing). The tab is chosen **by name**, so renaming a tab breaks it. "Retry on fail" is on (3 tries, 3 s apart) because Google sometimes answers with a temporary error.

### Lane 1 · Settings to object *(Code)*
**What:** turns the many SETTINGS items into **one** item: `{ DEMO_MODE: "TRUE", GEMINI_MODEL: "gemini-2.5-flash", … }`. It also adds two calculated fields: `IS_DEMO` (true/false) and `DAY_MS` (how many milliseconds "one day" lasts: 2 minutes in demo mode, 24 hours otherwise). If a required key is missing, it stops with a message naming it.
**Why:** two reasons. (1) Later nodes can now say `$('Lane 1 · Settings to object').first().json.GEMINI_MODEL` instead of searching a list. (2) Going from many items to one item means the next Google Sheets node runs **once**. If 32 items reached `Read BRIEF`, it would read the BRIEF tab 32 times.

### Lane 1 · Read BRIEF *(Google Sheets, Read rows)*
**What:** reads every row of the `BRIEF` tab: the brand facts, products, prices, offer, writing rules.
**Why:** BRIEF is the **only** place the AI is allowed to get facts from. Keeping it in the sheet means you can fix a price or add a product and the next run uses it, with no prompt editing.

### Lane 1 · Build brief facts *(Code)*
**What:** prepares the brief for the AI:
- fills the date tokens (`{{launch_date}}` → "Monday, 26 October") from SETTINGS,
- builds a numbered **facts list** (`F01 [brand_name] Kaya Jewels`, …) from rows marked `all` or `consumer`,
- builds the **writing rules** list from rows marked `rule`,
- collects what the quality checks need later: allowed prices (every ₹ amount in the facts), allowed percentages, forbidden phrases, the SEO keyword list, and the discount code (so we can flag it if the AI leaks it).

**Why:** doing this once, in one place, keeps every prompt consistent and makes the "AI must never invent facts" rule checkable: if a price in the output is not in this list, it was invented.

### Lane 1 · List asset jobs *(Code)*
**What:** outputs 5 items, one per AI job: `blog_article`, `ig_captions`, `reel_ideas`, `newsletter`, `blog_repurpose`. It also creates the `batch_id` (e.g. `B-20261008-143205`) that ties this run's rows together.
**Why:** the requirement is **one AI call per asset type**. Turning the jobs into items lets one set of AI nodes handle all five in a loop, instead of five copies of the same nodes. The blog is first on purpose: the repurpose job (last) needs the finished blog.

### Lane 1 · Loop over asset jobs *(Loop Over Items, batch size 1)*
**What:** hands the jobs to the AI nodes **one at a time**. It has two outputs: **loop** (bottom: "here is the next job") and **done** (top: "all jobs finished, here are all the results").
**Why:** free AI tiers allow only a few requests per minute. Processing jobs one by one, with a pause between them (see *Pause between AI calls*), keeps us under the limit. Sending all 5 at once would likely trigger "429 Too Many Requests".

### Lane 1 · Build AI request *(Code)*
**What:** writes the prompt for the current job and packs two ready-to-send request bodies:
- the **system prompt**: who the AI is, the brand voice from SETTINGS, the strict fact rules, the writing rules and the numbered BRIEF facts;
- the **job prompt**: exactly what to write (word counts, character limits, number of items, required placeholders);
- `gemini_body`: Gemini's format, with **JSON mode and a schema** (Gemini must answer with JSON in exactly that shape), plus a cap on "thinking" tokens (`GEMINI_THINKING_BUDGET`);
- `groq_body`: Groq's format (OpenAI-style), with JSON mode and an example of the expected shape.

For the repurpose job it looks back at the first loop round, takes the blog article and puts it in the prompt.
**Why:** building both bodies here means the fallback gets the *same* instructions as the main model, and the HTTP nodes stay simple (they just send `$json.gemini_body`).

### Lane 1 · Ask Gemini *(HTTP Request)*
**What:** sends `POST https://generativelanguage.googleapis.com/v1beta/models/<GEMINI_MODEL>:generateContent` with the Gemini body. The credential `Kaya Demo · Gemini` adds your API key to the URL.
**Why an HTTP Request node and not an "AI" node:** the plain HTTP call lets us use Gemini's native **JSON mode + schema**, which makes the answer reliably machine-readable, and it is a core node that will not change under us.
**Settings worth knowing:**
- *Retry on fail*: 3 tries, 5 s apart (Gemini sometimes answers "overloaded" for a moment).
- *On error → Continue*: if all 3 tries fail, the node does **not** stop the workflow; it outputs an item with an `error` field. That is what lets us fall back to Groq instead of crashing.
- *Timeout*: 120 s, because a 900-word article takes a while.

### Lane 1 · Read Gemini reply *(Code)*
**What:** digs the answer text out of Gemini's response (`candidates[0].content.parts[].text`), or records why there is none: the call failed, the answer was blocked, or it stopped early (for example it ran out of tokens).
**Why:** Gemini's response is deeply nested. Reducing it to `{ provider, text, error }` lets the next node treat Gemini and Groq the same way.

### Lane 1 · Check AI answer *(Code)*
**What:** the quality gate for **both** providers. It removes stray ```` ``` ```` fences, parses the JSON and checks the minimum shape (the blog has all 5 fields and is not tiny, there are 5 captions, 3 reels, 3 short posts…). It outputs:
- `ai_ok` (true/false), `ai_provider`, `ai_error`, and the parsed `ai_data`;
- `try_groq` = true only when the answer is unusable **and** it came from Gemini;
- `groq_body` (only when Groq is needed) and `pause_seconds` for the nodes that follow.

**Why:** an HTTP "success" is not the same as a usable answer. Checking here catches broken JSON or missing parts and sends the job to the fallback. Passing `groq_body` and `pause_seconds` forward keeps the next nodes' settings to a simple `{{ $json.… }}` (SPEC 5.12 explains why that matters).

### Lane 1 · Need Groq fallback? *(IF)*
**What:** one condition: is `try_groq` true? **True** → ask Groq. **False** → go to the pause (either the answer is good, or Groq already failed too).
**Why:** this is the "Gemini first, Groq if needed" decision, made visible on the canvas.

### Lane 1 · Ask Groq (fallback) *(HTTP Request)*
**What:** sends `POST https://api.groq.com/openai/v1/chat/completions` with `groq_body`. The credential `Kaya Demo · Groq` adds the `Authorization: Bearer` header. Same retry (3×, 5 s), timeout and "continue on error" settings as Gemini.
**Why:** Groq's free tier is generous and fast, so it is a good safety net when Gemini's free quota runs out mid-demo.

### Lane 1 · Read Groq reply *(Code)*
**What:** takes the text from `choices[0].message.content` (or the error), and remembers *why* we fell back (Gemini's error) in `fallback_reason`. Its output goes back into **Check AI answer**, so Groq's answer gets exactly the same check.
**Why:** one check for both providers means one set of rules to maintain.

### Lane 1 · Pause between AI calls *(Wait, a few seconds)*
**What:** waits `AI_WAIT_SECONDS` (default 6) and then hands the result back to the loop, which moves on to the next job.
**Why:** free-tier rate limits. It is also the only Wait in this lane, and it is a few seconds long: SPEC 5.5 forbids long Waits, because a Wait of hours would be lost if your PC loses power. Long delays are done with dates in the sheet (`scheduled_for`) instead.

### Lane 1 · Turn answers into content rows *(Code)*
**What:** runs once, after the loop's **done** output delivers all 5 results. It splits them into rows: 1 blog + 5 captions + 3 reel ideas + 1 newsletter + 3 short posts = **13 rows**. It cleans hashtags (`#Tag` form), makes a tidy slug, and formats each reel's hook, numbered shot list, audio idea and length into `media_notes`. Jobs that failed on both providers are skipped. If **every** job failed, it stops the run with an error listing each reason.
**Why:** the sheet needs one row per publishable item, in the columns defined in SPEC 2.3.

### Lane 1 · SEO & quality checks *(Code)*
**What:** gives every row a 0–100 score (`seo_score`) and a list of problems (`issues`).
- **Blog = SEO checks** (points): SEO title ≤ 60 chars (10), meta description 120–155 (10), keyword in SEO title (15), keyword in meta (5), keyword in the first paragraph (10), keyword in an H2 (10), heading structure: one H1 first, ≥ 3 H2, no skipped levels (10), 600–900 words (10), readability: Flesch score ≥ 50 and ≤ 20 words per sentence (10), keyword density 0.5–2.5 % (5), clean slug (5).
- **Captions, reels, newsletter, short posts = format checks**: hook length, caption length, number of hashtags, brand hashtags present, waitlist call to action present, emoji limit, shot count, reel length, newsletter placeholders and allowed HTML, 280-character limit…
- **Fact check on everything** (−10 points each, listed first as `FACT: …`): forbidden phrases (e.g. "real gold", "certified"), any ₹ price or % not found in the BRIEF facts, and the discount code appearing before launch.

**Why:** you approve faster when the sheet tells you what to look at, and the fact check is the safety net behind the "AI must never invent facts" rule.

### Lane 1 · Schedule & assign IDs *(Code)*
**What:**
- orders the rows into a pleasant calendar (blog, caption, newsletter, caption, reel, short post, …) so the feed never shows the same type three times in a row;
- gives each a `content_id` like `CNT-20261008-143205-01`, and links each short post to the blog (`source_content_id`);
- gives each a `scheduled_for` time: the `POST_TIMES` slots (11:00 and 19:00) starting `CONTENT_START_IN_DAYS` days from now. **In demo mode** the same calendar is squeezed (1 day = 2 minutes), so the 13 slots fall within the next ~15 minutes instead of 7 days;
- sets `status = pending_approval` and shapes each row into exactly the CONTENT columns.

**Why:** Lane 2 (Publisher) only publishes rows that are `approved` **and** whose `scheduled_for` time has passed. That is how a delay of days works without a long Wait node.

### Lane 1 · Save to CONTENT *(Google Sheets, Append)*
**What:** appends the 13 rows to the `CONTENT` tab.
**Settings worth knowing:** *Map automatically* (each field goes to the column with the same name), *Cell format: RAW* (text stays text, so Sheets never turns timestamps into dates), *Handling extra data: ignore*.

### Lane 1 · Build approval message *(Code)*
**What:** writes one Telegram message: "Content ready for approval: 13 items", a numbered list (type, title, score, posting time), and warnings for items with issues (FACT problems called out first), jobs that used the Groq fallback, and jobs that failed. It ends with how to approve and a link to the sheet (once `SHEET_URL` holds your real sheet id). Titles are HTML-escaped so a `<` or `&` in AI text cannot break Telegram's formatting, and the list is shortened line by line if the message would pass Telegram's 4,096-character limit.
**Why:** you get a phone notification with everything needed to decide, without opening n8n.

### Lane 1 · Telegram me for approval *(Telegram, Send message)*
**What:** sends that message to `TELEGRAM_OWNER_CHAT_ID` with the `Kaya Demo · Telegram Bot` credential, in HTML mode, without link previews and **without** n8n's "sent automatically with n8n" footer.
**Why:** Telegram stands in for both your notifications and (in Lane 2) Instagram. Retry is on (3×), and *On error → Continue*, so a wrong chat id does not lose the run's log; the problem is recorded in EVENTS_LOG instead.

### Lane 1 · Build log events *(Code)*
**What:** creates the EVENTS_LOG rows for this run: one `content_generated` per row, one `ai_call` per job (plus `ai_fallback` when Groq was used and `ai_failed` when both failed), one `approval_requested` (with whether Telegram worked) and one `lane_run` summary (items created, failures, fallbacks, duration in seconds).
**Why:** Lane 8 (Report) builds the dashboard and the daily report by counting these events, and the log is how you can prove to a client what the automation did.

### Lane 1 · Save to EVENTS_LOG *(Google Sheets, Append)*
**What:** appends those event rows to `EVENTS_LOG`. Same settings as *Save to CONTENT*.

---

## Running Lane 1 for the first time

1. Create the Google Sheet from `sheets-template/` (see `PROGRESS.md` → "Setup").
2. In n8n, create the credentials with the **exact names** from SPEC section 1 (at least Google Sheets, Gemini, Groq, Telegram Bot for Lane 1).
3. In `lanes/lane-1-content-engine.json`, replace `__KAYA_SHEET_ID__` with your sheet id, then import the file (**Workflows → Import from File**). The nodes pick up the credentials by name; if a node still shows a credential warning, open it and select the credential once.
4. In the sheet's SETTINGS tab set at least `TELEGRAM_OWNER_CHAT_ID` (message your bot, then open `https://api.telegram.org/bot<token>/getUpdates` to find your chat id).
5. Click **Execute workflow**. The run takes about 1–2 minutes (5 AI calls with pauses). Then check the CONTENT tab and your Telegram.

## When something goes wrong

| What you see | Likely cause | What to do |
|---|---|---|
| "The SETTINGS tab is missing a value for: …" | a key was renamed or deleted | add the key back (copy from `sheets-template/SETTINGS.csv`) |
| Google Sheets node: "Sheet with name … not found" | tab renamed, or wrong sheet id | tab names must match exactly; check `__KAYA_SHEET_ID__` was replaced |
| Every job shows the Groq fallback | Gemini key wrong, model name unknown, or daily free quota used up | open an execution, look at *Read Gemini reply* → `error`. Try `GEMINI_MODEL = gemini-2.5-flash-lite`, or blank `GEMINI_THINKING_BUDGET` for models without thinking |
| "Every AI job failed, so there is nothing to save" | both providers failing (no internet, both keys wrong, both quotas used) | the message lists each job's reason |
| Telegram message missing, but rows were saved | wrong `TELEGRAM_OWNER_CHAT_ID`, or you never pressed Start in the bot chat | EVENTS_LOG `approval_requested` shows `telegram_ok: false` with the error |
| A row has `FACT:` issues | the AI used a phrase, price or % that is not in BRIEF | edit the row (or set `rejected`), then approve; never publish a FACT row unchanged |
