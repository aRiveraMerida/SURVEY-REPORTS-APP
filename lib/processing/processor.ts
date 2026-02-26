import type {
  AIAnalysis,
  AIQuestionConfig,
  ProcessedData,
  FunnelData,
  ProcessedQuestion,
} from '@/types/database';

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
 * Process dataset using AI analysis output.
 * Handles optional funnel and flexible per-question filtering.
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

  const questions: ProcessedQuestion[] = enabledQuestions.map((q, idx) => {
    // Each question uses its own filter (or all rows if no filter)
    const rows = getFilteredRows(rawData, q);

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
      percentages[key] = total > 0
        ? (count / total * 100).toFixed(2).replace('.', ',') + '%'
        : '0%';
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
  });

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
      counts.notContacted.total++;
      counts.notContacted.breakdown[value] = (counts.notContacted.breakdown[value] || 0) + 1;
    }
  }

  counts.contacted = counts.contactedNotInformed.total + counts.informed.total;
  return counts;
}
