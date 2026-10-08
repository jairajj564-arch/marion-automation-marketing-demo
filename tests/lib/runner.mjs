// Tiny test runner: scenarios with named checks; prints as it goes and returns a summary for RESULTS.md.
export class Suite {
  constructor(title) { this.title = title; this.scenarios = []; this.current = null; }
  async scenario(name, fn) {
    const s = { name, checks: [], error: null };
    this.scenarios.push(s); this.current = s;
    process.stdout.write(`\n● ${name}\n`);
    try { await fn(); } catch (e) { s.error = e.stack || String(e); process.stdout.write(`  ✖ EXCEPTION ${e.message}\n`); }
  }
  check(label, ok, detail = '') {
    this.current.checks.push({ label, ok: Boolean(ok), detail });
    process.stdout.write(`  ${ok ? '✔' : '✖'} ${label}${ok || !detail ? '' : `  (${detail})`}\n`);
    return ok;
  }
  eq(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    return this.check(label, ok, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
  get failed() { return this.scenarios.reduce((n, s) => n + s.checks.filter((c) => !c.ok).length + (s.error ? 1 : 0), 0); }
  get total() { return this.scenarios.reduce((n, s) => n + s.checks.length, 0); }
  markdown(engine) {
    const lines = [`### Engine: \`${engine}\` — ${this.total - this.failed}/${this.total} checks passed`, ''];
    for (const s of this.scenarios) {
      const bad = s.checks.filter((c) => !c.ok).length + (s.error ? 1 : 0);
      lines.push(`- ${bad ? '✖' : '✔'} **${s.name}** (${s.checks.length - bad}/${s.checks.length})`);
      for (const c of s.checks.filter((c) => !c.ok)) lines.push(`    - ✖ ${c.label}: ${c.detail}`);
      if (s.error) lines.push(`    - ✖ exception: ${s.error.split('\n')[0]}`);
    }
    return lines.join('\n');
  }
}
