# Import check (n8n 1.123.84)

Run by `tests/e2e/import-check.mjs` (session 5). The six credentials were created first with dummy values and the exact SPEC names
(`Kaya Demo · Google Sheets`, `Kaya Demo · Gmail Sender`, `Kaya Demo · Gmail Demo Customers`, `Kaya Demo · Gemini`, `Kaya Demo · Groq`, `Kaya Demo · Telegram Bot`).
Every file was then imported with `n8n import:workflow` and exported again with `n8n export:workflow`.

* **Linked by name** = the exported credential reference carries the id of the dummy credential with the same name and type (the files themselves have `"id": ""`).
* **Round trip** = after export, every node (name, type, version, position, parameters, settings, webhook id) and every connection is identical to the file in the repo.

| | File | Nodes | Credential references | Linked by name | Round trip identical |
|---|---|---|---|---|---|
| ✔ | `lanes/marion-marketing-engine.json` | 256 | 83 | 83 | yes |
| ✔ | `lanes/lane-1-content-engine.json` | 25 | 7 | 7 | yes |
| ✔ | `lanes/lane-2-publisher.json` | 40 | 15 | 15 | yes |
| ✔ | `lanes/lane-3-lead-engine.json` | 24 | 8 | 8 | yes |
| ✔ | `lanes/lane-4-sequence-sender.json` | 25 | 8 | 8 | yes |
| ✔ | `lanes/lane-5-launch-engine.json` | 27 | 9 | 9 | yes |
| ✔ | `lanes/lane-6-outreach.json` | 39 | 10 | 10 | yes |
| ✔ | `lanes/lane-7-inbox.json` | 49 | 16 | 16 | yes |
| ✔ | `lanes/lane-8-report.json` | 26 | 10 | 10 | yes |

The import does not depend on the expression engine; both engines were exercised by running the canvas test copy end to end (`tests/e2e/RESULTS.md`).

## The owner's path: editor "Import from File" + Save

Run by `tests/e2e/ui-import-check.mjs` in a real browser (Chromium via Playwright) against n8n with the same six dummy credentials:

✔ editor **Import from File** + Save: 256 nodes, 83 credential references, 83 linked by name

Why this needs `"id": null`: on Import from File the editor (useCanvasOperations `removeUnknownCredentials`) deletes every credential reference whose id is not a known credential and spares only `id: null`; then `matchCredentials` links the rest by name. With `"id": ""` (the old SPEC rule) this check found 0 of 83 references linked.
