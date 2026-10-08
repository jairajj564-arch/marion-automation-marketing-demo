// Turns results-vm.json / results-legacy.json of a lane into the scenario table used in RESULTS.md.
//   node tests/common/make-results.mjs 2   (prints markdown)
import { readFileSync, existsSync } from 'node:fs';
const lane = process.argv[2];
const load = (engine) => JSON.parse(readFileSync(new URL(`../lane-${lane}/results-${engine}.json`, import.meta.url), 'utf8'));
const vm = load('vm'), legacy = load('legacy');
const scenarios = [...new Set(vm.map((r) => r.scenario))];
const count = (items, s) => { const own = items.filter((r) => r.scenario === s); return `${own.filter((r) => r.ok).length}/${own.length}`; };
console.log('| Scenario | `vm` engine | `legacy` engine |\n|---|---|---|');
for (const s of scenarios) console.log(`| ${s} | ${count(vm, s)} | ${count(legacy, s)} |`);
console.log(`| **Total** | **${vm.filter((r) => r.ok).length}/${vm.length}** | **${legacy.filter((r) => r.ok).length}/${legacy.length}** |`);
