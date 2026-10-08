# tests/

Test scripts, mocks and results for the lanes. Nothing here is needed to run the demo; it is the evidence that the lanes work.

| Path | What it is |
|---|---|
| `lane-6/` | `build-lane-6.mjs` (writes `lanes/lane-6-outreach.json`), `run-tests.mjs` (19 end-to-end scenarios), `RESULTS.md` |
| `lane-7/` | `build-lane-7.mjs` (writes `lanes/lane-7-inbox.json`), `run-tests.mjs` (20 end-to-end scenarios), `RESULTS.md` |
| `_shared/build-lib.mjs` | helpers the two build scripts share (node factories, the SPEC code snippets) |
| `_shared/mock-server.mjs` | a tiny local mock of the Google Sheet (state in memory, seeded from `sheets-template/*.csv`), Gmail, Telegram, Gemini and Groq |
| `_shared/harness.mjs` | turns a lane file into a **test copy** and runs it in a real n8n server |
| `_shared/import-check.mjs` | imports lane files into a scratch n8n with the 6 dummy credentials and checks every credential reference is linked by name |
| `_shared/check-syntax.mjs` | parses every Code node of a lane file |

## How the tests work

The file in `lanes/` is the real lane and is never modified. The harness makes an in-memory **copy** for testing:

* the trigger (Schedule / Gmail / Form) becomes a **Webhook** node (for Lane 7 a small Code node keeps the trigger's name and hands over the messages the trigger would have delivered),
* each **Google Sheets / Gmail / Telegram** node becomes an **HTTP Request** stub with the same name and the same settings (retry, On Error, Always Output Data, Execute Once) that talks to the local mock. The stub reads the real node's parameters, so the test fails if, for example, the Gmail `sendTo` expression changes,
* the **Gemini / Groq** HTTP nodes are pointed at the mock (credential removed),
* waits between retries are shortened to 100 ms; the lane's own waits are kept (SETTINGS in the mock use 1 s instead of 6 s).

Everything else is the real node from the real file: Code, IF, Switch, Loop Over Items, Wait. n8n 1.123.84 runs it as a real server (`n8n start`, workflow active, webhook called over HTTP).

## Run it yourself

```bash
mkdir -p /tmp/n8n-scratch && cd /tmp/n8n-scratch
echo '{"name":"scratch","private":true,"dependencies":{"n8n":"1.123.84"},"overrides":{"xlsx":"0.18.5"}}' > package.json
npm install                                   # the override avoids the cdn.sheetjs.com download that can answer 403
export N8N_BIN=/tmp/n8n-scratch/node_modules/.bin/n8n
cd /path/to/repo
node tests/lane-6/build-lane-6.mjs && node tests/lane-7/build-lane-7.mjs      # regenerate the lane files
node tools/validate-workflow.mjs lanes/lane-6-outreach.json
node tools/validate-workflow.mjs lanes/lane-7-inbox.json
node tests/_shared/import-check.mjs lanes/lane-6-outreach.json lanes/lane-7-inbox.json
node tests/lane-6/run-tests.mjs vm            # n8n's default expression engine
node tests/lane-6/run-tests.mjs legacy        # N8N_EXPRESSION_ENGINE=legacy
node tests/lane-7/run-tests.mjs vm
node tests/lane-7/run-tests.mjs legacy
```

Node 22+ is needed (the harness reads n8n's execution records with the built-in `node:sqlite`). Never commit `node_modules` or secrets; the tests use none.
