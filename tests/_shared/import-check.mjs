#!/usr/bin/env node
// Import check (SPEC 8.12): creates the 6 credentials with dummy values and the exact SPEC names in a scratch n8n,
// imports the given lane files with the real `n8n import:workflow`, exports them again and checks that every
// credential reference got an id (n8n matched it by name). Usage: node tests/_shared/import-check.mjs lanes/a.json lanes/b.json
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { N8N_BIN } from './harness.mjs';

const files = process.argv.slice(2);
const root = mkdtempSync(path.join(tmpdir(), 'n8n-import-'));
const env = { ...process.env, N8N_USER_FOLDER: path.join(root, 'home'), N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'false', N8N_DIAGNOSTICS_ENABLED: 'false' };
const run = (...args) => spawnSync(N8N_BIN, args, { env, encoding: 'utf8' });
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
let bad = 0;
for (const file of files) {
  r = run('import:workflow', `--input=${file}`);
  const ok = /Successfully imported 1 workflow/.test(r.stdout + r.stderr);
  const out = path.join(root, `${path.basename(file)}.exported.json`);
  const exp = run('export:workflow', '--all', `--output=${out}`);
  const exported = JSON.parse(readFileSync(out, 'utf8'));
  const laneName = JSON.parse(readFileSync(file, 'utf8')).name;
  const wf = exported.find((w) => w.name === laneName);
  const refs = wf.nodes.flatMap((n) => Object.entries(n.credentials || {}).map(([type, c]) => ({ node: n.name, type, id: c.id, name: c.name })));
  const unlinked = refs.filter((c) => !c.id);
  console.log(`${ok ? '✔' : '✖'} ${file}: import ${ok ? 'ok' : 'FAILED'}; ${refs.length} credential references, ${refs.length - unlinked.length} linked by name, ${unlinked.length} unlinked${exp.status ? ' (export failed)' : ''}`);
  if (!ok || unlinked.length) { bad++; for (const u of unlinked) console.log(`    unlinked: ${u.node} (${u.type}: ${u.name})`); }
}
process.exit(bad ? 1 : 0);
