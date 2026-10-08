#!/usr/bin/env node
// Import check for the ONE canvas and every lane file (SPEC 8.12), session 5.
//   N8N_BIN=<path to n8n 1.123.84> node tests/e2e/import-check.mjs [--keep <folder>]
// 1. Creates the 6 credentials with dummy values and the EXACT SPEC names in a scratch n8n.
// 2. Imports lanes/marion-marketing-engine.json and the 8 lane files with the real `n8n import:workflow`.
// 3. Exports everything again and checks: every credential reference got an id (linked by name), and the canvas
//    came back unchanged (same node names, types, positions, parameters, webhook ids and connections).
// Writes tests/IMPORT-CHECK.md. With --keep <folder> the scratch n8n home is kept (used for the canvas screenshot).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const N8N_BIN = process.env.N8N_BIN || 'n8n';
const keepAt = process.argv.includes('--keep') ? process.argv[process.argv.indexOf('--keep') + 1] : null;
const root = keepAt || mkdtempSync(path.join(tmpdir(), 'n8n-import-'));
mkdirSync(path.join(root, 'home'), { recursive: true });
const env = { ...process.env, N8N_USER_FOLDER: path.join(root, 'home'), N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'false', N8N_DIAGNOSTICS_ENABLED: 'false' };
const run = (...args) => spawnSync(N8N_BIN, args, { env, encoding: 'utf8' });
const version = run('--version').stdout.trim();

const creds = [
  ['Kaya Demo · Google Sheets', 'googleSheetsOAuth2Api', { clientId: 'x', clientSecret: 'x', sheetsAccessType: 'oAuth2', oauthTokenData: { access_token: 'x' } }],
  ['Kaya Demo · Gmail Sender', 'gmailOAuth2', { clientId: 'x', clientSecret: 'x', oauthTokenData: { access_token: 'x' } }],
  ['Kaya Demo · Gmail Demo Customers', 'gmailOAuth2', { clientId: 'x', clientSecret: 'x', oauthTokenData: { access_token: 'x' } }],
  ['Kaya Demo · Gemini', 'googlePalmApi', { host: 'https://generativelanguage.googleapis.com', apiKey: 'dummy' }],
  ['Kaya Demo · Groq', 'groqApi', { apiKey: 'dummy' }],
  ['Kaya Demo · Telegram Bot', 'telegramApi', { accessToken: 'dummy', baseUrl: 'https://api.telegram.org' }],
].map(([name, type, data], i) => ({ id: `cred${i + 1}`, name, type, data }));
writeFileSync(path.join(root, 'creds.json'), JSON.stringify(creds));
let r = run('import:credentials', `--input=${path.join(root, 'creds.json')}`);
if (!/Successfully imported 6/.test(r.stdout + r.stderr)) { console.error('credential import failed', r.stdout, r.stderr); process.exit(1); }

const files = ['lanes/marion-marketing-engine.json', ...readdirSync(path.join(repo, 'lanes')).filter((f) => /^lane-\d/.test(f)).sort().map((f) => `lanes/${f}`)];
const lines = [];
let bad = 0;
const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])])) : value;
for (const file of files) {
  const original = JSON.parse(readFileSync(path.join(repo, file), 'utf8'));
  r = run('import:workflow', `--input=${path.join(repo, file)}`);
  const imported = /Successfully imported 1 workflow/.test(r.stdout + r.stderr);
  const out = path.join(root, `${path.basename(file)}.exported.json`);
  run('export:workflow', '--all', `--output=${out}`);
  const wf = JSON.parse(readFileSync(out, 'utf8')).find((w) => w.name === original.name);
  const refs = (wf?.nodes || []).flatMap((n) => Object.entries(n.credentials || {}).map(([type, c]) => ({ node: n.name, type, id: c.id, name: c.name })));
  const unlinked = refs.filter((c) => !c.id || !creds.some((cred) => cred.id === c.id && cred.name === c.name && cred.type === c.type));
  // Round trip: everything except the credential ids n8n filled in must be identical.
  const strip = (nodes) => sortKeys(nodes.map(({ credentials, ...rest }) => ({ ...rest, credentials: Object.fromEntries(Object.entries(credentials || {}).map(([t, c]) => [t, c.name])) })));
  const sameNodes = wf && JSON.stringify(strip(wf.nodes)) === JSON.stringify(strip(original.nodes));
  const sameConnections = wf && JSON.stringify(sortKeys(wf.connections)) === JSON.stringify(sortKeys(original.connections));
  const ok = imported && wf && !unlinked.length && sameNodes && sameConnections;
  if (!ok) bad++;
  const line = `${ok ? '✔' : '✖'} \`${file}\`: import ${imported ? 'ok' : 'FAILED'} · ${wf?.nodes.length ?? 0} nodes · ${refs.length} credential references, ${refs.length - unlinked.length} linked by name · nodes ${sameNodes ? 'unchanged' : 'CHANGED'} · connections ${sameConnections ? 'unchanged' : 'CHANGED'}`;
  console.log(line);
  for (const u of unlinked) console.log(`    unlinked: ${u.node} (${u.type}: ${u.name})`);
  lines.push(`| ${ok ? '✔' : '✖'} | \`${file}\` | ${wf?.nodes.length ?? 0} | ${refs.length} | ${refs.length - unlinked.length} | ${sameNodes && sameConnections ? 'yes' : 'NO'} |`);
}

writeFileSync(path.join(repo, 'tests', 'IMPORT-CHECK.md'), `# Import check (n8n ${version})

Run by \`tests/e2e/import-check.mjs\` (session 5). The six credentials were created first with dummy values and the exact SPEC names
(\`Kaya Demo · Google Sheets\`, \`Kaya Demo · Gmail Sender\`, \`Kaya Demo · Gmail Demo Customers\`, \`Kaya Demo · Gemini\`, \`Kaya Demo · Groq\`, \`Kaya Demo · Telegram Bot\`).
Every file was then imported with \`n8n import:workflow\` and exported again with \`n8n export:workflow\`.

* **Linked by name** = the exported credential reference carries the id of the dummy credential with the same name and type (the files themselves have \`"id": ""\`).
* **Round trip** = after export, every node (name, type, version, position, parameters, settings, webhook id) and every connection is identical to the file in the repo.

| | File | Nodes | Credential references | Linked by name | Round trip identical |
|---|---|---|---|---|---|
${lines.join('\n')}

The import does not depend on the expression engine; both engines were exercised by running the canvas test copy end to end (\`tests/e2e/RESULTS.md\`).
`);
process.exit(bad ? 1 : 0);
