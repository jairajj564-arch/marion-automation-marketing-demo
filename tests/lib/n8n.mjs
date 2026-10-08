// Starts a real n8n 1.123.84 server (from the scratch install) with test workflows imported and active.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

export const N8N_HOME = process.env.N8N_SCRATCH || '/tmp/claude-0/n8n-scratch';
const BIN = join(N8N_HOME, 'node_modules', '.bin', 'n8n');

export const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

export function n8nEnv(extra = {}) {
  return {
    ...process.env,
    N8N_LISTEN_ADDRESS: '127.0.0.1', N8N_RUNNERS_BROKER_LISTEN_ADDRESS: '127.0.0.1', N8N_SECURE_COOKIE: 'false',
    GENERIC_TIMEZONE: 'Asia/Kolkata', TZ: 'Asia/Kolkata', N8N_DIAGNOSTICS_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false',
    N8N_VERSION_NOTIFICATIONS_ENABLED: 'false', N8N_HIRING_BANNER_ENABLED: 'false', EXECUTIONS_DATA_SAVE_ON_SUCCESS: 'all',
    N8N_RUNNERS_ENABLED: 'true', N8N_LOG_LEVEL: process.env.N8N_LOG_LEVEL || 'info', NODE_FUNCTION_ALLOW_BUILTIN: '', ...extra,
  };
}

export async function startN8n({ workflows, engine = 'vm', log }) {
  const folder = mkdtempSync(join(tmpdir(), 'n8n-test-'));
  const port = await freePort();
  const env = n8nEnv({ N8N_USER_FOLDER: folder, N8N_PORT: String(port), N8N_EXPRESSION_ENGINE: engine, N8N_RUNNERS_BROKER_PORT: String(await freePort()) });
  const ids = [];
  for (const [i, wf] of workflows.entries()) {
    const file = join(folder, `wf-${i}.json`);
    wf.id = `testwf${i}`; wf.versionId = `00000000-0000-4000-8000-00000000000${i}`;
    writeFileSync(file, JSON.stringify(wf));
    execFileSync(BIN, ['import:workflow', `--input=${file}`], { env, stdio: 'pipe' });
    execFileSync(BIN, ['update:workflow', `--id=${wf.id}`, '--active=true'], { env, stdio: 'pipe' });
    ids.push(wf.id);
  }
  const child = spawn(BIN, ['start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/healthz`); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
    if (child.exitCode !== null) throw new Error(`n8n exited early:\n${output.slice(-2000)}`);
  }
  // Webhooks register a little after the server answers /healthz: wait until the readiness probe is OK
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/healthz/readiness`); if (r.ok) break; } catch { /* keep waiting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Wait until every test webhook is registered: a GET on a POST-only webhook answers with a "did you mean POST" hint.
  for (const wf of workflows) {
    const hook = wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
    if (!hook) continue;
    for (let i = 0; i < 90; i++) {
      const r = await fetch(`http://127.0.0.1:${port}/webhook/${hook.parameters.path}`).catch(() => null);
      const text = r ? await r.text() : '';
      if (text.includes('POST')&&text.includes('Did you mean')) break;
      await new Promise((res) => setTimeout(res, 1000));
    }
  }
  log?.(`n8n up on ${port} (engine ${engine})`);
  return {
    port, folder, output: () => output,
    // Start a run through the webhook and wait for the lane to finish; returns { status, body, ms }
    async run(path) {
      const t0 = Date.now();
      const res = await fetch(`http://127.0.0.1:${port}/webhook/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const text = await res.text();
      let body; try { body = JSON.parse(text); } catch { body = text; }
      // "No item to return" only means the lane ended quietly (its last node produced nothing): that is a success.
      if (res.status === 500 && body?.message === 'No item to return was found') return { status: 200, quiet: true, body: {}, ms: Date.now() - t0 };
      return { status: res.status, body, ms: Date.now() - t0 };
    },
    // Text of the newest execution as stored by n8n (node data and error messages), for checking error messages.
    async lastExecutionText() {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(join(folder, '.n8n', 'database.sqlite'), { readOnly: true, timeout: 5000 });
      try {
        const row = db.prepare('SELECT data FROM execution_data ORDER BY executionId DESC LIMIT 1').get();
        return String(row?.data ?? '');
      } finally { db.close(); }
    },
    async stop() { child.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 1500)); child.kill('SIGKILL'); },
  };
}
