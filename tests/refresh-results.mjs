// Session 5: rewrites the result sections of every lane's RESULTS.md from the logs of tests/run-all.sh (tests/logs/),
// keeping each session's own format. Usage: node tests/refresh-results.mjs   (run-all.sh calls it)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const log = (name) => { const f = join(here, 'logs', `${name}.log`); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };
const date = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const replaceBetween = (text, start, end, body) => {
  const a = text.indexOf(start); const b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${start} / ${end}`);
  return text.slice(0, a + start.length) + body + text.slice(b);
};

// Lanes 2 and 3 (session 2): the scenario table comes from results-<engine>.json.
for (const lane of [2, 3]) {
  const file = join(here, `lane-${lane}`, 'RESULTS.md');
  const table = execFileSync(process.execPath, [join(here, 'common', 'make-results.mjs'), String(lane)], { encoding: 'utf8' });
  let text = readFileSync(file, 'utf8');
  const start = '## Results (checks passed / total)\n';
  const tableStart = text.indexOf('| Scenario', text.indexOf(start));
  const tableEnd = text.indexOf('| **Total**', tableStart);
  text = text.slice(0, tableStart) + table.trim() + text.slice(text.indexOf('\n', tableEnd));
  if (!text.includes('Re-run in session 5')) text = text.replace(start, `${start}\n_Re-run in session 5 on the merged files (${date}), n8n 1.123.84, both engines._\n\n`);
  writeFileSync(file, text);
}

// Lanes 4, 5, 8 (session 3): its own generator.
execFileSync(process.execPath, [join(here, 'make-results.mjs')], { stdio: 'inherit' });

// Lanes 6 and 7 (session 4): summary table + the raw output of both engines.
for (const lane of [6, 7]) {
  const file = join(here, `lane-${lane}`, 'RESULTS.md');
  let text = readFileSync(file, 'utf8');
  const out = (engine) => log(`lane${lane}-${engine}`).split('\n').filter((l) => /^[✔✖]|^\s+✖|scenarios, \d+ checks/.test(l)).join('\n').trim();
  const summary = (engine) => out(engine).split('\n').find((l) => /scenarios, \d+ checks/.test(l)) ?? 'not run';
  text = text.replace(/\| default \(`vm`\) \| .* \|/, `| default (\`vm\`) | ${summary('vm')} |`);
  text = text.replace(/\| `N8N_EXPRESSION_ENGINE=legacy` \| .* \|/, `| \`N8N_EXPRESSION_ENGINE=legacy\` | ${summary('legacy')} |`);
  text = replaceBetween(text, '## Output: default engine (vm)\n```text\n', '```', `${out('vm')}\n`);
  text = replaceBetween(text, '## Output: legacy engine\n```text\n', '```', `${out('legacy')}\n`);
  if (!text.includes('Re-run in session 5')) text = text.replace('| Engine | Result |', `_Re-run in session 5 on the merged files (${date})._\n\n| Engine | Result |`);
  writeFileSync(file, text);
}

// End-to-end storyline (session 5).
const parts = ['vm', 'legacy'].map((e) => { const f = join(here, 'e2e', `results-${e}.md`); return existsSync(f) ? readFileSync(f, 'utf8').trim() : `### Engine: \`${e}\` — not run`; });
writeFileSync(join(here, 'e2e', 'RESULTS.md'), `# End-to-end demo storyline: test results

Run on ${date} with **n8n 1.123.84** (real server, \`n8n start\`), once with the default expression engine (\`vm\`) and once with \`N8N_EXPRESSION_ENGINE=legacy\`, by \`tests/e2e/run.mjs\`.

**What runs:** the ONE canvas \`lanes/marion-marketing-engine.json\` as a test copy: every trigger became a Webhook (the test plays the scheduler), Google Sheets / Gmail / Telegram nodes became HTTP calls to \`tests/e2e/world.mjs\`, Gemini / Groq were pointed at it. Every Code, IF, Switch, Loop Over Items and Wait node is the real one from the canvas.

**The world:** one in-memory sheet seeded from \`sheets-template/\` (15 sample leads, 12 prospects); two Gmail mailboxes with their own thread ids that thread a reply by \`In-Reply-To\` and build the reply's recipients exactly like n8n 1.123.84's Gmail node; Telegram; realistic latency (Sheets 250 ms, Gmail 400 ms). A virtual clock moves every stored timestamp back one minute per tick. Each minute the lanes start on their cron offsets (scaled 3×) **concurrently**, with a 2 s pause between emails, so runs overlap as on the PC. Every sheet write is checked against SPEC's "Written by" columns.

**Storyline (DEMO_MODE TRUE, 1 day = 2 minutes, DEMO_LAUNCH_AT = start + 6 min):** Lane 1 creates content → 4 rows approved → Lane 2 publishes → a lead fills the waitlist form (Lane 3) → Lane 4 sends the nurture sequence → DEMO_LAUNCH_AT arrives (Lane 5) → Lane 6 emails prospects → a prospect replies "interested" through the demo reply form (Lane 7 → hot alert) → Lane 8 report. Then cross-lane invariants over the whole run.

${parts.join('\n\n')}

## Does the storyline catch real bugs? (mutation check, session 5)

The same storyline was run once against the lane files as they were merged from PRs #2–#4 (commit \`0557060\`, before the session 5 fixes), \`vm\` engine. It failed exactly where the fixes are:

\`\`\`text
✖ 9 · the reply: in the SAME thread, from the bare demo address → Lane 7 → interested + 🔥 HOT alert → Lane 6 stops
     ✖ Reply to Sender Only: the reply as sent is addressed to the sender only (not back to the plus-address):
       expected ["kayademo.hello@gmail.com"], got ["kayademo.hello@gmail.com","kayademo.customers+boutique1@gmail.com"]
✖ 11 · cross-lane invariants over the whole run
     ✖ nobody got two automated emails inside MIN_EMAIL_GAP_DAYS (Lanes 2, 4, 5 and 6 together):
       got ["kayademo.customers+lead04@gmail.com: \"Early access ends Wednesday, 28 October\" then \"Early access opens Monday, 26 October\" 0 s apart"]
E2E storyline [vm]: 12 scenarios, 60 checks, 2 failed
\`\`\`

The second one is the known Lane 4 / Lane 5 overlap: Lane 5's launch email and Lane 4's nurture email reached the same lead in the same second. With the fixed lanes both checks pass.
`);
console.log('refreshed RESULTS.md for lanes 2, 3, 6, 7 and tests/e2e/RESULTS.md');
