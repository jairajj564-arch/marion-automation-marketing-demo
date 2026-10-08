#!/usr/bin/env node
// The owner's real import path (SETUP.md part H), session 5: n8n editor → ⋯ → Import from File → Save.
//   N8N_BIN=<n8n 1.123.84 binary> PLAYWRIGHT_DIR=<folder containing node_modules/playwright> [CHROMIUM=<chrome binary>] \
//     node tests/e2e/ui-import-check.mjs
// Creates the 6 dummy credentials with the SPEC names, starts n8n, sets up an owner, imports the canvas through the
// editor's own "Import from File" menu, saves, exports, and checks that every credential reference was linked by name.
// Also saves docs/canvas.png (the whole canvas, zoomed to fit) and appends the result to tests/IMPORT-CHECK.md.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = process.env.N8N_BIN || 'n8n';
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_DIR || process.cwd(), 'x.js'))('playwright');
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

const root = mkdtempSync(path.join(tmpdir(), 'n8n-ui-import-'));
const port = await freePort();
const env = { ...process.env, N8N_USER_FOLDER: path.join(root, 'home'), N8N_PORT: String(port), N8N_LISTEN_ADDRESS: '127.0.0.1', N8N_SECURE_COOKIE: 'false', N8N_DIAGNOSTICS_ENABLED: 'false', N8N_RUNNERS_BROKER_PORT: String(await freePort()), N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'false', N8N_PERSONALIZATION_ENABLED: 'false' };
mkdirSync(env.N8N_USER_FOLDER, { recursive: true });
const creds = [
  ['Kaya Demo · Google Sheets', 'googleSheetsOAuth2Api', { clientId: 'x', clientSecret: 'x', oauthTokenData: { access_token: 'x' } }],
  ['Kaya Demo · Gmail Sender', 'gmailOAuth2', { clientId: 'x', clientSecret: 'x', oauthTokenData: { access_token: 'x' } }],
  ['Kaya Demo · Gmail Demo Customers', 'gmailOAuth2', { clientId: 'x', clientSecret: 'x', oauthTokenData: { access_token: 'x' } }],
  ['Kaya Demo · Gemini', 'googlePalmApi', { host: 'https://generativelanguage.googleapis.com', apiKey: 'dummy' }],
  ['Kaya Demo · Groq', 'groqApi', { apiKey: 'dummy' }],
  ['Kaya Demo · Telegram Bot', 'telegramApi', { accessToken: 'dummy', baseUrl: 'https://api.telegram.org' }],
].map(([name, type, data], i) => ({ id: `cred${i + 1}`, name, type, data }));
writeFileSync(path.join(root, 'creds.json'), JSON.stringify(creds));
spawnSync(BIN, ['import:credentials', `--input=${path.join(root, 'creds.json')}`], { env });

const child = spawn(BIN, ['start'], { env, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
let result = 'not run';
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 3000));
  const owner = { email: 'demo@example.com', firstName: 'Demo', lastName: 'Owner', password: 'DemoPassw0rd!' };
  await fetch(`${base}/rest/owner/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(owner) });
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 2400, height: 1800 } });
  await page.goto(`${base}/signin`);
  await page.fill('input[type="email"]', owner.email);
  await page.fill('input[type="password"]', owner.password);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  await page.goto(`${base}/workflow/new`);
  await page.waitForTimeout(5000);
  await page.locator('[data-test-id="workflow-menu"]').click();
  await page.waitForTimeout(800);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Import from File').click()]);
  await chooser.setFiles(path.join(repo, 'lanes', 'marion-marketing-engine.json'));
  await page.waitForTimeout(6000);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(4000);
  await page.keyboard.press('1');           // zoom to fit
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(repo, 'docs', 'canvas.png') });
  await browser.close();
} finally {
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 4000));
}
const out = path.join(root, 'export.json');
spawnSync(BIN, ['export:workflow', '--all', `--output=${out}`], { env });
const wf = JSON.parse(readFileSync(out, 'utf8')).find((w) => w.name.startsWith('Marion Enroute'));
const refs = (wf?.nodes || []).flatMap((n) => Object.values(n.credentials || {}));
const linked = refs.filter((c) => creds.some((cred) => cred.id === c.id && cred.name === c.name)).length;
const ok = wf && wf.nodes.length === 256 && refs.length === 83 && linked === 83;
result = `${ok ? '✔' : '✖'} editor **Import from File** + Save: ${wf?.nodes.length ?? 0} nodes, ${refs.length} credential references, ${linked} linked by name`;
console.log(result);
appendFileSync(path.join(repo, 'tests', 'IMPORT-CHECK.md'), `\n## The owner's path: editor "Import from File" + Save\n\nRun by \`tests/e2e/ui-import-check.mjs\` in a real browser (Chromium via Playwright) against n8n with the same six dummy credentials:\n\n${result}\n\nWhy this needs \`"id": null\`: on Import from File the editor (useCanvasOperations \`removeUnknownCredentials\`) deletes every credential reference whose id is not a known credential and spares only \`id: null\`; then \`matchCredentials\` links the rest by name. With \`"id": ""\` (the old SPEC rule) this check found 0 of 83 references linked.\n`);
process.exit(ok ? 0 : 1);
