# End-to-end demo storyline: test results

Run on 2026-10-09 with **n8n 1.123.84** (real server, `n8n start`), once with the default expression engine (`vm`) and once with `N8N_EXPRESSION_ENGINE=legacy`, by `tests/e2e/run.mjs`.

**What runs:** the ONE canvas `lanes/marion-marketing-engine.json` as a test copy: every trigger became a Webhook (the test plays the scheduler), Google Sheets / Gmail / Telegram nodes became HTTP calls to `tests/e2e/world.mjs`, Gemini / Groq were pointed at it. Every Code, IF, Switch, Loop Over Items and Wait node is the real one from the canvas.

**The world:** one in-memory sheet seeded from `sheets-template/` (15 sample leads, 12 prospects); two Gmail mailboxes with their own thread ids that thread a reply by `In-Reply-To` and build the reply's recipients exactly like n8n 1.123.84's Gmail node; Telegram; realistic latency (Sheets 250 ms, Gmail 400 ms). A virtual clock moves every stored timestamp back one minute per tick. Each minute the lanes start on their cron offsets (scaled 3×) **concurrently**, with a 2 s pause between emails, so runs overlap as on the PC. Every sheet write is checked against SPEC's "Written by" columns.

**Storyline (DEMO_MODE TRUE, 1 day = 2 minutes, DEMO_LAUNCH_AT = start + 6 min):** Lane 1 creates content → 4 rows approved → Lane 2 publishes → a lead fills the waitlist form (Lane 3) → Lane 4 sends the nurture sequence → DEMO_LAUNCH_AT arrives (Lane 5) → Lane 6 emails prospects → a prospect replies "interested" through the demo reply form (Lane 7 → hot alert) → Lane 8 report. Then cross-lane invariants over the whole run.

### Engine: `vm` — 60/60 checks passed

- ✔ **0 · fresh sheet from sheets-template/, SETTINGS for the demo** (2/2)
- ✔ **1 · Lane 1 creates content (13 rows pending_approval + Telegram approval list)** (5/5)
- ✔ **2 · the owner approves the first 4 rows in the sheet** (1/1)
- ✔ **3 · a lead fills the waitlist form (Lane 3): scored hot, saved as new, owner alerted, no email yet** (3/3)
- ✔ **4 · 18 demo minutes of the schedule: publishing, nurture, outreach, a prospect reply, the launch, the report** (1/1)
- ✔ **5 · Lane 2 published the approved content (channel posts, newsletter by email) exactly once** (8/8)
- ✔ **6 · Lane 4 nurtured Riya: the welcome first (after the sample-data backlog, 3 per minute), then the next steps on the demo clock, never twice** (2/2)
- ✔ **7 · Lane 5 launched at DEMO_LAUNCH_AT: countdown + launch posts, the early-access email with the code to every active lead** (6/6)
- ✔ **8 · Lane 6 emailed the prospects (3 per run, highest fit first) with an AI opener** (3/3)
- ✔ **9 · the reply: in the SAME thread, from the bare demo address → Lane 7 → interested + 🔥 HOT alert → Lane 6 stops** (12/12)
- ✔ **10 · Lane 8 report: DASHBOARD numbers match the sheet, Telegram report sent** (8/8)
- ✔ **11 · cross-lane invariants over the whole run** (9/9)

<details><summary>Timeline (virtual minutes)</summary>

