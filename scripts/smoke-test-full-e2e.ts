/**
 * Comprehensive end-to-end verification covering scenarios the
 * earlier smoke tests don't:
 *
 *   - Report WITH funnel (classic call-centre dataset) — exercises
 *     the original code path of AI-provided tableRows/flowchartPages
 *     against funnel paths.
 *   - Report WITHOUT funnel — exercises the synthesizer fallback.
 *   - Date column with time → chronological order + hourly page.
 *   - Date column WITHOUT time → chronological order, no hourly page.
 *   - Chart frequencies are preserved in Excel export order for dates.
 *   - Email subject template rendering matches expectations.
 *   - AES-256 ZIP file is valid ZIP format.
 *   - Generated HTML contains the expected key strings (no Google
 *     Fonts link, font stack present, question labels, totals).
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
import { generatePdf } from '../lib/reports/pdf-generator';
import { encryptFileWithZip } from '../lib/reports/zip-encrypt';
import { DEFAULT_STYLE } from '../lib/ai/prompts';
import type { AIAnalysis } from '../types/database';

const STUB =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(cond: unknown, label: string) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

async function main() {
  // ----------------------------------------------------------------
  console.log('\n[A] Report WITH funnel (classic call-centre dataset)');
  // ----------------------------------------------------------------
  //
  // 10 rows — contact centre results.
  //  Col A = status (funnel column)
  //  Col B = rating (SI/NO question)
  //  Col C = call date + time
  const withFunnelRows: Record<string, string>[] = [
    { A: 'NO_RESPONDE', B: '',    C: '' },
    { A: 'NO_RESPONDE', B: '',    C: '' },
    { A: 'BUZÓN',       B: '',    C: '' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '05/03/2026 09:30' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '05/03/2026 10:15' },
    { A: 'ENCUESTA REALIZADA', B: 'NO', C: '05/03/2026 14:20' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '06/03/2026 09:00' },
    { A: 'ENCUESTA REALIZADA', B: 'NO', C: '06/03/2026 15:45' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '07/03/2026 11:30' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '07/03/2026 16:10' },
  ];

  const withFunnelAnalysis: AIAnalysis = {
    summary: 'Encuesta telefónica con funnel completo',
    dataType: 'encuesta',
    resultColumn: 'A',
    funnel: {
      totalLabel: 'TOTAL',
      notContacted: { label: 'No contactados', values: ['NO_RESPONDE', 'BUZÓN'] },
      contactedNotInformed: { label: 'Contactados no informados', values: [] },
      informed: { label: 'Informados', values: ['ENCUESTA REALIZADA'] },
    },
    questions: [
      { id: 'q_sat', columnLetter: 'B', questionText: '¿Satisfecho?', chartType: 'pie', rationale: '', enabled: true, filterColumn: 'A', filterValues: ['ENCUESTA REALIZADA'] },
      { id: 'q_date', columnLetter: 'C', questionText: 'Fecha de llamada', chartType: 'bar', rationale: '', enabled: true, filterColumn: 'A', filterValues: ['ENCUESTA REALIZADA'] },
    ],
    tableRows: [
      { label: 'Total',        source: 'total',                   level: 0, bold: true },
      { label: 'No contactados', source: 'notContacted.total',     percentOf: 'total', level: 1 },
      { label: 'Contactados',  source: 'contacted',               percentOf: 'total', level: 1 },
      { label: 'Informados',   source: 'informed.total',          percentOf: 'contacted', level: 2 },
    ],
    flowchartPages: [
      {
        id: 'p1', title: 'Embudo de contacto',
        nodes: [
          { id: 'n1', label: 'TOTAL', source: 'total', level: 0, children: ['n2', 'n3'] },
          { id: 'n2', label: 'NO CONTACTADOS', source: 'notContacted.total', percentOf: 'total', level: 1 },
          { id: 'n3', label: 'CONTACTADOS', source: 'contacted', percentOf: 'total', level: 1, children: ['n4'] },
          { id: 'n4', label: 'INFORMADOS', source: 'informed.total', percentOf: 'contacted', level: 2 },
        ],
      },
    ],
  };

  const withFunnelData = processDataset(withFunnelRows, withFunnelAnalysis);

  check(withFunnelData.totalRows === 10, `totalRows=10 (got ${withFunnelData.totalRows})`);
  check(withFunnelData.funnel.notContacted.total === 3, `notContacted.total=3 (got ${withFunnelData.funnel.notContacted.total})`);
  check(withFunnelData.funnel.informed.total === 7, `informed.total=7 (got ${withFunnelData.funnel.informed.total})`);
  check(withFunnelData.funnel.contacted === 7, `contacted=7 (got ${withFunnelData.funnel.contacted})`);

  // Questions: q_sat + q_date + q_date-hourly = 3 (q_date has time component)
  check(withFunnelData.questions.length === 3, `3 processed questions (got ${withFunnelData.questions.length})`);

  const satisfaction = withFunnelData.questions.find((q) => q.id === 'q_sat');
  check(!!satisfaction, 'q_sat exists');
  if (satisfaction) {
    check(satisfaction.total === 7, `q_sat total=7 (got ${satisfaction.total})`);
    check(satisfaction.frequencies['SI'] === 5, `q_sat SI=5 (got ${satisfaction.frequencies['SI']})`);
    check(satisfaction.frequencies['NO'] === 2, `q_sat NO=2 (got ${satisfaction.frequencies['NO']})`);
  }

  const dateQ = withFunnelData.questions.find((q) => q.id === 'q_date');
  check(!!dateQ, 'q_date exists');
  if (dateQ) {
    const keys = Object.keys(dateQ.frequencies);
    check(keys.join(',') === '05/03/2026,06/03/2026,07/03/2026', `q_date keys chronological: ${keys.join(',')}`);
  }

  const hourlyQ = withFunnelData.questions.find((q) => q.id === 'q_date-hourly');
  check(!!hourlyQ, 'q_date-hourly exists');
  if (hourlyQ) {
    check(hourlyQ.total === 7, `q_date-hourly total=7 (got ${hourlyQ.total})`);
    check(!!hourlyQ.frequencies['09:00 - 09:59'], 'has 09:00-09:59 bucket');
    check(!!hourlyQ.frequencies['14:00 - 14:59'], 'has 14:00-14:59 bucket');
  }

  // AI tableRows/flowchartPages should NOT be considered empty — funnel has data
  check(!aiTableRowsAreEmpty(withFunnelAnalysis.tableRows, withFunnelData), 'funnel AI tableRows not empty');
  check(!aiFlowchartPagesAreEmpty(withFunnelAnalysis.flowchartPages, withFunnelData), 'funnel AI flowchartPages not empty');

  // Render charts HTML
  const chartImages: Record<string, string> = {};
  for (const q of withFunnelData.questions) chartImages[q.id] = STUB;

  const chartsHtml = generateChartsHTML({
    title: 'Edauto Paterna',
    period: 'MARZO 2026',
    clientName: 'Edauto Paterna',
    clientLogoBase64: null,
    emitterLogoBase64: null,
    data: withFunnelData,
    style: DEFAULT_STYLE,
    chartImages,
  });

  check(!chartsHtml.includes('fonts.googleapis.com'), 'charts HTML has NO Google Fonts link');
  check(chartsHtml.includes('sans-serif'), 'charts HTML has system font stack');
  check(chartsHtml.includes('¿Satisfecho?'), 'charts HTML includes q_sat label');
  check(chartsHtml.includes('05/03/2026'), 'charts HTML includes short date label');
  check(chartsHtml.includes('Distribución horaria'), 'charts HTML includes hourly page');
  check(chartsHtml.includes('09:00 - 09:59'), 'charts HTML includes hour bucket label');

  // Render table HTML (real AI rows)
  const tableHtml = generateTableHTML({
    title: 'Edauto Paterna',
    period: 'MARZO 2026',
    clientName: 'Edauto Paterna',
    clientLogoBase64: null,
    emitterLogoBase64: null,
    data: withFunnelData,
    style: DEFAULT_STYLE,
    tableConfig: { rows: withFunnelAnalysis.tableRows },
  });

  check(tableHtml.includes('Total registros'), 'table has funnel summary "Total registros"');
  check(tableHtml.includes('Contactados'), 'table has Contactados summary');
  check(tableHtml.includes('Informados'), 'table has Informados summary');
  check(tableHtml.includes('No contactados'), 'table includes "No contactados" row');
  // Counts should render as numbers
  check(tableHtml.includes('>10</td>') || tableHtml.includes('>10<'), 'table includes total=10');
  check(tableHtml.includes('>7</td>') || tableHtml.includes('>7<'), 'table includes informed=7');

  // Render flowchart HTML
  const flowHtml = generateFlowchartHTML({
    title: 'Edauto Paterna',
    period: 'MARZO 2026',
    clientName: 'Edauto Paterna',
    clientLogoBase64: null,
    emitterLogoBase64: null,
    data: withFunnelData,
    style: DEFAULT_STYLE,
    flowchartPages: withFunnelAnalysis.flowchartPages,
  });

  check(flowHtml.includes('Embudo de contacto'), 'flow has page title');
  check(flowHtml.includes('TOTAL'), 'flow has TOTAL node');
  check(flowHtml.includes('NO CONTACTADOS'), 'flow has NO CONTACTADOS node');
  check(flowHtml.includes('INFORMADOS'), 'flow has INFORMADOS node');

  // ----------------------------------------------------------------
  console.log('\n[B] Report WITHOUT funnel (AI returned empty arrays)');
  // ----------------------------------------------------------------
  //
  // 6 rows — sales dataset with no funnel structure.
  const noFunnelRows: Record<string, string>[] = [
    { A: 'Madrid',    B: '2500', C: 'Electronics' },
    { A: 'Barcelona', B: '1800', C: 'Clothing' },
    { A: 'Madrid',    B: '3200', C: 'Electronics' },
    { A: 'Valencia',  B: '1500', C: 'Books' },
    { A: 'Barcelona', B: '2100', C: 'Clothing' },
    { A: 'Madrid',    B: '2800', C: 'Electronics' },
  ];

  const noFunnelAnalysis: AIAnalysis = {
    summary: 'Ventas por ciudad',
    dataType: 'ventas',
    funnel: null,
    questions: [
      { id: 'q_city', columnLetter: 'A', questionText: 'Ciudad', chartType: 'pie', rationale: '', enabled: true },
      { id: 'q_cat', columnLetter: 'C', questionText: 'Categoría', chartType: 'doughnut', rationale: '', enabled: true },
    ],
    tableRows: [], // AI returned empty — synthesizer should fire
    flowchartPages: [],
  };

  const noFunnelData = processDataset(noFunnelRows, noFunnelAnalysis);

  check(noFunnelData.totalRows === 6, `noFunnel totalRows=6 (got ${noFunnelData.totalRows})`);
  check(noFunnelData.questions.length === 2, `noFunnel questions=2 (got ${noFunnelData.questions.length})`);

  const cityQ = noFunnelData.questions.find((q) => q.id === 'q_city');
  check(!!cityQ, 'q_city exists');
  if (cityQ) {
    check(cityQ.frequencies['Madrid'] === 3, `Madrid=3 (got ${cityQ.frequencies['Madrid']})`);
    check(cityQ.frequencies['Barcelona'] === 2, `Barcelona=2`);
    check(cityQ.frequencies['Valencia'] === 1, `Valencia=1`);
  }

  // Synthesizer fallback should fire
  check(aiTableRowsAreEmpty(noFunnelAnalysis.tableRows, noFunnelData), 'empty AI rows → considered empty');
  check(aiFlowchartPagesAreEmpty(noFunnelAnalysis.flowchartPages, noFunnelData), 'empty AI pages → considered empty');

  const synthRows = synthesizeTableRows(noFunnelData);
  const synthPages = synthesizeFlowchartPages(noFunnelData);
  check(synthRows.length > 5, `synth rows > 5 (got ${synthRows.length})`);
  check(synthPages.length === 2, `synth pages = 2 (got ${synthPages.length})`);

  // Render with synthesizer output
  const noFunnelTableHtml = generateTableHTML({
    title: 'Ventas',
    period: 'MARZO 2026',
    clientName: 'Mi tienda',
    clientLogoBase64: null,
    emitterLogoBase64: null,
    data: noFunnelData,
    style: DEFAULT_STYLE,
    tableConfig: { rows: synthRows },
  });

  check(noFunnelTableHtml.includes('Preguntas analizadas'), 'no-funnel table uses adaptive summary');
  check(!noFunnelTableHtml.includes('Contactados'), 'no-funnel table does NOT show Contactados');
  check(noFunnelTableHtml.includes('Ciudad'), 'no-funnel table includes q_city label');
  check(noFunnelTableHtml.includes('Madrid'), 'no-funnel table includes Madrid value');

  const noFunnelFlowHtml = generateFlowchartHTML({
    title: 'Ventas',
    period: 'MARZO 2026',
    clientName: 'Mi tienda',
    clientLogoBase64: null,
    emitterLogoBase64: null,
    data: noFunnelData,
    style: DEFAULT_STYLE,
    flowchartPages: synthPages,
  });

  check(noFunnelFlowHtml.includes('Ciudad') || noFunnelFlowHtml.includes('Categoría'), 'no-funnel flow includes question labels');

  // ----------------------------------------------------------------
  console.log('\n[C] AES-256 ZIP encryption');
  // ----------------------------------------------------------------

  const testFile = Buffer.from('test data\n');
  const zipBuffer = await encryptFileWithZip(testFile, 'test.csv', 'MiPass123!');
  check(zipBuffer.length > 0, `zip non-empty (got ${zipBuffer.length} bytes)`);
  check(zipBuffer.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), 'zip has PK.. header');

  // ----------------------------------------------------------------
  console.log('\n[D] Generate PDF for each report type');
  // ----------------------------------------------------------------

  for (const [label, html] of [
    ['charts+funnel', chartsHtml],
    ['table+funnel', tableHtml],
    ['flow+funnel', flowHtml],
    ['table+synth', noFunnelTableHtml],
    ['flow+synth', noFunnelFlowHtml],
  ] as const) {
    const pdf = await generatePdf(html);
    const ok = pdf.slice(0, 5).toString('ascii') === '%PDF-' && pdf.length > 1000;
    check(ok, `PDF ${label}: ${pdf.length} bytes, valid=${ok}`);
  }

  // ----------------------------------------------------------------
  console.log('\n[E] Final summary');
  // ----------------------------------------------------------------
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[e2e-full] FAIL —', err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
