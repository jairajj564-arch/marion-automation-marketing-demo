# SETUP: from zero to a running demo (Windows PC, n8n running locally)

This guide assumes n8n already runs on your PC and opens at **http://localhost:5678** in your browser (installed with `npx n8n`, the n8n desktop app or Docker Desktop: all work). Everything else is free: Google Sheets, two Gmail accounts, Google AI Studio (Gemini), Groq and Telegram.

Plan about 60–90 minutes the first time. Do the parts in order; each one ends with a quick check.

| Part | What you do | Time |
|---|---|---|
| A | Two Gmail accounts | 10 min |
| B | The Google Sheet (8 tabs from `sheets-template/`) | 10 min |
| C | Telegram bot + channel | 10 min |
| D | Google Cloud OAuth client (for Sheets and Gmail) | 15 min |
| E | Gemini and Groq keys | 5 min |
| F | The 6 credentials in n8n (exact names) | 10 min |
| G | Fill SETTINGS | 5 min |
| H | Put your sheet id into the canvas, import it | 5 min |
| I | First run checklist | 20 min |

> **Copy-paste names exactly.** Credential names, tab names and settings keys must match character for character. The `·` in credential names is a *middle dot* (not a full stop). Copy it from this page.

---

## A. Two Gmail accounts

1. Create (or reuse) a Gmail account for **the shop**, the "Kaya Jewels" sender. Example: `kayademo.hello@gmail.com`. Every email of the demo is sent from it, and replies arrive in it.
2. Create a second Gmail account for **the customers**. Example: `kayademo.customers@gmail.com`. Every fake lead and prospect uses a *plus-address* of it (`kayademo.customers+lead01@gmail.com`, `kayademo.customers+boutique1@gmail.com` …). Gmail delivers all of these to the one inbox, so every demo email lands somewhere you can see.

Write both addresses down. If yours are different from the examples, you will put them in SETTINGS in part G.

**Why two accounts:** the safety gate in every lane refuses to email anyone except your demo inboxes, so the demo can never email a real person.

---

## B. The Google Sheet

1. Signed in as the **shop** account, open https://sheets.google.com and create a blank spreadsheet. Name it `Kaya Jewels · Diwali demo (Marion Enroute)`.
2. Create **8 tabs** (the `+` at the bottom left) and name them exactly, in capitals:
   `SETTINGS` · `BRIEF` · `CONTENT` · `LEADS` · `PROSPECTS` · `SEQUENCES` · `EVENTS_LOG` · `DASHBOARD`
   (Rename the first tab "Sheet1" to `SETTINGS`: double-click its name.)
3. Fill each tab from its CSV in the `sheets-template` folder of this repo (download the repo as ZIP from GitHub: **Code → Download ZIP**, then unzip it). For **each** tab:
   1. Click the tab.
   2. **File → Import → Upload**, choose the CSV with the same name (e.g. `LEADS.csv` for the LEADS tab).
   3. Import location: **Replace current sheet**.
   4. **Untick "Convert text to numbers, dates, and formulas"**. This matters: it keeps timestamps, phone numbers and TRUE/FALSE as plain text, the way the lanes write them.
   5. **Import data**.
4. Copy the **sheet id** from the address bar. The URL looks like
   `https://docs.google.com/spreadsheets/d/`**`1AbCdEfGh…xyz`**`/edit#gid=0`
   The id is the long part between `/d/` and `/edit`. Paste it into a Notepad file; you need it in parts G and H.

✅ **Check:** 8 tabs; LEADS has 15 sample leads, PROSPECTS 12 prospects, SEQUENCES 15 steps, SETTINGS 32 keys.

---

## C. Telegram bot and channel

