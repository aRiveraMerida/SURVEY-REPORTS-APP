/**
 * Smoke test for the email subject template renderer.
 * The helper lives inside app/api/send-report/route.ts — we re-declare
 * a local copy for isolated testing since the route module can't be
 * imported outside Next.js runtime.
 */

function renderEmailSubject(
  template: string | null | undefined,
  vars: { title: string; period: string; clientName: string }
): string {
  const safe = (s: string) => s.replace(/[\r\n]/g, ' ').trim();
  const fallback = `${safe(vars.title)} — ${safe(vars.period)}`;
  if (!template || !template.trim()) return fallback;
  const rendered = template
    .replace(/\{title\}/g, safe(vars.title))
    .replace(/\{period\}/g, safe(vars.period))
    .replace(/\{clientName\}/g, safe(vars.clientName));
  return rendered.replace(/[\r\n]/g, ' ').trim().substring(0, 200) || fallback;
}

let pass = 0;
let fail = 0;

function eq<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`);
  }
}

const vars = { title: 'Informe ventas', period: 'FEBRERO 2026', clientName: 'Edauto Paterna' };

console.log('\n[email subject template]');

eq(renderEmailSubject(null, vars), 'Informe ventas — FEBRERO 2026', 'null template → fallback');
eq(renderEmailSubject('', vars), 'Informe ventas — FEBRERO 2026', 'empty template → fallback');
eq(renderEmailSubject('   ', vars), 'Informe ventas — FEBRERO 2026', 'whitespace template → fallback');
eq(renderEmailSubject('Informe {title}', vars), 'Informe Informe ventas', 'only {title}');
eq(renderEmailSubject('{title} - {period}', vars), 'Informe ventas - FEBRERO 2026', 'title + period');
eq(
  renderEmailSubject('Informe {title} para {clientName} - {period}', vars),
  'Informe Informe ventas para Edauto Paterna - FEBRERO 2026',
  'all three placeholders'
);
eq(renderEmailSubject('Sin placeholders', vars), 'Sin placeholders', 'literal text without placeholders');
eq(
  renderEmailSubject('{title}\n{period}', vars),
  'Informe ventas FEBRERO 2026',
  'newlines in template are stripped'
);

// Injection attempt: CRLF must be neutralized to defend against
// email header injection. We accept single-or-double space — what
// matters is that no \r or \n remain in the output.
const injected = renderEmailSubject('{title}', { title: 'mal\r\nBcc: evil@x.com', period: 'x', clientName: 'x' });
if (!/[\r\n]/.test(injected) && injected.includes('Bcc: evil@x.com')) {
  pass++;
  console.log('  PASS  CRLF in var values is stripped (email header injection defense)');
} else {
  fail++;
  console.log(`  FAIL  CRLF stripping — got: ${JSON.stringify(injected)}`);
}

// Truncation test
const long = 'X'.repeat(300);
const truncated = renderEmailSubject(long, vars);
eq(truncated.length, 200, `200-char truncation (got ${truncated.length})`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
