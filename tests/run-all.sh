#!/usr/bin/env bash
# Runs every test in the repo (session 5): each lane's suite under both expression engines, the import check of the
# canvas and every lane file, and the end-to-end demo storyline on the canvas. Logs go to tests/logs/, then every
# RESULTS.md is refreshed. Needs n8n 1.123.84 installed in a scratch folder (see tests/README.md) and these variables:
#   KAYA_SCRATCH (lanes 2, 3), N8N_SCRATCH (lanes 4, 5, 8), N8N_BIN (lanes 6, 7, e2e, import checks),
#   optional PLAYWRIGHT_DIR (+ CHROMIUM) for the editor import check.
# Usage: tests/run-all.sh        (about 60 minutes)
set -u
cd "$(dirname "$0")"
mkdir -p logs
status=0
run() { local name=$1; shift; echo "▶ $name"; "$@" > "logs/$name.log" 2>&1 || { status=1; echo "  ✖ $name failed (tests/logs/$name.log)"; }; tail -n 1 "logs/$name.log"; }
for engine in ${ENGINES:-vm legacy}; do   # ENGINES=vm tests/run-all.sh runs one engine
  run lane2-$engine node --no-warnings lane-2/run.mjs $engine
  run lane3-$engine node --no-warnings lane-3/run.mjs $engine
  run lane4-$engine node --no-warnings lane-4/run.mjs $engine
  run lane5-$engine node --no-warnings lane-5/run.mjs $engine
  run lane6-$engine node --no-warnings lane-6/run-tests.mjs $engine
  run lane7-$engine node --no-warnings lane-7/run-tests.mjs $engine
  run lane8-$engine node --no-warnings lane-8/run.mjs $engine
  run e2e-$engine node --no-warnings e2e/run.mjs $engine
done
[ "${FINAL:-1}" = 1 ] || exit $status   # FINAL=0: suites only (to run the two engines in parallel)
run import-check node --no-warnings e2e/import-check.mjs
[ -n "${PLAYWRIGHT_DIR:-}" ] && run ui-import-check node --no-warnings e2e/ui-import-check.mjs   # optional: needs Playwright + Chromium
for f in ../lanes/*.json; do node ../tools/validate-workflow.mjs "$f" | tail -n 1; done
node --no-warnings refresh-results.mjs
exit $status
