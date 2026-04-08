/**
 * Ad-hoc smoke tests for the business logic changes.
 * Run with: npx tsx scripts/smoke-test.ts
 */
import {
  parseDateTime,
  formatShortDate,
  hourBucketLabel,
  analyzeDateColumn,
} from '../lib/processing/date-utils';
import { processDataset } from '../lib/processing/processor';
import { resolveSource, resolvePercent } from '../lib/processing/resolver';
import {
  synthesizeTableRows,
  synthesizeFlowchartPages,
  aiTableRowsAreEmpty,
  aiFlowchartPagesAreEmpty,
} from '../lib/processing/synthesizer';
import type { AIAnalysis, ProcessedData } from '../types/database';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function assert(cond: unknown, label: string) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function eq<T>(actual: T, expected: T, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`);
  }
}

// ============================================================================
console.log('\n[1] parseDateTime');
// ============================================================================

const d1 = parseDateTime('15/02/2026');
assert(d1 !== null && d1.date.getDate() === 15 && d1.date.getMonth() === 1 && d1.date.getFullYear() === 2026 && !d1.hasTime, 'dd/mm/yyyy without time');

const d2 = parseDateTime('15/02/2026 14:30');
assert(d2 !== null && d2.date.getHours() === 14 && d2.date.getMinutes() === 30 && d2.hasTime, 'dd/mm/yyyy with hh:mm');

const d3 = parseDateTime('15/02/2026 14:30:45');
assert(d3 !== null && d3.date.getSeconds() === 45 && d3.hasTime, 'dd/mm/yyyy with hh:mm:ss');

const d4 = parseDateTime('2026-02-15');
assert(d4 !== null && d4.date.getDate() === 15 && d4.date.getMonth() === 1 && !d4.hasTime, 'ISO yyyy-mm-dd');

const d5 = parseDateTime('2026-02-15T14:30:00');
assert(d5 !== null && d5.date.getHours() === 14 && d5.hasTime, 'ISO yyyy-mm-dd with time');

const d6 = parseDateTime('2026-02-15 09:15');
assert(d6 !== null && d6.date.getHours() === 9 && d6.hasTime, 'ISO yyyy-mm-dd with space time');

// Excel serial: 2026-02-15 should be ~46068
const d7 = parseDateTime('46068');
assert(d7 !== null && d7.date.getFullYear() === 2026 && d7.date.getMonth() === 1, `Excel serial date 46068 → ${d7 ? formatShortDate(d7.date) : 'null'}`);

// Excel serial with time fraction
const d8 = parseDateTime('46068.5');
assert(d8 !== null && d8.hasTime, 'Excel serial with fractional time');

assert(parseDateTime('') === null, 'empty string → null');
assert(parseDateTime('hola') === null, 'non-date string → null');
assert(parseDateTime('7') === null, 'small integer → null (not Excel serial)');
assert(parseDateTime('32/13/2026') === null, 'invalid day/month → null');

// ============================================================================
console.log('\n[2] formatShortDate & hourBucketLabel');
// ============================================================================

eq(formatShortDate(new Date(2026, 1, 5)), '05/02/2026', 'formatShortDate pads zero');
eq(formatShortDate(new Date(2026, 11, 31)), '31/12/2026', 'formatShortDate December');
eq(hourBucketLabel(0), '00:00 - 00:59', 'hour bucket 0');
eq(hourBucketLabel(14), '14:00 - 14:59', 'hour bucket 14');
eq(hourBucketLabel(23), '23:00 - 23:59', 'hour bucket 23');

// ============================================================================
console.log('\n[3] analyzeDateColumn');
// ============================================================================

const info1 = analyzeDateColumn(['15/02/2026', '16/02/2026 14:30', '17/02/2026', '']);
assert(info1.isDate && info1.hasAnyTime, 'mixed date column with one time → isDate & hasAnyTime');

const info2 = analyzeDateColumn(['SI', 'NO', 'SI', 'NO']);
assert(!info2.isDate, 'SI/NO column not date');

const info3 = analyzeDateColumn(['15/02/2026', '16/02/2026', '17/02/2026']);
assert(info3.isDate && !info3.hasAnyTime, 'pure date column no time');

// ============================================================================
console.log('\n[4] processDataset — date column formatting + hourly distribution');
// ============================================================================

const rawRows = [
  { A: 'SI', B: '15/02/2026 09:00', C: 'Juan' },
  { A: 'NO', B: '15/02/2026 09:30', C: 'Ana' },
  { A: 'SI', B: '15/02/2026 14:15', C: 'Luis' },
  { A: 'SI', B: '16/02/2026 10:00', C: 'Marta' },
  { A: 'NO', B: '16/02/2026 14:45', C: 'Pedro' },
  { A: 'SI', B: '17/02/2026 09:20', C: 'Sara' },
];

const analysis: AIAnalysis = {
  summary: 'Test',
  dataType: 'encuesta',
  resultColumn: undefined,
  funnel: null,
  questions: [
    {
      id: 'q1',
      columnLetter: 'A',
      questionText: '¿Ha respondido?',
      chartType: 'pie',
      rationale: '',
      enabled: true,
    },
    {
      id: 'q2',
      columnLetter: 'B',
      questionText: 'Fecha de respuesta',
      chartType: 'bar',
      rationale: '',
      enabled: true,
    },
  ],
  tableRows: [],
  flowchartPages: [],
};

const processed = processDataset(rawRows, analysis);

assert(processed.totalRows === 6, 'totalRows = 6');
assert(processed.questions.length === 3, `expected 3 questions (q1 + q2 date + q2-hourly), got ${processed.questions.length}`);

const q1 = processed.questions.find((q) => q.id === 'q1');
assert(q1 !== undefined && q1.frequencies['SI'] === 4 && q1.frequencies['NO'] === 2, 'q1 SI/NO counts correct');

const q2 = processed.questions.find((q) => q.id === 'q2');
assert(q2 !== undefined, 'q2 (date) exists');
if (q2) {
  eq(Object.keys(q2.frequencies), ['15/02/2026', '16/02/2026', '17/02/2026'], 'q2 dates formatted as dd/mm/yyyy and sorted chronologically');
  eq(q2.frequencies, { '15/02/2026': 3, '16/02/2026': 2, '17/02/2026': 1 }, 'q2 date counts correct');
}

const q2h = processed.questions.find((q) => q.id === 'q2-hourly');
assert(q2h !== undefined, 'q2-hourly exists (generated because column had time)');
if (q2h) {
  assert(q2h.total === 6, `q2-hourly total = 6, got ${q2h.total}`);
  // 9:00, 9:30 → 09; 14:15 → 14; 10:00 → 10; 14:45 → 14; 9:20 → 09
  // buckets: 09 = 3, 10 = 1, 14 = 2
  eq(q2h.frequencies, { '09:00 - 09:59': 3, '10:00 - 10:59': 1, '14:00 - 14:59': 2 }, 'q2-hourly buckets correct');
}

// ============================================================================
console.log('\n[5] processDataset — pure date column (no time) should NOT add hourly page');
// ============================================================================

const rawRows2 = [
  { A: '15/02/2026' },
  { A: '16/02/2026' },
  { A: '16/02/2026' },
];

const analysis2: AIAnalysis = {
  summary: '', dataType: '', funnel: null,
  questions: [{ id: 'q1', columnLetter: 'A', questionText: 'Fecha', chartType: 'bar', rationale: '', enabled: true }],
  tableRows: [], flowchartPages: [],
};

const processed2 = processDataset(rawRows2, analysis2);
assert(processed2.questions.length === 1, `pure dates → 1 question, got ${processed2.questions.length}`);
assert(processed2.questions[0].id === 'q1', 'no -hourly variant generated');

// ============================================================================
console.log('\n[6] resolver — question paths');
// ============================================================================

eq(resolveSource('total', processed), 6, 'total resolves to totalRows=6 when funnel empty');
eq(resolveSource('question.q1.total', processed), 6, 'question.q1.total');
eq(resolveSource('question.q1.breakdown.SI', processed), 4, 'question.q1.breakdown.SI');
eq(resolveSource('question.q1.breakdown.NO', processed), 2, 'question.q1.breakdown.NO');
eq(resolveSource('question.q2.breakdown.15/02/2026', processed), 3, 'question.q2 date breakdown (label has dots)');
eq(resolveSource('question.nonexistent.total', processed), 0, 'nonexistent question → 0');
eq(resolveSource('question.q1.breakdown.MISSING', processed), 0, 'missing breakdown key → 0');

// Percent
eq(resolvePercent(4, 'question.q1.total', processed), '66,67%', 'percent 4/6 → 66,67%');
eq(resolvePercent(0, 'total', processed), '0,00%', 'zero value → 0,00%');
eq(resolvePercent(5, 'question.nonexistent.total', processed), '0%', 'percent of nonexistent ref → 0%');

// Backwards compatibility with bare FunnelData
eq(resolveSource('total', processed.funnel), 6, 'resolver still works with bare FunnelData');

// ============================================================================
console.log('\n[7] synthesizer — fallback table rows & flowchart pages');
// ============================================================================

const rows = synthesizeTableRows(processed);
assert(rows.length > 0, 'synthesizeTableRows produces rows');
assert(rows[0].label === 'Total registros' && rows[0].source === 'total', 'first row is Total registros');
assert(rows.some((r) => r.source === 'question.q1.total'), 'contains question.q1.total row');
assert(rows.some((r) => r.source === 'question.q1.breakdown.SI'), 'contains question.q1 breakdown row');

// Verify every synthesized row resolves to > 0 against our processed data
const allResolve = rows.every((r) => {
  const v = resolveSource(r.source, processed);
  return v >= 0; // allow 0 but they must not error
});
assert(allResolve, 'all synthesized rows resolve without error');

const pages = synthesizeFlowchartPages(processed);
assert(pages.length === 3, `synthesizeFlowchartPages: 3 pages (one per question), got ${pages.length}`);
assert(pages[0].nodes[0].label === 'TOTAL' && pages[0].nodes[0].source.startsWith('question.'), 'flowchart root node sources a question');
// Root node should have children referencing actual breakdown values
const rootNode = pages[0].nodes[0];
const childrenNodes = pages[0].nodes.slice(1);
assert(rootNode.children && rootNode.children.length === childrenNodes.length, 'flowchart root children match child nodes');

// ============================================================================
console.log('\n[8] synthesizer emptiness detection');
// ============================================================================

assert(aiTableRowsAreEmpty([], processed), 'empty array → empty');
assert(aiTableRowsAreEmpty(null, processed), 'null → empty');

// Rows that only reference funnel paths when no funnel exists → considered empty
const funnelOnlyRows = [{ label: 'x', source: 'informed.total', level: 0 }];
assert(aiTableRowsAreEmpty(funnelOnlyRows, processed), 'funnel-only rows with no funnel → empty');

// Rows that reference question paths are usable
const questionRows = [{ label: 'x', source: 'question.q1.total', level: 0 }];
assert(!aiTableRowsAreEmpty(questionRows, processed), 'question-based rows → not empty');

// If there IS a funnel, funnel-only rows are usable
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
assert(!aiTableRowsAreEmpty(funnelOnlyRows, withFunnel), 'funnel rows WITH funnel → not empty');

// Flowchart emptiness
assert(aiFlowchartPagesAreEmpty([], processed), 'empty pages → empty');
assert(aiFlowchartPagesAreEmpty(null, processed), 'null pages → empty');

const usefulPages = [{ id: 'p1', title: 'x', nodes: [{ id: 'n1', label: 'T', source: 'question.q1.total', level: 0 }] }];
assert(!aiFlowchartPagesAreEmpty(usefulPages, processed), 'useful flowchart page → not empty');

// ============================================================================
console.log('\n[9] Final summary');
// ============================================================================
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
