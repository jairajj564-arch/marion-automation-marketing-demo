// Import the REAL lane files into a scratch n8n (n8n 1.123.84) after creating dummy credentials with the exact SPEC names,
// export them again and confirm every credential reference got linked by name (SPEC section 1).
// Usage: node tests/import-check.mjs lanes/lane-4-sequence-sender.json lanes/lane-5-launch-engine.json lanes/lane-8-report.json
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { n8nEnv, N8N_HOME } from './lib/n8n.mjs';

const files = process.argv.slice(2);
const BIN = join(N8N_HOME, 'node_modules', '.bin', 'n8n');
const folder = mkdtempSync(join(tmpdir(), 'n8n-import-'));
const env = n8nEnv({ N8N_USER_FOLDER: folder });
const run = (args) => execFileSync(BIN, args, { env, encoding: 'utf8', stdio: 'pipe' });

const creds = [
  ['Kaya Demo · Google Sheets', 'googleSheetsOAuth2Api', { clientId: 'dummy', clientSecret: 'dummy', sendAdditionalBodyProperties: false, additionalBodyProperties: '{}' }],
  ['Kaya Demo · Gmail Sender', 'gmailOAuth2', { clientId: 'dummy', clientSecret: 'dummy', sendAdditionalBodyProperties: false, additionalBodyProperties: '{}' }],
  ['Kaya Demo · Gmail Demo Customers', 'gmailOAuth2', { clientId: 'dummy', clientSecret: 'dummy', sendAdditionalBodyProperties: false, additionalBodyProperties: '{}' }],
  ['Kaya Demo · Gemini', 'googlePalmApi', { host: 'https://generativelanguage.googleapis.com', apiKey: 'dummy' }],
  ['Kaya Demo · Groq', 'groqApi', { apiKey: 'dummy' }],
  ['Kaya Demo · Telegram Bot', 'telegramApi', { accessToken: 'dummy', baseUrl: 'https://api.telegram.org' }],
].map(([name, type, data], i) => ({ id: `cred${i + 1}`, name, type, data }));
writeFileSync(join(folder, 'creds.json'), JSON.stringify(creds));
run(['import:credentials', `--input=${join(folder, 'creds.json')}`]);

let failures = 0;
for (const [i, file] of files.entries()) {
  const wf = JSON.parse(readFileSync(file, 'utf8'));
  wf.id = `real${i}`;
  writeFileSync(join(folder, `wf${i}.json`), JSON.stringify(wf));
  run(['import:workflow', `--input=${join(folder, `wf${i}.json`)}`]);
  const out = run(['export:workflow', `--id=real${i}`]);
  const exported = JSON.parse(out.slice(out.indexOf('[')))[0];
  const refs = exported.nodes.filter((n) => n.credentials);
  const unlinked = [];
  let total = 0;
  for (const n of refs) for (const [type, c] of Object.entries(n.credentials)) { total++; if (!c.id) unlinked.push(`${n.name} → ${type} "${c.name}"`); }
  const expected = wf.nodes.filter((n) => n.credentials).reduce((s, n) => s + Object.keys(n.credentials).length, 0);
  const ok = !unlinked.length && total === expected && exported.nodes.length === wf.nodes.length;
  if (!ok) failures++;
  console.log(`${ok ? '✔' : '✖'} ${file}: imported ${exported.nodes.length}/${wf.nodes.length} nodes, ${total - unlinked.length}/${expected} credential references linked by name${unlinked.length ? `\n    unlinked: ${unlinked.join('; ')}` : ''}`);
  const byCred = {};
  for (const n of refs) for (const [type, c] of Object.entries(n.credentials)) byCred[`${c.name} (${type}) -> ${c.id}`] = (byCred[`${c.name} (${type}) -> ${c.id}`] || 0) + 1;
  console.log('   ' + Object.entries(byCred).map(([k, v]) => `${v}× ${k}`).join('\n   '));
}
process.exit(failures ? 1 : 0);
