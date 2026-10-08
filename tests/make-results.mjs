// Combines the two engine runs of each lane into tests/lane-N/RESULTS.md. Called by run-all.sh.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TITLES = { 4: 'Lane 4 · Sequence sender', 5: 'Lane 5 · Launch engine', 8: 'Lane 8 · Report' };
const date = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
for (const lane of [4, 5, 8]) {
  const parts = ['vm', 'legacy'].map((engine) => {
    const file = join(here, `lane-${lane}`, `results-${engine}.md`);
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : `### Engine: \`${engine}\` — not run`;
  });
  const text = [
    `# ${TITLES[lane]}: test results`,
    '',
    `Run on ${date} with **n8n 1.123.84** (\`n8n start\`, \`GENERIC_TIMEZONE=Asia/Kolkata\`), once with the default expression engine (\`vm\`) and once with \`N8N_EXPRESSION_ENGINE=legacy\`.`,
    '',
    'How it was run: the committed lane file is copied, and only in the copy the trigger becomes a Webhook, the Google Sheets / Gmail / Telegram nodes become HTTP nodes talking to a local mock (`tests/lib/mock.mjs`: an in-memory sheet that keeps the real "only the columns you send are written" behaviour, a Gmail that hands out thread ids, a Telegram, and Gemini/Groq endpoints), so every Code, IF, Loop and Wait node of the lane runs unchanged inside the real n8n server. Time is moved forward by shifting every stored timestamp back (`mock.shiftTime`). Re-run with `tests/run-all.sh`.',
    '',
    ...parts.flatMap((p) => [p, '']),
  ].join('\n');
  writeFileSync(join(here, `lane-${lane}`, 'RESULTS.md'), text);
}
console.log('wrote RESULTS.md for lanes 4, 5 and 8');
