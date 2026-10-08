// Syntax-checks every Code node of a lane file (parse only, nothing is run).
import { readFileSync } from 'node:fs';
const file = process.argv[2];
const wf = JSON.parse(readFileSync(file, 'utf8'));
let bad = 0;
for (const n of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
  try { new Function('$', '$input', '$now', '$execution', 'DateTime', `return (async () => {\n${n.parameters.jsCode}\n})();`); }
  catch (e) { bad++; console.log(`✖ ${n.name}: ${e.message}`); }
}
console.log(bad ? `${bad} code node(s) with syntax errors` : `✔ all ${wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code').length} code nodes parse`);
process.exit(bad ? 1 : 0);
