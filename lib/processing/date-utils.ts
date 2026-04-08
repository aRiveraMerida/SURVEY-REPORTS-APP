/**
 * Date/time parsing helpers for survey data.
 *
 * Input values come from Excel/CSV parsing where dates can appear in many
 * shapes: Excel serial numbers, ISO 8601 strings, Spanish dd/mm/yyyy, etc.
 * We always prefer dd/mm order because the app is Spanish-first.
 */

export interface ParsedDateTime {
  date: Date;
  hasTime: boolean;
}

/**
 * Try to parse a raw cell value into a Date plus a `hasTime` flag.
 * Returns null if the value does not look like a date.
 */
export function parseDateTime(value: string): ParsedDateTime | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;

  // Pure numeric — may be an Excel serial date
  if (/^\d+(\.\d+)?$/.test(v)) {
    const num = parseFloat(v);
    // Rough sanity window: Excel serials for years 1968..2100 fall in this range
    if (num > 20000 && num < 80000) {
      // Excel's day 1 = 1900-01-01, but JS date 25569 corresponds to 1970-01-01
      const ms = (num - 25569) * 86400 * 1000;
      const date = new Date(ms);
      if (!isNaN(date.getTime())) {
        return { date, hasTime: num % 1 !== 0 };
      }
    }
    return null;
  }

  // ISO-like yyyy-mm-dd[ Thh:mm[:ss]]
  const isoMatch = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
    const minute = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    const second = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    const d = new Date(year, month - 1, day, hour, minute, second);
    if (!isNaN(d.getTime())) return { date: d, hasTime: !!isoMatch[4] };
  }

  // dd/mm/yyyy [hh:mm[:ss]] — Spanish convention
  const dmyMatch = v.match(
    /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month - 1, day, hour, minute, second);
    if (!isNaN(d.getTime()) && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { date: d, hasTime: !!dmyMatch[4] };
    }
  }

  return null;
}

/** Format a Date as dd/mm/yyyy. */
export function formatShortDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Return a label for a 1-hour bucket, e.g. 14 → "14:00 - 14:59". */
export function hourBucketLabel(hour: number): string {
  const h = String(hour).padStart(2, '0');
  return `${h}:00 - ${h}:59`;
}

/**
 * Check whether a column of values looks like date/datetime data.
 * Returns stats about the column so callers can decide whether to
 * treat it as a date series.
 */
export function analyzeDateColumn(values: string[]): {
  isDate: boolean;
  hasAnyTime: boolean;
  parsedRatio: number;
} {
  let parsed = 0;
  let withTime = 0;
  let nonEmpty = 0;
  for (const v of values) {
    if (!v || !v.trim()) continue;
    nonEmpty++;
    const dt = parseDateTime(v);
    if (dt) {
      parsed++;
      if (dt.hasTime) withTime++;
    }
  }
  const ratio = nonEmpty === 0 ? 0 : parsed / nonEmpty;
  return {
    isDate: nonEmpty > 0 && ratio >= 0.8,
    hasAnyTime: withTime > 0,
    parsedRatio: ratio,
  };
}
