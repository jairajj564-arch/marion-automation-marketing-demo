#!/usr/bin/env bash
# Runs every lane's end-to-end tests under both expression engines and writes tests/lane-N/RESULTS.md.
# Needs n8n 1.123.84 installed in a scratch folder (see tests/README.md). Usage: tests/run-all.sh
set -u
cd "$(dirname "$0")"
status=0
for lane in 4 5 8; do
  for engine in vm legacy; do
    node --no-warnings lane-$lane/run.mjs $engine > lane-$lane/run-$engine.log 2>&1 || status=1
    grep -E "Engine" lane-$lane/run-$engine.log
  done
done
node --no-warnings make-results.mjs
node --no-warnings import-check.mjs ../lanes/lane-4-sequence-sender.json ../lanes/lane-5-launch-engine.json ../lanes/lane-8-report.json | tee import-check.log || status=1
exit $status
