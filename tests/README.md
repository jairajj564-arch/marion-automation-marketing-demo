# tests/

Test scripts, mocks and results for every lane. Nothing here is needed to run the demo; it is the evidence that the lanes behave as SPEC.md says, and a way to re-check them after a change.

Sessions 2, 3 and 4 were built in parallel, so each brought its own (equivalent) harness. All three are kept as they were; session 5 added `e2e/` (the whole-campaign storyline on the merged canvas).

| Lanes | Generator (source of the lane JSON) | Harness + mock | Scenarios | Results |
|---|---|---|---|---|
| 2, 3 | `lane-src/build-lanes.mjs` (+ `lane-src/lane-2/`, `lane-3/`) | `common/` | `lane-2/run.mjs`, `lane-2/live-schedule.mjs`, `lane-3/run.mjs` | `lane-2/RESULTS.md`, `lane-3/RESULTS.md` |
| 4, 5, 8 | `build/build-lane-N.mjs` (+ `build/code/*.js`) | `lib/` | `lane-4/run.mjs`, `lane-5/run.mjs`, `lane-8/run.mjs` | `lane-N/RESULTS.md` |
| 6, 7 | `lane-6/build-lane-6.mjs`, `lane-7/build-lane-7.mjs` (+ `_shared/build-lib.mjs`) | `_shared/` | `lane-6/run-tests.mjs`, `lane-7/run-tests.mjs` | `lane-6/RESULTS.md`, `lane-7/RESULTS.md` |
| all | `tools/build-canvas.mjs` (the one-canvas file) | `e2e/` | `e2e/run.mjs` (the demo storyline) | `e2e/RESULTS.md` |

Import checks (dummy credentials with the exact SPEC names, import, export, check every credential got linked by name): `common/import-test.mjs`, `import-check.mjs`, `_shared/import-check.mjs` (per session) and `e2e/import-check.mjs` (session 5: the canvas + every lane, with a full round-trip comparison). `e2e/ui-import-check.mjs` does the owner's real path in a browser: editor → *Import from File* → Save (needs Playwright). `IMPORT-CHECK.md` holds the last result.

The end-to-end storyline (`e2e/run.mjs` + `e2e/world.mjs`) runs the whole canvas: every lane in one n8n, a sheet seeded from `sheets-template/`, two Gmail mailboxes with real Gmail threading, the lanes started concurrently on their cron offsets, and checks on every sheet write against SPEC's column ownership. `refresh-results.mjs` rewrites all `RESULTS.md` files from the logs of `run-all.sh`.

## How every harness works

The file in `lanes/` is the real lane and is never modified. The harness makes an in-memory **test copy**:

* the trigger (Schedule / Gmail / Form) becomes a **Webhook** node, so a test can start a run and wait for it to finish (Lane 7: a small Code node keeps the trigger's name and hands over the messages the trigger would have delivered);
* each **Google Sheets / Gmail / Telegram** node becomes an **HTTP Request** stub with the same name and settings that talks to a local mock of the sheet (seeded from `sheets-template/*.csv`, writes only the columns it is given, like the real update node), Gmail, Telegram, Gemini and Groq;
* the **Gemini / Groq** HTTP nodes are pointed at the mock.

Everything else is the real node from the real file: Code, IF, Switch, Loop Over Items, Wait. n8n 1.123.84 runs it as a real server (`n8n start`, workflow active, webhook called over HTTP), under both expression engines (`vm`, the default, and `legacy`).

## Run it yourself

Needs Node 22+ (the harnesses read n8n's execution records with the built-in `node:sqlite`).

```bash
S=~/n8n-scratch; mkdir -p $S/n8n && cd $S/n8n
echo '{"name":"scratch","private":true,"dependencies":{"n8n":"1.123.84"},"overrides":{"xlsx":"0.18.5"}}' > package.json
npm install                       # the override avoids the cdn.sheetjs.com download that can answer 403
export KAYA_SCRATCH=$S            # lanes 2, 3 and e2e (expects $S/n8n/node_modules/.bin/n8n)
export N8N_SCRATCH=$S/n8n         # lanes 4, 5, 8
export N8N_BIN=$S/n8n/node_modules/.bin/n8n   # lanes 6, 7
cd /path/to/repo
tests/run-all.sh                  # every lane, both engines, + import checks + e2e (about 60–90 minutes)
# ENGINES=vm FINAL=0 tests/run-all.sh & ENGINES=legacy FINAL=0 tests/run-all.sh   # the two engines in parallel, then FINAL steps
```

Or one at a time: `node tests/lane-2/run.mjs vm`, `node --no-warnings tests/lane-4/run.mjs legacy`, `node tests/lane-6/run-tests.mjs vm`, `node tests/e2e/run.mjs vm` …

When a lane run straddles midnight IST, a check that compares today's date can fail once (the lane and the test disagree on "today"); re-run it.

After editing a generator, rebuild the lane and the canvas:

```bash
node lane-src/build-lanes.mjs                       # lanes 2, 3
node tests/build/build-lane-4.mjs                   # (and 5, 8)
node tests/lane-6/build-lane-6.mjs; node tests/lane-7/build-lane-7.mjs
node tools/build-canvas.mjs                         # lanes/marion-marketing-engine.json
```

Nothing in `tests/` contains a secret; `node_modules` is never committed.

## What the mocks cannot prove

Live calls to Google Sheets, Gmail, Telegram, Gemini and Groq, and the real Gmail Trigger / Form Trigger / Schedule Trigger nodes (except `lane-2/live-schedule.mjs`, which keeps the real Schedule Trigger). The response shapes the lanes rely on were checked in the n8n 1.123.84 source: the Telegram node returns `{ ok, result: { message_id } }`-style data, the Gmail send node returns `{ id, threadId }`, the Sheets update node only writes the columns it receives. Your first real run is the live test (see `SETUP.md`).
