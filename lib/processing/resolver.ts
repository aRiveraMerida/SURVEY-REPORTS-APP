import type { FunnelData, ProcessedData } from '@/types/database';
import { formatPercent } from '@/lib/utils/formatting';

/**
 * Resolve a dot-path source string to a numeric value.
 *
 * Funnel paths:
 *   "total"                                → funnel.total (falls back to processed.totalRows)
 *   "contacted"                            → funnel.contacted
 *   "notContacted.total"                   → funnel.notContacted.total
 *   "informed.total"                       → funnel.informed.total
 *   "informed.breakdown.ENCUESTA REALIZADA"→ funnel.informed.breakdown["ENCUESTA REALIZADA"]
 *
 * Question paths (for datasets without a funnel):
 *   "question.q1.total"                    → question with id q1, total responses
 *   "question.q1.breakdown.SI"             → question q1, count of value "SI"
 */
export function resolveSource(
  source: string,
  funnelOrData: FunnelData | ProcessedData
): number {
  if (!source) return 0;

  // Detect whether we got a ProcessedData or a raw FunnelData.
  // ProcessedData has `questions` and `funnel`, FunnelData has `notContacted`.
  const processed: ProcessedData | null =
    'questions' in funnelOrData && 'funnel' in funnelOrData
      ? (funnelOrData as ProcessedData)
      : null;
  const funnel: FunnelData = processed ? processed.funnel : (funnelOrData as FunnelData);

  const parts = source.split('.');

  // Top-level shortcuts
  if (parts[0] === 'total') return funnel.total || (processed ? processed.totalRows : 0);
  if (parts[0] === 'contacted') return funnel.contacted;

  // Question-level resolution: "question.<id>.total" or "question.<id>.breakdown.<VALUE>"
  if (parts[0] === 'question' && processed && parts.length >= 2) {
    const questionId = parts[1];
    const question = processed.questions.find((q) => q.id === questionId);
    if (!question) return 0;

    if (parts.length === 2 || parts[2] === 'total') {
      return question.total;
    }
    if (parts[2] === 'breakdown' && parts.length >= 4) {
      const breakdownKey = parts.slice(3).join('.');
      return question.frequencies[breakdownKey] || 0;
    }
    return 0;
  }

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
  funnelOrData: FunnelData | ProcessedData
): string {
  if (!percentOfSource) return '';
  const ref = resolveSource(percentOfSource, funnelOrData);
  return formatPercent(value, ref);
}
