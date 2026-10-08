# Tests for Lanes 4, 5 and 8 (session 3)

Nothing here is needed to run the demo. It is the proof that the lanes behave as SPEC.md says, and a way to re-check them after a change.

## What is here

| Path | What it is |
|---|---|
| `build/` | The **source** of `lanes/lane-4-*.json`, `lane-5-*.json` and `lane-8-*.json`: `build-lane-N.mjs` assembles the nodes and `build/code/*.js` holds the readable JavaScript of every Code node (shared SPEC snippets are in the `_*.js` files). Re-generate with `node tests/build/build-lane-4.mjs` (and 5, 8). The committed JSON is the real, importable lane; the generator is only for maintainers. |
| `lib/mock.mjs` | A tiny local "world": an in-memory Google Sheet (8 tabs seeded from `sheets-template/`), Gmail, Telegram, Gemini and Groq. It writes only the columns it is given, exactly like the Sheets update node, and can fail on demand. |
| `lib/testcopy.mjs` | Makes the TEST COPY of a lane: trigger → Webhook; Google Sheets / Gmail / Telegram → HTTP Request nodes that call the mock; Gemini / Groq → pointed at the mock. All Code/IF/Loop/Wait nodes stay unchanged. |
| `lib/n8n.mjs` | Starts a real `n8n start` (1.123.84) with the test copies imported and active. |
| `lane-N/run.mjs` | The scenarios for each lane. `RESULTS.md` next to it is the last result. |
| `import-check.mjs` | Imports the REAL lane files after creating dummy credentials with the exact SPEC names, exports them and checks that every credential reference was linked by name. |
| `run-all.sh` | Runs everything (each lane under both expression engines) and rewrites the `RESULTS.md` files. |

## Re-running

```bash
mkdir -p ~/n8n-scratch && cd ~/n8n-scratch
echo '{"name":"scratch","version":"1.0.0","overrides":{"xlsx":"0.18.5"}}' > package.json   # works around the xlsx tarball 403
npm install n8n@1.123.84
export N8N_SCRATCH=~/n8n-scratch          # where node_modules/.bin/n8n lives (default /tmp/claude-0/n8n-scratch)
cd <repo> && tests/run-all.sh             # ~25 minutes; or: node --no-warnings tests/lane-4/run.mjs vm
```

Needs Node 22 (uses the built-in `node:sqlite` to read stored error messages). Nothing in `tests/` contains a secret; `node_modules` is never committed.

## What the mock cannot prove

Live calls to Google Sheets, Gmail, Telegram, Gemini and Groq. Those are covered by the first real run (see the PR description). The shapes the lanes rely on were checked in the n8n 1.123.84 source: the Telegram node returns Telegram's raw `{ ok, result: { message_id } }`; the Gmail send node returns `{ id, threadId }`; the Sheets update node only writes the columns it receives; failed items on a node's error output carry an `error` field.
