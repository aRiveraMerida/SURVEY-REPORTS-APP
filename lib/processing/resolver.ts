import type { FunnelData } from '@/types/database';
import { formatPercent } from '@/lib/utils/formatting';

/**
 * Resolve a dot-path source string to a numeric value from funnel data.
 *
 * Examples:
 *   "total"                                → funnel.total
 *   "contacted"                            → funnel.contacted
 *   "notContacted.total"                   → funnel.notContacted.total
 *   "informed.total"                       → funnel.informed.total
 *   "informed.breakdown.ENCUESTA REALIZADA"→ funnel.informed.breakdown["ENCUESTA REALIZADA"]
 *   "contactedNotInformed.breakdown.BUZÓN" → funnel.contactedNotInformed.breakdown["BUZÓN"]
 */
export function resolveSource(source: string, funnel: FunnelData): number {
  if (!source) return 0;

  const parts = source.split('.');

  // Top-level shortcuts
  if (parts[0] === 'total') return funnel.total;
  if (parts[0] === 'contacted') return funnel.contacted;

  // Category-level resolution
  const categoryMap: Record<string, { total: number; breakdown: Record<string, number> }> = {
    notContacted: funnel.notContacted,
    contactedNotInformed: funnel.contactedNotInformed,
    informed: funnel.informed,
  };

  const category = categoryMap[parts[0]];
  if (!category) return 0;

  if (parts.length === 1) return category.total;
  if (parts[1] === 'total') return category.total;

  if (parts[1] === 'breakdown' && parts.length >= 3) {
    // Join remaining parts to support labels with dots
    const breakdownKey = parts.slice(2).join('.');
    return category.breakdown[breakdownKey] || 0;
  }

  return 0;
}

/**
 * Calculate percentage of a value relative to a reference source.
 */
export function resolvePercent(
  value: number,
  percentOfSource: string | undefined,
  funnel: FunnelData
): string {
  if (!percentOfSource) return '';
  const ref = resolveSource(percentOfSource, funnel);
  return formatPercent(value, ref);
}
