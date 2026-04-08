/**
 * End-to-end smoke test: build a real charts report HTML from a minimal
 * dataset and run it through Puppeteer to verify the full pipeline works.
 */
import { processDataset } from '../lib/processing/processor';
import { generateChartsHTML } from '../lib/reports/charts-html';
import { generateTableHTML } from '../lib/reports/table-html';
import { generateFlowchartHTML } from '../lib/reports/flowchart-html';
import {
  synthesizeTableRows,
  synthesizeFlowchartPages,
  aiTableRowsAreEmpty,
  aiFlowchartPagesAreEmpty,
} from '../lib/processing/synthesizer';
import { DEFAULT_STYLE } from '../lib/ai/prompts';

// Chart renderer is browser-only (needs `document`). For this Node
// smoke test we use a 1x1 transparent PNG as a placeholder — we're
// testing HTML assembly, PDF pipeline, and data flow, not chart images.
const STUB_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
import { generatePdf } from '../lib/reports/pdf-generator';
import type { AIAnalysis } from '../types/database';
import { writeFileSync } from 'fs';

const rawRows = [
  { A: 'SI', B: '15/02/2026 09:00', C: 'Juan' },
  { A: 'NO', B: '15/02/2026 09:30', C: 'Ana' },
  { A: 'SI', B: '15/02/2026 14:15', C: 'Luis' },
  { A: 'SI', B: '16/02/2026 10:00', C: 'Marta' },
  { A: 'NO', B: '16/02/2026 14:45', C: 'Pedro' },
  { A: 'SI', B: '17/02/2026 09:20', C: 'Sara' },
  { A: 'SI', B: '17/02/2026 11:05', C: 'Raúl' },
  { A: 'NO', B: '17/02/2026 16:50', C: 'Eva' },
];

const analysis: AIAnalysis = {
  summary: 'Encuesta con 3 preguntas',
  dataType: 'encuesta',
  funnel: null,
  questions: [
    { id: 'q1', columnLetter: 'A', questionText: '¿Ha respondido?', chartType: 'pie', rationale: '', enabled: true },
    { id: 'q2', columnLetter: 'B', questionText: 'Fecha de respuesta', chartType: 'bar', rationale: '', enabled: true },
  ],
  tableRows: [], // deliberately empty to test fallback
  flowchartPages: [], // deliberately empty to test fallback
};

async function main() {
  console.log('[e2e] processing dataset...');
  const data = processDataset(rawRows, analysis);
  console.log(`[e2e]   → ${data.questions.length} processed questions (expected 3: q1, q2, q2-hourly)`);

  // ---------- Charts report ----------
  console.log('\n[e2e] building charts HTML...');
  const chartImages: Record<string, string> = {};
  for (const q of data.questions) chartImages[q.id] = STUB_IMAGE;
  const chartsHtml = generateChartsHTML({
    title: 'Test Edauto',
    period: 'FEBRERO 2026',
    clientName: 'Edauto Paterna',
    clientLogoBase64: null,
    emitterLogoBase64: null,
    data,
    style: DEFAULT_STYLE,
    chartImages,
  });
  writeFileSync('/tmp/e2e-charts.html', chartsHtml);
  console.log(`[e2e]   → ${chartsHtml.length} bytes HTML`);

  // Check the short-date labels are in the HTML
  const hasShortDates = chartsHtml.includes('15/02/2026') && chartsHtml.includes('16/02/2026');
  console.log(`[e2e]   short-date labels present: ${hasShortDates ? 'YES' : 'NO'}`);
  if (!hasShortDates) throw new Error('Short-date labels missing from charts HTML');

  // Check the hourly distribution page is there
  const hasHourly = chartsHtml.includes('Distribución horaria') && chartsHtml.includes('09:00 - 09:59');
  console.log(`[e2e]   hourly distribution page present: ${hasHourly ? 'YES' : 'NO'}`);
  if (!hasHourly) throw new Error('Hourly distribution page missing from charts HTML');

  // ---------- Table report ----------
  console.log('\n[e2e] building table HTML (with synthesized rows)...');
  const tableRows = aiTableRowsAreEmpty(analysis.tableRows, data)
    ? synthesizeTableRows(data)
    : analysis.tableRows;
  const tableHtml = generateTableHTML({
    title: 'Test Edauto',
    period: 'FEBRERO 2026',
    clientName: 'Edauto Paterna',
    clientLogoBase64: null,
    emitterLogoBase64: null,
    data,
    style: DEFAULT_STYLE,
    tableConfig: { rows: tableRows },
  });
  writeFileSync('/tmp/e2e-table.html', tableHtml);
  console.log(`[e2e]   → ${tableHtml.length} bytes HTML, ${tableRows.length} rows`);

  // Table should contain the question labels, not be empty
  const hasQuestionData = tableHtml.includes('¿Ha respondido?') && tableHtml.includes('SI');
  console.log(`[e2e]   question data in table: ${hasQuestionData ? 'YES' : 'NO'}`);
  if (!hasQuestionData) throw new Error('Question data missing from table HTML');

  // Without funnel, should use the alternative summary box
  const hasAltSummary = tableHtml.includes('Preguntas analizadas') || tableHtml.includes('Respuestas totales');
  console.log(`[e2e]   adaptive summary (no funnel): ${hasAltSummary ? 'YES' : 'NO'}`);
  if (!hasAltSummary) throw new Error('Adaptive summary box missing when no funnel');

  // ---------- Flowchart report ----------
  console.log('\n[e2e] building flowchart HTML (with synthesized pages)...');
  const pages = aiFlowchartPagesAreEmpty(analysis.flowchartPages, data)
    ? synthesizeFlowchartPages(data)
    : analysis.flowchartPages;
  const flowHtml = generateFlowchartHTML({
    title: 'Test Edauto',
    period: 'FEBRERO 2026',
    clientName: 'Edauto Paterna',
    clientLogoBase64: null,
    emitterLogoBase64: null,
    data,
    style: DEFAULT_STYLE,
    flowchartPages: pages,
  });
  writeFileSync('/tmp/e2e-flow.html', flowHtml);
  console.log(`[e2e]   → ${flowHtml.length} bytes HTML, ${pages.length} pages`);

  const hasFlowData = flowHtml.includes('¿Ha respondido?') || flowHtml.includes('Fecha de respuesta');
  console.log(`[e2e]   question data in flowchart: ${hasFlowData ? 'YES' : 'NO'}`);
  if (!hasFlowData) throw new Error('Question data missing from flowchart HTML');

  // ---------- Generate PDFs ----------
  console.log('\n[e2e] generating PDF for each report type...');
  for (const [label, html] of [
    ['charts', chartsHtml],
    ['table', tableHtml],
    ['flow', flowHtml],
  ] as const) {
    const buf = await generatePdf(html);
    writeFileSync(`/tmp/e2e-${label}.pdf`, buf);
    const header = buf.slice(0, 5).toString('ascii');
    const ok = header === '%PDF-' && buf.length > 1000;
    console.log(`[e2e]   ${label}: ${buf.length} bytes, header=${JSON.stringify(header)} → ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) throw new Error(`PDF generation failed for ${label}`);
  }

  console.log('\n[e2e] All checks passed.');
}

main().catch((err) => {
  console.error('\n[e2e] FAIL —', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
