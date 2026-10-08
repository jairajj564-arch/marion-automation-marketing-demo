# marion-automation-marketing-demo

A free, self-hosted **n8n** demo by **Marion Enroute**: a complete marketing and outreach campaign for a fictional client, **Kaya Jewels** (handmade jewellery on Instagram, India), launching its Diwali collection **The Roshni Edit** (waitlist gets early access + 10% off).

One n8n canvas, 8 independent lanes, one Google Sheet as the database:

| Lane | What it does | Trigger |
|---|---|---|
| 1 Content engine | AI writes a blog (with SEO checks), captions, reel ideas, a newsletter and short posts; asks you to approve | manual |
| 2 Publisher | posts approved content to a Telegram channel (stand-in for Instagram), sends the newsletter | every minute |
| 3 Lead engine | waitlist form → scored lead | form |
| 4 Sequence sender | nurture emails to the waitlist | every minute |
| 5 Launch engine | countdown posts and launch emails | every minute |
| 6 Outreach | personalised emails to boutiques and micro-influencers | every 2 minutes |
| 7 Inbox | classifies replies, hot-lead alerts | Gmail polling |
| 8 Report | dashboard + Telegram report | every 5 minutes |

Costs $0: n8n on your PC, Google Sheets, Gmail, Gemini free tier (Groq as fallback), Telegram. No API keys are stored in this repo, and a safety gate stops any email to an address outside the demo inboxes.

**Start here:** [`SPEC.md`](SPEC.md) (the contract) · [`PROGRESS.md`](PROGRESS.md) (status, setup, next steps) · [`NODES.md`](NODES.md) (Lane 1 explained node by node) · `sheets-template/` (one CSV per tab) · `lanes/` (one workflow file per lane) · `tools/validate-workflow.mjs` (checks a lane file against the spec).