| min | what happened |
|---|---|
| 0 | Lane 1 generated 13 items; approval list on Telegram |
| 0 | approved: blog_article (due 01:12), ig_caption (due 01:13), newsletter (due 01:14), ig_caption (due 01:15) |
| 0 | Riya joined the waitlist (score 100, hot) |
| 0 | 6 email(s) (Early access opens Monday, 26 October · 3 Roshni pieces we can't stop wearing · Meet the hands behind The Roshni Edit · Gulmohar Concept Store x Kaya Jewels for · A Diwali collab with Kaya Jewels? 🪔), 1 Telegram (owner), 0 inbox mail(s); events: email_sent×6, sequence_completed×1, ai_call×4, dashboard_updated×1, report_sent×1 |
| 1 | 3 email(s) (You're on the list, Sneha ✨ · 3 Roshni pieces we can't stop wearing · You're on the list, Meera ✨), 0 Telegram (-), 0 inbox mail(s); events: email_sent×3 |
| 2 | 6 email(s) (Meet the hands behind The Roshni Edit · You're on the list, Shreya ✨ · You're on the list, Isha ✨ · Saanjh Boutique x Kaya Jewels for Diwali · A Diwali collab with Kaya Jewels? 🪔 · Neel Kamal Studio x Kaya Jewels for Diwa), 2 Telegram (channel, channel), 0 inbox mail(s); events: content_published×1, email_sent×6, launch_post_published×1, ai_call×3 |
| 3 | demo reply form: Saanjh Boutique answers "Interested" (in the Demo Customers inbox) |
| 3 | 3 email(s) (You're on the list, Nandini ✨ · You're on the list, Riya ✨ · Meet the hands behind The Roshni Edit), 2 Telegram (channel, owner), 1 inbox mail(s); events: content_published×1, email_sent×3, ai_call×1, reply_received×1, hot_alert_sent×1 |
| 4 | 9 email(s) (A first look at The Roshni Edit ✨ · Meet the hands behind The Roshni Edit · Early access opens Monday, 26 October · 3 Roshni pieces we can't stop wearing · A Diwali collab with Kaya Jewels? 🪔 · Kesariya Couture x Kaya Jewels for Diwal), 1 Telegram (channel), 0 inbox mail(s); events: content_published×1, email_sent×9, sequence_completed×1, ai_call×3 |
| 5 | 9 email(s) (A first look at The Roshni Edit ✨ · Meet the hands behind The Roshni Edit · Early access is open: your 10% code is i · Early access opens Monday, 26 October), 1 Telegram (channel), 0 inbox mail(s); events: email_sent×9, launch_post_published×1, sequence_completed×1 |
| 6 | 12 email(s) (A first look at The Roshni Edit ✨ · Meet the hands behind The Roshni Edit · Early access ends Wednesday, 28 October · 3 Roshni pieces we can't stop wearing · Re: Gulmohar Concept Store x Kaya Jewels · Re: A Diwali collab with Kaya Jewels? 🪔), 0 Telegram (-), 0 inbox mail(s); events: email_sent×12 |
| 7 | 9 email(s) (A first look at The Roshni Edit ✨ · 3 Roshni pieces we can't stop wearing · Early access ends Wednesday, 28 October · Early access opens Monday, 26 October), 1 Telegram (channel), 0 inbox mail(s); events: email_sent×9, launch_post_published×1, sequence_completed×1 |
| 8 | 10 email(s) (A first look at The Roshni Edit ✨ · 3 Roshni pieces we can't stop wearing · Early access ends Wednesday, 28 October · Re: A Diwali collab with Kaya Jewels? 🪔 · Re: Neel Kamal Studio x Kaya Jewels for  · The Chikan Room x Kaya Jewels for Diwali), 0 Telegram (-), 0 inbox mail(s); events: email_sent×10, content_published×1, ai_call×1 |
| 9 | 6 email(s) (3 Roshni pieces we can't stop wearing · Early access ends Wednesday, 28 October · Early access opens Monday, 26 October), 0 Telegram (-), 0 inbox mail(s); events: email_sent×6, sequence_completed×1 |
| 10 | 7 email(s) (Early access opens Monday, 26 October · Early access ends Wednesday, 28 October · Re: A Diwali collab with Kaya Jewels? 🪔 · Re: Kesariya Couture x Kaya Jewels for D), 1 Telegram (owner), 0 inbox mail(s); events: email_sent×7, sequence_completed×2, dashboard_updated×1, ai_call×1, report_sent×1 |
| 11 | 2 email(s) (Early access opens Monday, 26 October), 0 Telegram (-), 0 inbox mail(s); events: email_sent×2, sequence_completed×2 |
| 12 | 3 email(s) (Last note from Kaya Jewels), 0 Telegram (-), 0 inbox mail(s); events: email_sent×3, sequence_completed×3 |
| 13 | 2 email(s) (Early access opens Monday, 26 October), 0 Telegram (-), 0 inbox mail(s); events: email_sent×2, sequence_completed×2 |
| 14 | 3 email(s) (Last note from Kaya Jewels · Re: The Chikan Room x Kaya Jewels for Di), 0 Telegram (-), 0 inbox mail(s); events: email_sent×3, sequence_completed×2 |
| 15 | 0 email(s), 0 Telegram (-), 0 inbox mail(s); events: - |
| 16 | 3 email(s) (Last note from Kaya Jewels · Mitti & Moti x Kaya Jewels for Diwali? · A Diwali collab with Kaya Jewels? 🪔), 0 Telegram (-), 0 inbox mail(s); events: email_sent×3, sequence_completed×1, ai_call×2 |
| 17 | 0 email(s), 0 Telegram (-), 0 inbox mail(s); events: - |
| 28 | Lane 8 report: 95 emails, 16 leads, 1 interested prospect(s), reply rate 8.3% |

</details>

### Engine: `legacy` — 60/60 checks passed

- ✔ **0 · fresh sheet from sheets-template/, SETTINGS for the demo** (2/2)
- ✔ **1 · Lane 1 creates content (13 rows pending_approval + Telegram approval list)** (5/5)
- ✔ **2 · the owner approves the first 4 rows in the sheet** (1/1)
- ✔ **3 · a lead fills the waitlist form (Lane 3): scored hot, saved as new, owner alerted, no email yet** (3/3)
- ✔ **4 · 18 demo minutes of the schedule: publishing, nurture, outreach, a prospect reply, the launch, the report** (1/1)
- ✔ **5 · Lane 2 published the approved content (channel posts, newsletter by email) exactly once** (8/8)
- ✔ **6 · Lane 4 nurtured Riya: the welcome first (after the sample-data backlog, 3 per minute), then the next steps on the demo clock, never twice** (2/2)
- ✔ **7 · Lane 5 launched at DEMO_LAUNCH_AT: countdown + launch posts, the early-access email with the code to every active lead** (6/6)
- ✔ **8 · Lane 6 emailed the prospects (3 per run, highest fit first) with an AI opener** (3/3)
- ✔ **9 · the reply: in the SAME thread, from the bare demo address → Lane 7 → interested + 🔥 HOT alert → Lane 6 stops** (12/12)
- ✔ **10 · Lane 8 report: DASHBOARD numbers match the sheet, Telegram report sent** (8/8)
- ✔ **11 · cross-lane invariants over the whole run** (9/9)

<details><summary>Timeline (virtual minutes)</summary>

| min | what happened |
|---|---|
| 0 | Lane 1 generated 13 items; approval list on Telegram |
| 0 | approved: blog_article (due 01:12), ig_caption (due 01:12), newsletter (due 01:14), ig_caption (due 01:14) |
| 0 | Riya joined the waitlist (score 100, hot) |
| 0 | 6 email(s) (Early access opens Monday, 26 October · 3 Roshni pieces we can't stop wearing · Meet the hands behind The Roshni Edit · Gulmohar Concept Store x Kaya Jewels for · A Diwali collab with Kaya Jewels? 🪔), 1 Telegram (owner), 0 inbox mail(s); events: email_sent×6, sequence_completed×1, ai_call×4, dashboard_updated×1, report_sent×1 |
| 1 | 3 email(s) (You're on the list, Sneha ✨ · 3 Roshni pieces we can't stop wearing · You're on the list, Meera ✨), 0 Telegram (-), 0 inbox mail(s); events: email_sent×3 |
| 2 | 6 email(s) (Meet the hands behind The Roshni Edit · You're on the list, Shreya ✨ · You're on the list, Isha ✨ · Saanjh Boutique x Kaya Jewels for Diwali · A Diwali collab with Kaya Jewels? 🪔 · Neel Kamal Studio x Kaya Jewels for Diwa), 2 Telegram (channel, channel), 0 inbox mail(s); events: content_published×1, email_sent×6, launch_post_published×1, ai_call×3 |
| 3 | demo reply form: Saanjh Boutique answers "Interested" (in the Demo Customers inbox) |
| 3 | 3 email(s) (You're on the list, Nandini ✨ · You're on the list, Riya ✨ · Meet the hands behind The Roshni Edit), 2 Telegram (channel, owner), 1 inbox mail(s); events: content_published×1, email_sent×3, ai_call×1, reply_received×1, hot_alert_sent×1 |
| 4 | 9 email(s) (A first look at The Roshni Edit ✨ · Meet the hands behind The Roshni Edit · Early access opens Monday, 26 October · 3 Roshni pieces we can't stop wearing · A Diwali collab with Kaya Jewels? 🪔 · Kesariya Couture x Kaya Jewels for Diwal), 1 Telegram (channel), 0 inbox mail(s); events: content_published×1, email_sent×9, sequence_completed×1, ai_call×3 |
| 5 | 9 email(s) (A first look at The Roshni Edit ✨ · Meet the hands behind The Roshni Edit · Early access is open: your 10% code is i · Early access opens Monday, 26 October), 1 Telegram (channel), 0 inbox mail(s); events: email_sent×9, launch_post_published×1, sequence_completed×1 |
| 6 | 12 email(s) (A first look at The Roshni Edit ✨ · Meet the hands behind The Roshni Edit · Early access ends Wednesday, 28 October · 3 Roshni pieces we can't stop wearing · Re: Gulmohar Concept Store x Kaya Jewels · Re: A Diwali collab with Kaya Jewels? 🪔), 0 Telegram (-), 0 inbox mail(s); events: email_sent×12 |
| 7 | 9 email(s) (A first look at The Roshni Edit ✨ · 3 Roshni pieces we can't stop wearing · Early access ends Wednesday, 28 October · Early access opens Monday, 26 October), 1 Telegram (channel), 0 inbox mail(s); events: email_sent×9, launch_post_published×1, sequence_completed×1 |
| 8 | 10 email(s) (A first look at The Roshni Edit ✨ · 3 Roshni pieces we can't stop wearing · Early access ends Wednesday, 28 October · Re: A Diwali collab with Kaya Jewels? 🪔 · Re: Neel Kamal Studio x Kaya Jewels for  · The Chikan Room x Kaya Jewels for Diwali), 0 Telegram (-), 0 inbox mail(s); events: email_sent×10, content_published×1, ai_call×1 |
| 9 | 6 email(s) (3 Roshni pieces we can't stop wearing · Early access ends Wednesday, 28 October · Early access opens Monday, 26 October), 0 Telegram (-), 0 inbox mail(s); events: email_sent×6, sequence_completed×1 |
| 10 | 7 email(s) (Early access opens Monday, 26 October · Early access ends Wednesday, 28 October · Re: A Diwali collab with Kaya Jewels? 🪔 · Re: Kesariya Couture x Kaya Jewels for D), 1 Telegram (owner), 0 inbox mail(s); events: email_sent×7, sequence_completed×2, dashboard_updated×1, ai_call×1, report_sent×1 |
| 11 | 2 email(s) (Early access opens Monday, 26 October), 0 Telegram (-), 0 inbox mail(s); events: email_sent×2, sequence_completed×2 |
| 12 | 3 email(s) (Last note from Kaya Jewels), 0 Telegram (-), 0 inbox mail(s); events: email_sent×3, sequence_completed×3 |
| 13 | 2 email(s) (Early access opens Monday, 26 October), 0 Telegram (-), 0 inbox mail(s); events: email_sent×2, sequence_completed×2 |
| 14 | 3 email(s) (Last note from Kaya Jewels · Re: The Chikan Room x Kaya Jewels for Di), 0 Telegram (-), 0 inbox mail(s); events: email_sent×3, sequence_completed×2 |
| 15 | 0 email(s), 0 Telegram (-), 0 inbox mail(s); events: - |
| 16 | 3 email(s) (Last note from Kaya Jewels · Mitti & Moti x Kaya Jewels for Diwali? · A Diwali collab with Kaya Jewels? 🪔), 0 Telegram (-), 0 inbox mail(s); events: email_sent×3, sequence_completed×1, ai_call×2 |
| 17 | 0 email(s), 0 Telegram (-), 0 inbox mail(s); events: - |
| 28 | Lane 8 report: 95 emails, 16 leads, 1 interested prospect(s), reply rate 8.3% |

</details>

## Does the storyline catch real bugs? (mutation check, session 5)

The same storyline was run once against the lane files as they were merged from PRs #2–#4 (commit `0557060`, before the session 5 fixes), `vm` engine. It failed exactly where the fixes are:

```text
✖ 9 · the reply: in the SAME thread, from the bare demo address → Lane 7 → interested + 🔥 HOT alert → Lane 6 stops
     ✖ Reply to Sender Only: the reply as sent is addressed to the sender only (not back to the plus-address):
       expected ["kayademo.hello@gmail.com"], got ["kayademo.hello@gmail.com","kayademo.customers+boutique1@gmail.com"]
✖ 11 · cross-lane invariants over the whole run
     ✖ nobody got two automated emails inside MIN_EMAIL_GAP_DAYS (Lanes 2, 4, 5 and 6 together):
       got ["kayademo.customers+lead04@gmail.com: "Early access ends Wednesday, 28 October" then "Early access opens Monday, 26 October" 0 s apart"]
E2E storyline [vm]: 12 scenarios, 60 checks, 2 failed
```

The second one is the known Lane 4 / Lane 5 overlap: Lane 5's launch email and Lane 4's nurture email reached the same lead in the same second. With the fixed lanes both checks pass.
