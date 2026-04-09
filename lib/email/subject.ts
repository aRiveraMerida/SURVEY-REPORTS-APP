import type { EmailConfig } from '@/types/database';

/**
 * Variables available when rendering email subject / body.
 */
export interface SubjectVars {
  title: string;
  period: string;
  clientName: string;
}

/** Sanitise a string for use in email headers (strips CRLF). */
function sanitize(s: string): string {
  return s.replace(/[\r\n]/g, ' ').trim();
}

/** Replace all supported placeholders in a template string. */
function replacePlaceholders(template: string, vars: SubjectVars): string {
  return template
    .replace(/\{title\}/g, sanitize(vars.title))
    .replace(/\{period\}/g, sanitize(vars.period))
    .replace(/\{clientName\}/g, sanitize(vars.clientName));
}

const MAX_SUBJECT_LENGTH = 200;

/**
 * Render the email subject from the client's config.
 *
 * Priority:
 *   1. `config.subject` (from migration 006 onwards)
 *   2. `legacyTemplate` (free-text template from migration 005)
 *   3. Hard-coded fallback: `"{title} — {period}"`
 *
 * All three support {title}, {period}, {clientName} placeholders.
 */
export function renderEmailSubject(
  config: EmailConfig | null | undefined,
  legacyTemplate: string | null | undefined,
  vars: SubjectVars
): string {
  const fallback = `${sanitize(vars.title) || 'Informe'} — ${sanitize(vars.period)}`;

  if (config?.subject?.trim()) {
    const out = sanitize(replacePlaceholders(config.subject, vars));
    return out.substring(0, MAX_SUBJECT_LENGTH) || fallback;
  }

  if (legacyTemplate?.trim()) {
    const out = sanitize(replacePlaceholders(legacyTemplate, vars));
    return out.substring(0, MAX_SUBJECT_LENGTH) || fallback;
  }

  return fallback;
}

/**
 * Default HTML email body used when the client hasn't customised one.
 * Supports the same {title}, {period}, {clientName} placeholders.
 */
const DEFAULT_BODY_HTML = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#53860F;margin-bottom:8px;">{title}</h2>
  <p style="color:#666;margin-bottom:20px;">Periodo: <strong>{period}</strong></p>
  <p style="color:#333;line-height:1.6;">
    Adjunto encontrará el informe generado en formato PDF y el archivo de datos original.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;">Este email ha sido enviado automáticamente.</p>
</div>
`.trim();

/**
 * Render the email body HTML from the client's config.
 *
 * If `config.bodyHtml` is set, use it (with placeholder replacement).
 * Otherwise fall back to the built-in default body.
 */
export function renderEmailBody(
  config: EmailConfig | null | undefined,
  vars: SubjectVars
): string {
  const template = config?.bodyHtml?.trim() || DEFAULT_BODY_HTML;
  return replacePlaceholders(template, vars);
}
