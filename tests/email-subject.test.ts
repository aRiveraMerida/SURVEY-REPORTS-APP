/**
 * Tests for the email subject template renderer. The helper itself
 * lives inside app/api/send-report/route.ts which can't be imported
 * outside a Next.js runtime, so we re-declare the exact same
 * implementation here. Keep it in sync with the route.
 */
import { describe, it, expect } from 'vitest';

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

const vars = { title: 'Informe ventas', period: 'FEBRERO 2026', clientName: 'Edauto Paterna' };

describe('renderEmailSubject', () => {
  it('falls back to default when template is null/empty/whitespace', () => {
    expect(renderEmailSubject(null, vars)).toBe('Informe ventas — FEBRERO 2026');
    expect(renderEmailSubject('', vars)).toBe('Informe ventas — FEBRERO 2026');
    expect(renderEmailSubject('   ', vars)).toBe('Informe ventas — FEBRERO 2026');
  });

  it('substitutes placeholders', () => {
    expect(renderEmailSubject('Informe {title}', vars)).toBe('Informe Informe ventas');
    expect(renderEmailSubject('{title} - {period}', vars)).toBe('Informe ventas - FEBRERO 2026');
    expect(
      renderEmailSubject('Informe {title} para {clientName} - {period}', vars),
    ).toBe('Informe Informe ventas para Edauto Paterna - FEBRERO 2026');
  });

  it('leaves literal text without placeholders alone', () => {
    expect(renderEmailSubject('Sin placeholders', vars)).toBe('Sin placeholders');
  });

  it('strips newlines in templates', () => {
    expect(renderEmailSubject('{title}\n{period}', vars)).toBe('Informe ventas FEBRERO 2026');
  });

  it('neutralises CRLF in substituted values (email-header-injection defence)', () => {
    const out = renderEmailSubject('{title}', {
      title: 'mal\r\nBcc: evil@x.com',
      period: 'x',
      clientName: 'x',
    });
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toContain('Bcc: evil@x.com');
  });

  it('truncates to 200 characters', () => {
    const longTemplate = 'X'.repeat(300);
    expect(renderEmailSubject(longTemplate, vars)).toHaveLength(200);
  });
});