1. In Telegram, open **@BotFather** → send `/newbot` → give it a name (e.g. `Kaya Demo Bot`) and a username ending in `bot`. BotFather replies with a **token** like `1234567890:AAH…`. Keep it secret; it goes only into n8n (part F).
2. Open the chat with your new bot and press **Start** (a bot cannot message you before you do this).
3. **Your chat id:** in your browser open
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` (replace `<YOUR_TOKEN>`, keep the word `bot` in front of it).
   Look for `"chat":{"id":123456789` and note that number: it is your `TELEGRAM_OWNER_CHAT_ID`. (Empty result? Send the bot any message, then reload.)
4. **The channel** (the stand-in for Instagram): Telegram → New Channel → name it e.g. `Kaya Jewels Demo` → **Public**, pick a link such as `t.me/kayajewels_demo_yourname`. Your `TELEGRAM_CHANNEL_ID` is that name with `@`: `@kayajewels_demo_yourname`.
5. Channel → **Administrators → Add Admin** → search your bot → allow **Post Messages** → Save.

✅ **Check:** you have a token, a number (your chat id) and `@your_channel`.

---

## D. Google Cloud OAuth client (one client for Sheets and both Gmail accounts)

n8n needs permission to use Google Sheets and Gmail. You create one free "OAuth client" for that.

1. Go to https://console.cloud.google.com (signed in as the shop account) → project picker at the top → **New project** → name `Kaya Demo` → Create, and select it.
2. **APIs & Services → Library**, search and **Enable** each of: **Gmail API**, **Google Sheets API**, **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (newer consoles call it **Google Auth Platform**): Get started → app name `Kaya Demo n8n`, your email as support and contact email → Audience **External** → Create.
4. **Audience → Test users → Add users**: add **both** Gmail addresses from part A. (While the app is "in testing", only these accounts may sign in.)
5. **Clients → Create client** → Application type **Web application** → name `n8n local`.
   Under **Authorized redirect URIs** add exactly: `http://localhost:5678/rest/oauth2-credential/callback`
   (n8n shows this same URL as "OAuth Redirect URL" when you create a Google credential; if yours differs, use the one n8n shows.)
6. Create → copy the **Client ID** and **Client secret** into your Notepad file.

> **Good to know:** while the app is in *Testing* mode Google expires the sign-in after 7 days. If a Google credential suddenly fails after a week, open it in n8n and click **Sign in with Google** again. (Or, on the Audience page, click **Publish app**; for a personal demo you can then click through Google's "unverified app" warning.)

---

## E. Gemini and Groq keys (free)

1. **Gemini:** https://aistudio.google.com → **Get API key** → Create API key → copy it.
2. **Groq** (the fallback when Gemini is busy): https://console.groq.com → sign up → **API Keys → Create API Key** → copy it (it is shown only once).

---

## F. The 6 credentials in n8n (exact names)

In n8n: **Overview → Credentials → Create credential** (or the **+** in the left bar → Credential). For each row below: search the type, then **rename the credential at the top of the dialog** to the exact name (click the default name to edit it), fill the fields, **Save**.

| # | Exact name (copy it) | Type to search | What to fill |
|---|---|---|---|
| 1 | `Kaya Demo · Google Sheets` | Google Sheets OAuth2 API | Client ID + Client secret from part D → **Sign in with Google** → choose the **shop** account (it owns the sheet) → allow |
| 2 | `Kaya Demo · Gmail Sender` | Gmail OAuth2 API | Same Client ID + secret → Sign in with Google → choose the **shop** account (`kayademo.hello@…`) |
| 3 | `Kaya Demo · Gmail Demo Customers` | Gmail OAuth2 API | Same Client ID + secret → Sign in with Google → choose the **customers** account (`kayademo.customers@…`) |
| 4 | `Kaya Demo · Gemini` | Google Gemini(PaLM) Api | Host: leave `https://generativelanguage.googleapis.com` · API Key: from part E |
| 5 | `Kaya Demo · Groq` | Groq | API Key: from part E |
| 6 | `Kaya Demo · Telegram Bot` | Telegram API | Access Token: the BotFather token |

Google's sign-in window may say "Google hasn't verified this app": click **Continue** (it is your own app). Tick every permission box it offers.

✅ **Check:** the Credentials list shows all six names exactly as above, each with a green "connected"/saved state. Wrong names are the #1 reason a node later shows "credential not found"; rename to fix.

**Why names matter:** the workflow file contains no secrets, only these names. When you import it, n8n links each node to the credential with the same name (tested: all 83 references link, see `tests/IMPORT-CHECK.md`).

---

## G. Fill SETTINGS (in the sheet)

Open the **SETTINGS** tab and change the `value` column of these rows (leave the rest):

| key | value | Example |
|---|---|---|
| `SENDER_EMAIL` | your shop Gmail | `kayademo.hello@gmail.com` |
| `ALLOWED_DEMO_INBOXES` | your customers Gmail (the safety gate allows only this and its plus-addresses) | `kayademo.customers@gmail.com` |
| `TELEGRAM_OWNER_CHAT_ID` | your chat id from part C | `123456789` |
| `TELEGRAM_CHANNEL_ID` | your channel with `@` | `@kayajewels_demo_yourname` |
| `SHEET_URL` | your sheet's URL (used for links in Telegram messages) | `https://docs.google.com/spreadsheets/d/1AbC…/edit` |
| `DEMO_MODE` | keep `TRUE` (1 day = 2 minutes) for demos | `TRUE` |
| `DEMO_LAUNCH_AT` | leave **blank for now**; set it just before a demo (part I) | |

If your customers address is not `kayademo.customers@gmail.com`, also replace that address in the `email` columns of **LEADS** and **PROSPECTS** (Edit → Find and replace, "Search: This sheet") so the sample people are your plus-addresses.

`LAUNCH_DATE` (`2026-10-26`) is the date *shown* in emails and posts; change it if you like. `WAITLIST_FORM_URL` is already `http://localhost:5678/form/kaya-waitlist`.

---

## H. Put your sheet id into the canvas (one place) and import it

The whole demo is **one file**: `lanes/marion-marketing-engine.json`. It contains the placeholder `__KAYA_SHEET_ID__` in every Google Sheets node, so you replace it once, in that one file:

1. Right-click `lanes\marion-marketing-engine.json` → **Open with → Notepad**.
2. **Ctrl+H** (Replace). Find what: `__KAYA_SHEET_ID__` · Replace with: your sheet id from part B → **Replace All** (62 replacements).
3. **File → Save As** → name it `my-marketing-engine.json` (Encoding: UTF-8) → Save. (Keeping the original untouched lets you redo this later.)

   *PowerShell alternative* (from the unzipped repo folder):
   ```powershell
   $id = 'PASTE_YOUR_SHEET_ID'
   $t = [IO.File]::ReadAllText("$PWD\lanes\marion-marketing-engine.json").Replace('__KAYA_SHEET_ID__', $id)
   [IO.File]::WriteAllText("$PWD\my-marketing-engine.json", $t)
   ```
4. In n8n: **Overview → Create Workflow**, then the **⋯** menu (top right) → **Import from File…** → choose `my-marketing-engine.json`.
5. You see one big canvas: a grey overview note at the top, then 8 coloured bands, `Lane 1 · Content engine` at the top to `Lane 8 · Report` at the bottom. **Save** (Ctrl+S). Saving is when n8n links the credentials by name.
6. Spot-check the links: double-click `Lane 1 · Read SETTINGS` → the credential field says `Kaya Demo · Google Sheets`. Double-click `Lane 4 · Send nurture email` → `Kaya Demo · Gmail Sender`. Close.

> The individual lane files (`lanes/lane-1-…json` … `lane-8-…json`) are the same lanes one by one, handy if you ever want to import a single lane. You don't need them for the demo.

---

## I. First run checklist

Work through this once before any client demo. In n8n, **Executions** (top of the canvas) shows every run with the data of every node: that is where to look when something is off.

**1. Lane 1 by hand (workflow still inactive).**
Click the small arrow next to **Execute workflow** (bottom centre) → choose **Lane 1 · Start** → run. It takes 1–2 minutes (5 AI calls with pauses).
✅ CONTENT has 13 new rows with status `pending_approval` · Telegram: "🪔 Content ready for approval: 13 items" · EVENTS_LOG has new rows.

**2. Approve content.** In CONTENT set `status` = `approved` on 3–4 rows (e.g. the blog, a caption, the newsletter). Their `scheduled_for` is a few minutes ahead in demo mode.

**3. Activate.** Toggle **Inactive → Active** (top right). From now on Lanes 2, 4, 5, 6, 7 and 8 run on their own; the two forms work.
✅ Within a minute or two: approved posts appear in your Telegram channel when their `scheduled_for` passes; reel ideas arrive in your private chat; the sample leads start getting nurture emails in the customers inbox (3 per minute).

**4. Lead form (Lane 3 → Lane 4).** Wait about 3 minutes after activating: the sample sheet starts with 9 leads whose nurture email is overdue, and Lane 4 sends 3 per minute, oldest first, so a brand-new sign-up queues behind them. Then open http://localhost:5678/form/kaya-waitlist, sign up with `kayademo.customers+you1@gmail.com` (choose a budget above ₹5,000 to make it a hot lead).
✅ "You're on the list!" page · a new LEADS row (status `new`) · Telegram "🔥 New hot lead" · within ~1 minute the welcome email "You're on the list, <name> ✨" in the customers inbox.

**5. Outreach (Lane 6).** Every 2 minutes 3 prospects get a personal email (highest fit score first).
✅ Emails to `kayademo.customers+boutique…` / `+influencer…` in the customers inbox; PROSPECTS rows move to `contacted`.

**6. A hot reply (Lane 7).** After Saanjh Boutique has its email, open http://localhost:5678/form/kaya-demo-reply, enter `kayademo.customers+boutique1@gmail.com`, pick **Interested** → Submit.
✅ Within ~1 minute: Telegram "🔥 HOT: Saanjh Boutique replied: …" · PROSPECTS `PR-B01` status `interested` · no more emails to it.
(Type the exact plus-address. The reply is sent in the same Gmail thread, which is how Lane 7 knows whose reply it is.)

**7. Launch (Lane 5).** In SETTINGS set `DEMO_LAUNCH_AT` to about 6–15 minutes from now, e.g. `2026-10-10 18:30` (your local time, IST).
✅ The "2 days to go" post ~4 minutes before; at that time the "Early access is open" email (with the code `ROSHNI10`) to every active lead, 3 per minute, plus the channel post; a reminder 2 minutes later; the public-launch post 4 minutes after.

**8. Report (Lane 8).** Every 10 minutes in demo mode.
✅ Telegram "📊 Kaya Jewels · campaign report" with numbers and 3 insights · DASHBOARD values filled.

**Stop / reset.** Toggle the workflow **Inactive** when you are done (otherwise Lanes 2–8 keep checking every minute). To start a fresh demo, re-import the CSVs (part B, step 3) into the tabs that changed (CONTENT, LEADS, PROSPECTS, SEQUENCES, EVENTS_LOG, DASHBOARD), then fill SETTINGS again (or keep your SETTINGS tab as it is).

---

## When something goes wrong

| You see | Likely cause | Fix |
|---|---|---|
| Node shows a red triangle "credential not found" / "Credentials not set" | credential name differs from the table in part F | rename the credential exactly, or pick it in the node's credential dropdown, Save |
| `The SETTINGS tab is missing a value for: …` | a SETTINGS row is empty or renamed | fill that key in SETTINGS |
| Google Sheets error "Requested entity was not found" | sheet id not replaced, or replaced with the full URL | redo part H with just the id |
| Google error after about a week | OAuth app in Testing mode expired the sign-in | open the credential → Sign in with Google again (part D note) |
| Telegram "chat not found" | wrong chat id, or you never pressed Start in the bot chat | part C steps 2–3 |
| Telegram "not enough rights" for the channel | bot is not admin with Post Messages | part C step 5 |
| No email ever arrives; EVENTS_LOG shows `email_blocked` | the address is not your demo inbox / plus-address | check `ALLOWED_DEMO_INBOXES` and the email in the row |
| Lane 1 says every AI job failed | Gemini key wrong / free-tier limit reached, and Groq too | check both keys; try `GEMINI_MODEL` = `gemini-2.5-flash-lite` |
| Lane 7 logs `reply_unmatched` | a reply that is not in a thread the lanes sent (e.g. a new email written from the customers inbox) | reply *inside* the email thread, or use the demo reply form |
| "Execute workflow" runs the wrong lane | the button runs the trigger shown under it | use the arrow next to it and pick **Lane 1 · Start** |

More detail per lane: `NODES.md` (Lane 1) and `docs/lane-2.md` … `docs/lane-8.md` · the rules: `SPEC.md` · status of the project and known limits: `PROGRESS.md`.
