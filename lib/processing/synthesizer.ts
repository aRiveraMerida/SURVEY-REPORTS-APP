import type {
  ProcessedData,
  AITableRow,
  AIFlowchartPage,
} from '@/types/database';

/**
 * Build default table rows from the processed questions when the AI
 * did not provide any (or when its rows all resolve to 0 because there
 * is no funnel in the data).
 *
 * Structure:
 *   - A top-level "Total registros" row
 *   - For each question: a header row with its total, then one row per
 *     breakdown value sorted by frequency.
 */
export function synthesizeTableRows(data: ProcessedData): AITableRow[] {
  const rows: AITableRow[] = [];

  rows.push({
    label: 'Total registros',
    source: 'total',
    level: 0,
    bold: true,
    highlight: true,
  });

  for (const q of data.questions) {
    rows.push({
      label: q.questionText,
      source: `question.${q.id}.total`,
      percentOf: 'total',
      level: 0,
      bold: true,
    });

    const entries = Object.entries(q.frequencies).sort((a, b) => b[1] - a[1]);
    for (const [value] of entries) {
      rows.push({
        label: value,
        source: `question.${q.id}.breakdown.${value}`,
        percentOf: `question.${q.id}.total`,
        level: 1,
      });
    }
  }

  return rows;
}

/**
 * Build default flowchart pages from the processed questions when the AI
 * did not provide any. One page per question, with a root node for the
 * question total and child nodes for each breakdown value.
 */
export function synthesizeFlowchartPages(data: ProcessedData): AIFlowchartPage[] {
  const pages: AIFlowchartPage[] = [];

  for (const q of data.questions) {
    const children = Object.entries(q.frequencies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8) // keep layouts readable
      .map(([value], idx) => ({
        id: `${q.id}-child-${idx}`,
        label: value,
        source: `question.${q.id}.breakdown.${value}`,
        percentOf: `question.${q.id}.total`,
        level: 1,
      }));

    pages.push({
      id: `page-${q.id}`,
      title: q.questionText,
      nodes: [
        {
          id: `${q.id}-root`,
          label: 'TOTAL',
          source: `question.${q.id}.total`,
          percentOf: 'total',
          level: 0,
          children: children.map((c) => c.id),
        },
        ...children,
      ],
    });
  }

  return pages;
}

/**
 * Decide whether AI-provided table rows are effectively empty for this
 * dataset — either the array is empty or every row resolves to 0 against
 * the funnel. In that case the caller should fall back to the synthesized
 * rows.
 */
export function aiTableRowsAreEmpty(
  rows: AITableRow[] | undefined | null,
  data: ProcessedData
): boolean {
  if (!rows || rows.length === 0) return true;
  // If there's no funnel and every source is funnel-based, the table will
  // render all zeros. We consider that empty.
  const funnel = data.funnel;
  const hasFunnel =
    funnel.contacted > 0 ||
    funnel.informed.total > 0 ||
    funnel.notContacted.total > 0 ||
    funnel.contactedNotInformed.total > 0;
  if (hasFunnel) return false;

  // No funnel — only rows referencing "question.*" or "total" will render.
  const usable = rows.filter(
    (r) => r.source === 'total' || r.source.startsWith('question.')
  );
  return usable.length === 0;
}

/** Same heuristic for flowchart pages. */
export function aiFlowchartPagesAreEmpty(
  pages: AIFlowchartPage[] | undefined | null,
  data: ProcessedData
): boolean {
  if (!pages || pages.length === 0) return true;
  const funnel = data.funnel;
  const hasFunnel =
    funnel.contacted > 0 ||
    funnel.informed.total > 0 ||
    funnel.notContacted.total > 0 ||
    funnel.contactedNotInformed.total > 0;
  if (hasFunnel) return false;

  const anyUsable = pages.some((p) =>
    p.nodes.some(
      (n) => n.source === 'total' || n.source.startsWith('question.')
    )
  );
  return !anyUsable;
}
