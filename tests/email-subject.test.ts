/**
 * Tests for the email subject helper (lib/email/subject.ts).
 * Covers three priority levels:
 *   1. Structured EmailSubjectConfig (new — migration 006 onwards)
 *   2. Legacy free-text template with {placeholder} syntax
 *   3. Hard-coded fallback
 */
import { describe, it, expect } from 'vitest';
import {
  renderEmailSubject,
  renderSubjectFromConfig,
  renderSubjectFromTemplate,
  DEFAULT_SUBJECT_CONFIG,
} from '@/lib/email/subject';
import type { EmailSubjectConfig } from '@/types/database';

const vars = {
  title: 'Informe ventas',
  period: 'FEBRERO 2026',
  clientName: 'Edauto Paterna',
};

describe('renderSubjectFromConfig (declarative)', () => {
  it('renders the default config (title + period with em-dash)', () => {
    expect(renderSubjectFromConfig(DEFAULT_SUBJECT_CONFIG, vars)).toBe(
      'Informe ventas — FEBRERO 2026',
    );
  });

  it('omits parts that are toggled off', () => {
    const cfg: EmailSubjectConfig = {
      prefix: '',
      includeTitle: true,
      includePeriod: false,
      includeClientName: false,
      separator: ' - ',
      suffix: '',
    };
    expect(renderSubjectFromConfig(cfg, vars)).toBe('Informe ventas');
  });

  it('joins prefix + title + period + clientName + suffix with the chosen separator', () => {
    const cfg: EmailSubjectConfig = {
      prefix: 'Informe',
      includeTitle: true,
      includePeriod: true,
      includeClientName: true,
      separator: ' | ',
      suffix: '(confidencial)',
    };
    expect(renderSubjectFromConfig(cfg, vars)).toBe(
      'Informe | Informe ventas | FEBRERO 2026 | Edauto Paterna | (confidencial)',
    );
  });

  it('honours the order: prefix → title → period → clientName → suffix', () => {
    const cfg: EmailSubjectConfig = {
      prefix: 'A',
      includeTitle: true,
      includePeriod: true,
      includeClientName: true,
      separator: '-',
      suffix: 'Z',
    };
    expect(renderSubjectFromConfig(cfg, vars)).toBe(
      'A-Informe ventas-FEBRERO 2026-Edauto Paterna-Z',
    );
  });

  it('produces a prefix-only subject', () => {
    const cfg: EmailSubjectConfig = {
      prefix: 'Solo texto fijo',
      includeTitle: false,
      includePeriod: false,
      includeClientName: false,
      separator: ' - ',
      suffix: '',
    };
    expect(renderSubjectFromConfig(cfg, vars)).toBe('Solo texto fijo');
  });

  it('falls back to the default config when everything is empty/off', () => {
    const cfg: EmailSubjectConfig = {
      prefix: '',
      includeTitle: false,
      includePeriod: false,
      includeClientName: false,
      separator: ' - ',
      suffix: '',
    };
    expect(renderSubjectFromConfig(cfg, vars)).toBe('Informe ventas — FEBRERO 2026');
  });

  it('neutralises CRLF in prefix/suffix and variable values', () => {
    const cfg: EmailSubjectConfig = {
      prefix: 'Informe\r\nBcc: evil@x.com',
      includeTitle: true,
      includePeriod: false,
      includeClientName: false,
      separator: ' - ',
      suffix: '',
    };
    const out = renderSubjectFromConfig(cfg, {
      title: 'titulo\rcon\nretornos',
      period: 'x',
      clientName: 'y',
    });
    expect(out).not.toMatch(/[\r\n]/);
  });

  it('truncates to 200 characters', () => {
    const cfg: EmailSubjectConfig = {
      prefix: 'X'.repeat(300),
      includeTitle: false,
      includePeriod: false,
      includeClientName: false,
      separator: ' - ',
      suffix: '',
    };
    expect(renderSubjectFromConfig(cfg, vars)).toHaveLength(200);
  });

  it('null config uses the default', () => {
    expect(renderSubjectFromConfig(null, vars)).toBe('Informe ventas — FEBRERO 2026');
  });

  it('skips variables that are empty strings even when their flag is true', () => {
    const cfg: EmailSubjectConfig = {
      prefix: 'Informe',
      includeTitle: true,
      includePeriod: true,
      includeClientName: false,
      separator: ' - ',
      suffix: '',
    };
    expect(
      renderSubjectFromConfig(cfg, { title: '', period: 'FEBRERO 2026', clientName: '' }),
    ).toBe('Informe - FEBRERO 2026');
  });
});

describe('renderSubjectFromTemplate (legacy)', () => {
  it('substitutes placeholders', () => {
    expect(renderSubjectFromTemplate('{title} - {period}', vars)).toBe(
      'Informe ventas - FEBRERO 2026',
    );
  });

  it('leaves literal text alone', () => {
    expect(renderSubjectFromTemplate('Sin placeholders', vars)).toBe('Sin placeholders');
  });

  it('strips CRLF from substituted values (injection defence)', () => {
    const out = renderSubjectFromTemplate('{title}', {
      title: 'mal\r\nBcc: evil@x.com',
      period: 'x',
      clientName: 'y',
    });
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toContain('Bcc: evil@x.com');
  });

  it('truncates to 200 characters', () => {
    expect(renderSubjectFromTemplate('X'.repeat(300), vars)).toHaveLength(200);
  });
});

describe('renderEmailSubject (priority: config → template → fallback)', () => {
  it('prefers the config over the legacy template', () => {
    const cfg: EmailSubjectConfig = {
      prefix: 'FROM_CONFIG',
      includeTitle: false,
      includePeriod: false,
      includeClientName: false,
      separator: ' - ',
      suffix: '',
    };
    expect(
      renderEmailSubject(cfg, 'FROM_TEMPLATE {title}', vars),
    ).toBe('FROM_CONFIG');
  });

  it('falls back to the legacy template when config is null', () => {
    expect(renderEmailSubject(null, 'Informe {title}', vars)).toBe('Informe Informe ventas');
  });

  it('falls back to the hard-coded default when both are null/empty', () => {
    expect(renderEmailSubject(null, null, vars)).toBe('Informe ventas — FEBRERO 2026');
    expect(renderEmailSubject(null, '', vars)).toBe('Informe ventas — FEBRERO 2026');
    expect(renderEmailSubject(null, '   ', vars)).toBe('Informe ventas — FEBRERO 2026');
  });

  it('never returns an empty string', () => {
    const out = renderEmailSubject(null, null, { title: '', period: '', clientName: '' });
    expect(out.length).toBeGreaterThan(0);
  });
});
