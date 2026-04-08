/**
 * Business-logic tests: date parsing, data processing, resolver,
 * synthesizer. Runs fast (pure functions, no I/O) so it's the first
 * line of regression defence.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDateTime,
  formatShortDate,
  hourBucketLabel,
  analyzeDateColumn,
} from '@/lib/processing/date-utils';
import { processDataset } from '@/lib/processing/processor';
import { resolveSource, resolvePercent } from '@/lib/processing/resolver';
import {
  synthesizeTableRows,
  synthesizeFlowchartPages,
  aiTableRowsAreEmpty,
  aiFlowchartPagesAreEmpty,
} from '@/lib/processing/synthesizer';
import type { AIAnalysis, ProcessedData } from '@/types/database';

describe('parseDateTime', () => {
  it('parses dd/mm/yyyy without time', () => {
    const d = parseDateTime('15/02/2026');
    expect(d).not.toBeNull();
    expect(d!.date.getDate()).toBe(15);
    expect(d!.date.getMonth()).toBe(1);
    expect(d!.date.getFullYear()).toBe(2026);
    expect(d!.hasTime).toBe(false);
  });

  it('parses dd/mm/yyyy hh:mm', () => {
    const d = parseDateTime('15/02/2026 14:30');
    expect(d).not.toBeNull();
    expect(d!.date.getHours()).toBe(14);
    expect(d!.date.getMinutes()).toBe(30);
    expect(d!.hasTime).toBe(true);
  });

  it('parses dd/mm/yyyy hh:mm:ss', () => {
    const d = parseDateTime('15/02/2026 14:30:45');
    expect(d).not.toBeNull();
    expect(d!.date.getSeconds()).toBe(45);
    expect(d!.hasTime).toBe(true);
  });

  it('parses ISO yyyy-mm-dd', () => {
    const d = parseDateTime('2026-02-15');
    expect(d).not.toBeNull();
    expect(d!.date.getDate()).toBe(15);
    expect(d!.date.getMonth()).toBe(1);
    expect(d!.hasTime).toBe(false);
  });

  it('parses ISO yyyy-mm-ddThh:mm:ss', () => {
    const d = parseDateTime('2026-02-15T14:30:00');
    expect(d).not.toBeNull();
    expect(d!.date.getHours()).toBe(14);
    expect(d!.hasTime).toBe(true);
  });

  it('parses Excel serial dates', () => {
    // 46068 ≈ 15/02/2026
    const d = parseDateTime('46068');
    expect(d).not.toBeNull();
    expect(d!.date.getFullYear()).toBe(2026);
    expect(d!.date.getMonth()).toBe(1);
  });

  it('parses Excel serial with fractional time', () => {
    const d = parseDateTime('46068.5');
    expect(d).not.toBeNull();
    expect(d!.hasTime).toBe(true);
  });

  it('rejects empty string, non-date text and invalid day/month', () => {
    expect(parseDateTime('')).toBeNull();
    expect(parseDateTime('hola')).toBeNull();
    expect(parseDateTime('7')).toBeNull(); // too small for Excel serial
    expect(parseDateTime('32/13/2026')).toBeNull();
  });
});

describe('formatShortDate / hourBucketLabel', () => {
  it('pads zeros in the short date', () => {
    expect(formatShortDate(new Date(2026, 1, 5))).toBe('05/02/2026');
    expect(formatShortDate(new Date(2026, 11, 31))).toBe('31/12/2026');
  });

  it('formats hour buckets 0..23 with padding', () => {
    expect(hourBucketLabel(0)).toBe('00:00 - 00:59');
    expect(hourBucketLabel(14)).toBe('14:00 - 14:59');
    expect(hourBucketLabel(23)).toBe('23:00 - 23:59');
  });
});

describe('analyzeDateColumn', () => {
  it('detects a mixed date column with time components', () => {
    const info = analyzeDateColumn(['15/02/2026', '16/02/2026 14:30', '17/02/2026', '']);
    expect(info.isDate).toBe(true);
    expect(info.hasAnyTime).toBe(true);
  });

  it('rejects SI/NO as not-date', () => {
    const info = analyzeDateColumn(['SI', 'NO', 'SI', 'NO']);
    expect(info.isDate).toBe(false);
  });

  it('detects pure date column without time', () => {
    const info = analyzeDateColumn(['15/02/2026', '16/02/2026', '17/02/2026']);
    expect(info.isDate).toBe(true);
    expect(info.hasAnyTime).toBe(false);
  });
});

describe('processDataset — date column', () => {
  const rawRows: Record<string, string>[] = [
    { A: 'SI', B: '15/02/2026 09:00' },
    { A: 'NO', B: '15/02/2026 09:30' },
    { A: 'SI', B: '15/02/2026 14:15' },
    { A: 'SI', B: '16/02/2026 10:00' },
    { A: 'NO', B: '16/02/2026 14:45' },
    { A: 'SI', B: '17/02/2026 09:20' },
  ];

  const analysis: AIAnalysis = {
    summary: 'Test',
    dataType: 'encuesta',
    funnel: null,
    questions: [
      { id: 'q1', columnLetter: 'A', questionText: '¿Ha respondido?', chartType: 'pie', rationale: '', enabled: true },
      { id: 'q2', columnLetter: 'B', questionText: 'Fecha de respuesta', chartType: 'bar', rationale: '', enabled: true },
    ],
    tableRows: [],
    flowchartPages: [],
  };

  const processed = processDataset(rawRows, analysis);

  it('counts rows', () => {
    expect(processed.totalRows).toBe(6);
  });

  it('generates q1 + q2 + q2-hourly (3 questions for a datetime column)', () => {
    expect(processed.questions).toHaveLength(3);
  });

  it('normalises SI/NO correctly', () => {
    const q1 = processed.questions.find((q) => q.id === 'q1');
    expect(q1).toBeDefined();
    expect(q1!.frequencies['SI']).toBe(4);
    expect(q1!.frequencies['NO']).toBe(2);
  });

  it('formats date labels as dd/mm/yyyy in chronological order', () => {
    const q2 = processed.questions.find((q) => q.id === 'q2');
    expect(q2).toBeDefined();
    expect(Object.keys(q2!.frequencies)).toEqual(['15/02/2026', '16/02/2026', '17/02/2026']);
    expect(q2!.frequencies).toEqual({ '15/02/2026': 3, '16/02/2026': 2, '17/02/2026': 1 });
  });

  it('emits an hourly distribution page with correct bucket counts', () => {
    const hourly = processed.questions.find((q) => q.id === 'q2-hourly');
    expect(hourly).toBeDefined();
    expect(hourly!.total).toBe(6);
    expect(hourly!.frequencies).toEqual({
      '09:00 - 09:59': 3,
      '10:00 - 10:59': 1,
      '14:00 - 14:59': 2,
    });
  });
});

describe('processDataset — pure date column (no time component)', () => {
  it('does NOT add a synthetic hourly distribution when dates have no time', () => {
    const rows: Record<string, string>[] = [
      { A: '15/02/2026' },
      { A: '16/02/2026' },
      { A: '16/02/2026' },
    ];
    const analysis: AIAnalysis = {
      summary: '', dataType: '', funnel: null,
      questions: [{ id: 'q1', columnLetter: 'A', questionText: 'Fecha', chartType: 'bar', rationale: '', enabled: true }],
      tableRows: [], flowchartPages: [],
    };
    const processed = processDataset(rows, analysis);
    expect(processed.questions).toHaveLength(1);
    expect(processed.questions[0].id).toBe('q1');
  });
});

describe('resolver — question paths', () => {
  const rawRows: Record<string, string>[] = [
    { A: 'SI' }, { A: 'SI' }, { A: 'SI' }, { A: 'SI' }, { A: 'NO' }, { A: 'NO' },
  ];
  const analysis: AIAnalysis = {
    summary: '', dataType: '', funnel: null,
    questions: [
      { id: 'q1', columnLetter: 'A', questionText: '¿Ok?', chartType: 'pie', rationale: '', enabled: true },
    ],
    tableRows: [], flowchartPages: [],
  };
  const processed = processDataset(rawRows, analysis);

  it('resolves "total" when funnel is empty to totalRows', () => {
    expect(resolveSource('total', processed)).toBe(6);
  });

  it('resolves question.<id>.total', () => {
    expect(resolveSource('question.q1.total', processed)).toBe(6);
  });

  it('resolves question.<id>.breakdown.<value>', () => {
    expect(resolveSource('question.q1.breakdown.SI', processed)).toBe(4);
    expect(resolveSource('question.q1.breakdown.NO', processed)).toBe(2);
  });

  it('returns 0 for unknown question or breakdown', () => {
    expect(resolveSource('question.nonexistent.total', processed)).toBe(0);
    expect(resolveSource('question.q1.breakdown.MISSING', processed)).toBe(0);
  });

  it('handles percentages correctly', () => {
    expect(resolvePercent(4, 'question.q1.total', processed)).toBe('66,67%');
    expect(resolvePercent(5, 'question.nonexistent.total', processed)).toBe('0%');
  });

  it('keeps backward compatibility with bare FunnelData', () => {
    expect(resolveSource('total', processed.funnel)).toBe(6);
  });
});

describe('synthesizer fallbacks', () => {
  const rawRows: Record<string, string>[] = [
    { A: 'Madrid' }, { A: 'Madrid' }, { A: 'Barcelona' },
  ];
  const analysis: AIAnalysis = {
    summary: '', dataType: '', funnel: null,
    questions: [{ id: 'q1', columnLetter: 'A', questionText: 'Ciudad', chartType: 'pie', rationale: '', enabled: true }],
    tableRows: [], flowchartPages: [],
  };
  const processed = processDataset(rawRows, analysis);

  it('synthesises table rows from processed questions', () => {
    const rows = synthesizeTableRows(processed);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].label).toBe('Total registros');
    expect(rows[0].source).toBe('total');
    expect(rows.some((r) => r.source === 'question.q1.total')).toBe(true);
    expect(rows.some((r) => r.source === 'question.q1.breakdown.Madrid')).toBe(true);
  });

  it('synthesises one flowchart page per question with children', () => {
    const pages = synthesizeFlowchartPages(processed);
    expect(pages).toHaveLength(1);
    const root = pages[0].nodes[0];
    expect(root.label).toBe('TOTAL');
    expect(root.source).toBe('question.q1.total');
    expect(root.children?.length).toBe(pages[0].nodes.length - 1);
  });

  it('treats null/empty AI rows as "empty" and triggers the fallback', () => {
    expect(aiTableRowsAreEmpty([], processed)).toBe(true);
    expect(aiTableRowsAreEmpty(null, processed)).toBe(true);
    expect(aiFlowchartPagesAreEmpty([], processed)).toBe(true);
    expect(aiFlowchartPagesAreEmpty(null, processed)).toBe(true);
  });

  it('treats funnel-only rows as empty when the dataset has no funnel', () => {
    const funnelOnlyRows = [{ label: 'x', source: 'informed.total', level: 0 }];
    expect(aiTableRowsAreEmpty(funnelOnlyRows, processed)).toBe(true);
  });

  it('treats question-based rows as NOT empty', () => {
    const questionRows = [{ label: 'x', source: 'question.q1.total', level: 0 }];
    expect(aiTableRowsAreEmpty(questionRows, processed)).toBe(false);
  });

  it('treats funnel rows as NOT empty when the dataset HAS a funnel', () => {
    const withFunnel: ProcessedData = {
      totalRows: 10,
      funnel: {
        total: 10,
        notContacted: { total: 3, breakdown: {} },
        contactedNotInformed: { total: 2, breakdown: {} },
        informed: { total: 5, breakdown: {} },
        contacted: 7,
      },
      questions: [],
    };
    const funnelOnlyRows = [{ label: 'x', source: 'informed.total', level: 0 }];
    expect(aiTableRowsAreEmpty(funnelOnlyRows, withFunnel)).toBe(false);
  });
});
