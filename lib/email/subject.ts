import type { EmailSubjectConfig } from '@/types/database';

/**
 * Variables available when rendering an email subject.
 */
export interface SubjectVars {
  title: string;
  period: string;
  clientName: string;
}

/**
 * Strip anything that would allow injecting additional email headers
 * and trim leading/trailing whitespace.
 */
function sanitize(s: string): string {
  return s.replace(/[\r\n]/g, ' ').trim();
}

/** Maximum allowed subject length (mail clients and RFC 2822 are lenient). */
const MAX_SUBJECT_LENGTH = 200;

/**
 * Default configuration used when the client hasn't customised
 * anything yet. Mirrors the old hard-coded `${title} — ${period}`
 * behaviour.
 */
export const DEFAULT_SUBJECT_CONFIG: EmailSubjectConfig = {
  prefix: '',
  includeTitle: true,
  includePeriod: true,
  includeClientName: false,
  separator: ' — ',
  suffix: '',
};

/** Valid separator presets the UI exposes. */
export const SEPARATOR_OPTIONS: { value: string; label: string }[] = [
  { value: ' — ', label: '— (raya larga)' },
  { value: ' - ', label: '- (guión)' },
  { value: ' | ', label: '| (barra vertical)' },
  { value: ' · ', label: '· (punto medio)' },
  { value: ': ', label: ': (dos puntos)' },
  { value: ' ', label: 'Espacio' },
];

/**
 * Render the final subject from a structured config + variables.
 * Parts are joined in this order: prefix → title → period →
 * clientName → suffix, using the config's separator. Empty or
 * disabled parts are skipped so the separator never appears twice
 * in a row.
 */
export function renderSubjectFromConfig(
  config: EmailSubjectConfig | null | undefined,
  vars: SubjectVars
): string {
  const c = config || DEFAULT_SUBJECT_CONFIG;
  const sep = c.separator || ' — ';

  const parts: string[] = [];
  const prefix = sanitize(c.prefix || '');
  if (prefix) parts.push(prefix);
  if (c.includeTitle) {
    const t = sanitize(vars.title);
    if (t) parts.push(t);
  }
  if (c.includePeriod) {
    const p = sanitize(vars.period);
    if (p) parts.push(p);
  }
  if (c.includeClientName) {
    const n = sanitize(vars.clientName);
    if (n) parts.push(n);
  }
  const suffix = sanitize(c.suffix || '');
  if (suffix) parts.push(suffix);

  const joined = parts.join(sep).trim();
  if (joined) return joined.substring(0, MAX_SUBJECT_LENGTH);

  // Nothing selected → fall back to the default title — period
  return renderSubjectFromConfig(DEFAULT_SUBJECT_CONFIG, vars);
}

/**
 * Legacy template renderer — kept so clients configured before
 * migration 006 (with free-text {placeholder} strings) still work.
 *
 * Supports: {title}, {period}, {clientName}
 */
export function renderSubjectFromTemplate(
  template: string,
  vars: SubjectVars
): string {
  const rendered = template
    .replace(/\{title\}/g, sanitize(vars.title))
    .replace(/\{period\}/g, sanitize(vars.period))
    .replace(/\{clientName\}/g, sanitize(vars.clientName));
  return sanitize(rendered).substring(0, MAX_SUBJECT_LENGTH);
}

/**
 * Top-level renderer used by the email send endpoint. Priority:
 *
 *   1. Structured `config` (from migration 006 onwards).
 *   2. Legacy free-text `template` string.
 *   3. Hard-coded fallback `"{title} — {period}"`.
 *
 * Always returns a non-empty string; never throws.
 */
export function renderEmailSubject(
  config: EmailSubjectConfig | null | undefined,
  template: string | null | undefined,
  vars: SubjectVars
): string {
  const fallback = `${sanitize(vars.title) || 'Informe'} — ${sanitize(vars.period)}`;

  if (config) {
    const out = renderSubjectFromConfig(config, vars);
    return out || fallback;
  }

  if (template && template.trim()) {
    const out = renderSubjectFromTemplate(template, vars);
    return out || fallback;
  }

  return fallback;
}
