/**
 * Tests for the email subject + body helper (lib/email/subject.ts).
 */
import { describe, it, expect } from 'vitest';
import { renderEmailSubject, renderEmailBody } from '@/lib/email/subject';
import type { EmailConfig } from '@/types/database';

const vars = {
  title: 'Informe ventas',
  period: 'FEBRERO 2026',
  clientName: 'Edauto Paterna',
};

describe('renderEmailSubject', () => {
  it('uses config.subject when present', () => {
    const cfg: EmailConfig = { subject: 'Informe {title} para {clientName}' };
    expect(renderEmailSubject(cfg, null, vars)).toBe('Informe Informe ventas para Edauto Paterna');
  });

  it('falls back to legacy template when config has no subject', () => {
    expect(renderEmailSubject({}, 'Legacy {title}', vars)).toBe('Legacy Informe ventas');
    expect(renderEmailSubject(null, '{title} - {period}', vars)).toBe('Informe ventas - FEBRERO 2026');
  });

  it('falls back to hard-coded default when both are empty', () => {
    expect(renderEmailSubject(null, null, vars)).toBe('Informe ventas — FEBRERO 2026');
    expect(renderEmailSubject(null, '', vars)).toBe('Informe ventas — FEBRERO 2026');
    expect(renderEmailSubject({}, null, vars)).toBe('Informe ventas — FEBRERO 2026');
  });

  it('neutralises CRLF in values (email header injection defence)', () => {
    const out = renderEmailSubject(
      { subject: '{title}' },
      null,
      { title: 'mal\r\nBcc: evil@x.com', period: '', clientName: '' },
    );
    expect(out).not.toMatch(/[\r\n]/);
  });

  it('truncates to 200 characters', () => {
    const cfg: EmailConfig = { subject: 'X'.repeat(300) };
    expect(renderEmailSubject(cfg, null, vars)).toHaveLength(200);
  });

  it('never returns an empty string', () => {
    const out = renderEmailSubject(null, null, { title: '', period: '', clientName: '' });
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('renderEmailBody', () => {
  it('uses config.bodyHtml when present', () => {
    const cfg: EmailConfig = { bodyHtml: '<p>Hola {clientName}, aquí tu {title}.</p>' };
    expect(renderEmailBody(cfg, vars)).toBe('<p>Hola Edauto Paterna, aquí tu Informe ventas.</p>');
  });

  it('falls back to the default body when config has no bodyHtml', () => {
    const body = renderEmailBody(null, vars);
    expect(body).toContain('Informe ventas');
    expect(body).toContain('FEBRERO 2026');
    expect(body).toContain('Adjunto');
  });

  it('replaces all three placeholders', () => {
    const cfg: EmailConfig = { bodyHtml: '{title} | {period} | {clientName}' };
    expect(renderEmailBody(cfg, vars)).toBe('Informe ventas | FEBRERO 2026 | Edauto Paterna');
  });
});
