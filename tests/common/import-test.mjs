// Import test (SPEC 8 step 12): create the 6 credentials with the exact SPEC names and dummy values, import the REAL lane files
// with `n8n import:workflow`, export them again and check every credential reference was linked (got an id) by name.
//   KAYA_SCRATCH=<scratch> node tests/common/import-test.mjs lanes/lane-2-publisher.json lanes/lane-3-lead-engine.json
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { N8n, Results } from './harness.mjs';

const files = process.argv.slice(2);
const results = new Results('Import test');
const n8n = new N8n({ engine: 'vm', label: 'import' });
const creds = [
  ['Kaya Demo · Google Sheets', 'googleSheetsOAuth2Api', { clientId: 'dummy', clientSecret: 'dummy', sheetsAccessType: 'full', oauthTokenData: { access_token: 'dummy' } }],
  ['Kaya Demo · Gmail Sender', 'gmailOAuth2', { clientId: 'dummy', clientSecret: 'dummy', oauthTokenData: { access_token: 'dummy' } }],
  ['Kaya Demo · Gmail Demo Customers', 'gmailOAuth2', { clientId: 'dummy', clientSecret: 'dummy', oauthTokenData: { access_token: 'dummy' } }],
  ['Kaya Demo · Gemini', 'googlePalmApi', { host: 'https://generativelanguage.googleapis.com', apiKey: 'dummy' }],
  ['Kaya Demo · Groq', 'groqApi', { apiKey: 'dummy' }],
  ['Kaya Demo · Telegram Bot', 'telegramApi', { baseUrl: 'https://api.telegram.org', accessToken: 'dummy' }],
].map(([name, type, data], i) => ({ id: `dummycred${i + 1}`, name, type, data }));
const credFile = join(n8n.folder, 'creds.json');
writeFileSync(credFile, JSON.stringify(creds));
n8n.cli('import:credentials', `--input=${credFile}`);
results.check(true, 'six dummy credentials created with the exact SPEC names');

for (const file of files) {
  const wf = JSON.parse(readFileSync(file, 'utf8'));
  results.begin(`${file}`);
  const id = n8n.importWorkflow(wf, 'import.json');
  results.check(Boolean(id), `n8n import:workflow succeeded (workflow id ${id})`);
  const out = join(n8n.folder, 'export.json');
  n8n.cli('export:workflow', `--id=${id}`, `--output=${out}`);
  const exported = JSON.parse(readFileSync(out, 'utf8'));
  const exp = Array.isArray(exported) ? exported[0] : exported;
  const refs = exp.nodes.flatMap((n) => Object.entries(n.credentials ?? {}).map(([type, c]) => ({ node: n.name, type, ...c })));
  const expected = wf.nodes.reduce((sum, n) => sum + Object.keys(n.credentials ?? {}).length, 0);
  results.check(refs.length === expected && refs.length > 0, `${refs.length} credential references exported (${expected} in the file)`);
  const unlinked = refs.filter((r) => !r.id);
  results.check(unlinked.length === 0, `every credential reference got an id (linked by name)${unlinked.length ? `; unlinked: ${unlinked.map((r) => r.node).join(', ')}` : ''}`);
  const wrong = refs.filter((r) => !creds.some((c) => c.id === r.id && c.name === r.name && c.type === r.type));
  results.check(wrong.length === 0, 'each id belongs to the credential with the same name and type');
  results.check(exp.nodes.length === wf.nodes.length, `all ${wf.nodes.length} nodes survived the round trip`);
  const conns = (w) => JSON.stringify(Object.fromEntries(Object.entries(w.connections).sort()));
  results.check(conns(exp) === conns(wf), 'connections identical after export');
}
console.log(`\n${results.summary()}`);
process.exit(results.failed.length ? 1 : 0);
