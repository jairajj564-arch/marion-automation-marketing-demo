// Minimal CSV reader (quotes, doubled quotes, line breaks inside quotes) for the sheets-template files.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.some((v) => v !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const here = dirname(fileURLToPath(import.meta.url));
export const templateDir = join(here, '..', '..', 'sheets-template');
export const TABS = ['SETTINGS', 'BRIEF', 'CONTENT', 'LEADS', 'PROSPECTS', 'SEQUENCES', 'EVENTS_LOG', 'DASHBOARD'];
export const loadTemplate = (tab) => parseCsv(readFileSync(join(templateDir, `${tab}.csv`), 'utf8'));
export const headersOf = (tab) => readFileSync(join(templateDir, `${tab}.csv`), 'utf8').split('\n')[0].trim().split(',');
