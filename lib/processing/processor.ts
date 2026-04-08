import type {
  AIAnalysis,
  AIQuestionConfig,
  ProcessedData,
  FunnelData,
  ProcessedQuestion,
} from '@/types/database';
import { formatPercent } from '@/lib/utils/formatting';
import {
  parseDateTime,
  formatShortDate,
  hourBucketLabel,
  analyzeDateColumn,
} from './date-utils';

/**
 * Normalize cell values for consistent counting
 */
function normalize(value: string): string {
  const v = value.trim().replace(/\s+/g, ' ');
  const lower = v.toLowerCase();
  if (['si', 'sí', 'yes', 's', 'true', '1'].includes(lower)) return 'SI';
  if (['no', 'n', 'false', '0', 'nop'].includes(lower)) return 'NO';
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * Empty funnel for when no classification structure is detected
 */
function emptyFunnel(totalRows: number): FunnelData {
  return {
    total: totalRows,
    notContacted: { total: 0, breakdown: {} },
    contactedNotInformed: { total: 0, breakdown: {} },
    informed: { total: 0, breakdown: {} },
    contacted: 0,
  };
}

/**
 * Get filtered rows for a question based on its filter config
 */
function getFilteredRows(
  rawData: Record<string, string>[],
  question: AIQuestionConfig
): Record<string, string>[] {
  if (!question.filterColumn || !question.filterValues?.length) {
    return rawData;
  }
  const filterSet = new Set(question.filterValues);
  return rawData.filter((row) => {
    const val = (row[question.filterColumn!] || '').trim();
    return filterSet.has(val);
  });
}

/**
 * Build a ProcessedQuestion for a column of date values, using short date
 * labels (dd/mm/yyyy) instead of raw strings and sorted chronologically.
 */
function processDateQuestion(
  rows: Record<string, string>[],
  q: AIQuestionConfig,
  idx: number
): ProcessedQuestion {
  // Group counts by the underlying Date's yyyy-mm-dd, then render as dd/mm/yyyy
  const dateCounts = new Map<string, { date: Date; count: number }>();

  for (const row of rows) {
    const raw = (row[q.columnLetter] || '').trim();
    if (!raw || raw === 'null' || raw === 'undefined') continue;
    const dt = parseDateTime(raw);
    if (!dt) continue;
    const key = `${dt.date.getFullYear()}-${dt.date.getMonth()}-${dt.date.getDate()}`;
    const existing = dateCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      // Normalize to midnight so repeated days map to the same key
      const day = new Date(
        dt.date.getFullYear(),
        dt.date.getMonth(),
        dt.date.getDate()
      );
      dateCounts.set(key, { date: day, count: 1 });
    }
  }

  // Sort chronologically
  const sorted = [...dateCounts.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

  const frequencies: Record<string, number> = {};
  for (const { date, count } of sorted) {
    frequencies[formatShortDate(date)] = count;
  }

  const total = sorted.reduce((acc, v) => acc + v.count, 0);
  const percentages: Record<string, string> = {};
  for (const [key, count] of Object.entries(frequencies)) {
    percentages[key] = formatPercent(count, total);
  }

  return {
    id: q.id,
    questionText: q.questionText,
    chartType: q.chartType,
    total,
    frequencies,
    percentages,
    order: idx,
  };
}

/**
 * Build an additional "hourly distribution" ProcessedQuestion from a
 * datetime column. One bucket per hour of day (00:00 .. 23:00).
 */
function buildHourlyDistributionQuestion(
  rows: Record<string, string>[],
  parentQuestion: AIQuestionConfig,
  order: number
): ProcessedQuestion {
  const buckets: Record<number, number> = {};
  for (const row of rows) {
    const raw = (row[parentQuestion.columnLetter] || '').trim();
    if (!raw) continue;
    const dt = parseDateTime(raw);
    if (!dt || !dt.hasTime) continue;
    const h = dt.date.getHours();
    buckets[h] = (buckets[h] || 0) + 1;
  }

  // Only include hours that actually appear, keep chronological order
  const hours = Object.keys(buckets).map((n) => parseInt(n, 10)).sort((a, b) => a - b);
  const frequencies: Record<string, number> = {};
  for (const h of hours) frequencies[hourBucketLabel(h)] = buckets[h];

  const total = Object.values(frequencies).reduce((a, b) => a + b, 0);
  const percentages: Record<string, string> = {};
  for (const [key, count] of Object.entries(frequencies)) {
    percentages[key] = formatPercent(count, total);
  }

  return {
    id: `${parentQuestion.id}-hourly`,
    questionText: `${parentQuestion.questionText} — Distribución horaria`,
    chartType: 'bar',
    total,
    frequencies,
    percentages,
    order,
  };
}

/**
 * Process dataset using AI analysis output.
 * Handles optional funnel and flexible per-question filtering.
 *
 * Date columns are detected automatically and rendered with short dates
 * (dd/mm/yyyy). When the column also contains a time component, an extra
 * synthetic question is appended with an hourly distribution (1-hour bins).
 */
export function processDataset(
  rawData: Record<string, string>[],
  analysis: AIAnalysis
): ProcessedData {
  // Build funnel if config exists, otherwise empty
  const funnel = analysis.funnel && analysis.resultColumn
    ? calculateFunnel(rawData, analysis.resultColumn, analysis.funnel)
    : emptyFunnel(rawData.length);

  // Only process enabled questions
  const enabledQuestions = analysis.questions.filter((q) => q.enabled);

  const questions: ProcessedQuestion[] = [];
  let orderCounter = 0;

  for (const q of enabledQuestions) {
    const rows = getFilteredRows(rawData, q);
    const columnValues = rows.map((r) => (r[q.columnLetter] || '').trim());
    const dateInfo = analyzeDateColumn(columnValues);

    if (dateInfo.isDate) {
      // Date column — render with short dates, sorted chronologically
      questions.push(processDateQuestion(rows, q, orderCounter++));

      // If there's a time component, also emit an hourly distribution page
      if (dateInfo.hasAnyTime) {
        const hourly = buildHourlyDistributionQuestion(rows, q, orderCounter++);
        if (hourly.total > 0) {
          questions.push(hourly);
        }
      }
      continue;
    }

    // Standard categorical processing
    const frequencies: Record<string, number> = {};
    for (const row of rows) {
      const val = (row[q.columnLetter] || '').trim();
      if (val && val !== 'null' && val !== 'undefined') {
        const norm = normalize(val);
        frequencies[norm] = (frequencies[norm] || 0) + 1;
      }
    }

    const total = Object.values(frequencies).reduce((a, b) => a + b, 0);
    const percentages: Record<string, string> = {};
    for (const [key, count] of Object.entries(frequencies)) {
      percentages[key] = formatPercent(count, total);
    }

    questions.push({
      id: q.id,
      questionText: q.questionText,
      chartType: q.chartType,
      total,
      frequencies,
      percentages,
      order: orderCounter++,
    });
  }

  return { totalRows: rawData.length, funnel, questions };
}

/**
 * Calculate funnel from AI-identified categories
 */
function calculateFunnel(
  rows: Record<string, string>[],
  resultColumn: string,
  funnelConfig: NonNullable<AIAnalysis['funnel']>
): FunnelData {
  const notContactedSet = new Set(funnelConfig.notContacted.values);
  const contactedNotInformedSet = new Set(funnelConfig.contactedNotInformed.values);
  const informedSet = new Set(funnelConfig.informed.values);

  const counts: FunnelData = {
    total: rows.length,
    notContacted: { total: 0, breakdown: {} },
    contactedNotInformed: { total: 0, breakdown: {} },
    informed: { total: 0, breakdown: {} },
    contacted: 0,
  };

  for (const row of rows) {
    const value = (row[resultColumn] || '').trim();
    if (!value) continue;

    if (notContactedSet.has(value)) {
      counts.notContacted.total++;
      counts.notContacted.breakdown[value] = (counts.notContacted.breakdown[value] || 0) + 1;
    } else if (contactedNotInformedSet.has(value)) {
      counts.contactedNotInformed.total++;
      counts.contactedNotInformed.breakdown[value] = (counts.contactedNotInformed.breakdown[value] || 0) + 1;
    } else if (informedSet.has(value)) {
      counts.informed.total++;
      counts.informed.breakdown[value] = (counts.informed.breakdown[value] || 0) + 1;
    } else {
      // Unclassified values are skipped — they don't belong to any funnel category
    }
  }

  counts.contacted = counts.contactedNotInformed.total + counts.informed.total;
  return counts;
}
