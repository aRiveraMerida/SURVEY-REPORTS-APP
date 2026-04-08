/**
 * End-to-end PDF generation via Puppeteer. These tests actually
 * launch Chromium and render HTML, so they're slow (~5-10s each)
 * — but they're the only way to catch issues like missing fonts,
 * @sparticuz/chromium vs full puppeteer fallback, or HTML that
 * parses in the browser differently than in Node.
 */
import { describe, it, expect } from 'vitest';
import { generatePdf } from '@/lib/reports/pdf-generator';
import { processDataset } from '@/lib/processing/processor';
import { generateChartsHTML } from '@/lib/reports/charts-html';
import { generateTableHTML } from '@/lib/reports/table-html';
import { generateFlowchartHTML } from '@/lib/reports/flowchart-html';
import {
  synthesizeTableRows,
  synthesizeFlowchartPages,
  aiTableRowsAreEmpty,
  aiFlowchartPagesAreEmpty,
} from '@/lib/processing/synthesizer';
import { DEFAULT_STYLE } from '@/lib/ai/prompts';
import type { AIAnalysis } from '@/types/database';

// Chart rendering is browser-only; a 1x1 transparent PNG stand-in
// is all we need for tests that verify the PDF pipeline, not the
// visual chart content.
const STUB_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

function assertValidPdf(buf: Buffer, minBytes = 1000) {
  expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  expect(buf.slice(-6).toString('ascii')).toContain('%%EOF');
  expect(buf.length).toBeGreaterThan(minBytes);
}

describe('generatePdf — minimal HTML', () => {
  it('renders a small HTML page to a valid PDF', async () => {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Test</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    body { font-family: sans-serif; padding: 40px; background: #53860F; color: white; }
  </style>
</head>
<body>
  <h1>Informe de prueba</h1>
  <p>15/02/2026 14:30</p>
</body>
</html>`;
    const buf = await generatePdf(html);
    assertValidPdf(buf);
  });
});

describe('generatePdf — full report pipeline (with funnel)', () => {
  const rawRows: Record<string, string>[] = [
    { A: 'NO_RESPONDE', B: '', C: '' },
    { A: 'NO_RESPONDE', B: '', C: '' },
    { A: 'BUZÓN', B: '', C: '' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '05/03/2026 09:30' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '05/03/2026 10:15' },
    { A: 'ENCUESTA REALIZADA', B: 'NO', C: '05/03/2026 14:20' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '06/03/2026 09:00' },
    { A: 'ENCUESTA REALIZADA', B: 'NO', C: '06/03/2026 15:45' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '07/03/2026 11:30' },
    { A: 'ENCUESTA REALIZADA', B: 'SI', C: '07/03/2026 16:10' },
  ];

  const analysis: AIAnalysis = {
    summary: 'Call centre survey with funnel',
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
      { label: 'Total', source: 'total', level: 0, bold: true },
      { label: 'No contactados', source: 'notContacted.total', percentOf: 'total', level: 1 },
      { label: 'Contactados', source: 'contacted', percentOf: 'total', level: 1 },
      { label: 'Informados', source: 'informed.total', percentOf: 'contacted', level: 2 },
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

  const data = processDataset(rawRows, analysis);
  const chartImages: Record<string, string> = {};
  for (const q of data.questions) chartImages[q.id] = STUB_IMAGE;

  it('processes funnel + generates 3 questions (q_sat, q_date, q_date-hourly)', () => {
    expect(data.funnel.notContacted.total).toBe(3);
    expect(data.funnel.informed.total).toBe(7);
    expect(data.funnel.contacted).toBe(7);
    expect(data.questions).toHaveLength(3);
  });

  it('generates a valid charts PDF that contains short dates and hourly page', async () => {
    const html = generateChartsHTML({
      title: 'Edauto Paterna',
      period: 'MARZO 2026',
      clientName: 'Edauto Paterna',
      clientLogoBase64: null,
      emitterLogoBase64: null,
      data,
      style: DEFAULT_STYLE,
      chartImages,
    });
    // HTML assertions
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).toContain('sans-serif');
    expect(html).toContain('¿Satisfecho?');
    expect(html).toContain('05/03/2026');
    expect(html).toContain('Distribución horaria');
    expect(html).toContain('09:00 - 09:59');
    // Actual PDF
    const pdf = await generatePdf(html);
    assertValidPdf(pdf, 10_000);
  });

  it('generates a valid table PDF with funnel summary', async () => {
    const html = generateTableHTML({
      title: 'Edauto Paterna',
      period: 'MARZO 2026',
      clientName: 'Edauto Paterna',
      clientLogoBase64: null,
      emitterLogoBase64: null,
      data,
      style: DEFAULT_STYLE,
      tableConfig: { rows: analysis.tableRows },
    });
    expect(html).toContain('Total registros');
    expect(html).toContain('Contactados');
    expect(html).toContain('Informados');
    expect(html).toContain('No contactados');
    const pdf = await generatePdf(html);
    assertValidPdf(pdf, 10_000);
  });

  it('generates a valid flowchart PDF', async () => {
    const html = generateFlowchartHTML({
      title: 'Edauto Paterna',
      period: 'MARZO 2026',
      clientName: 'Edauto Paterna',
      clientLogoBase64: null,
      emitterLogoBase64: null,
      data,
      style: DEFAULT_STYLE,
      flowchartPages: analysis.flowchartPages,
    });
    expect(html).toContain('Embudo de contacto');
    expect(html).toContain('TOTAL');
    expect(html).toContain('NO CONTACTADOS');
    expect(html).toContain('INFORMADOS');
    const pdf = await generatePdf(html);
    assertValidPdf(pdf, 10_000);
  });
});

describe('generatePdf — full report pipeline (NO funnel, synthesizer fallback)', () => {
  const rawRows: Record<string, string>[] = [
    { A: 'Madrid', B: '2500', C: 'Electronics' },
    { A: 'Barcelona', B: '1800', C: 'Clothing' },
    { A: 'Madrid', B: '3200', C: 'Electronics' },
    { A: 'Valencia', B: '1500', C: 'Books' },
    { A: 'Barcelona', B: '2100', C: 'Clothing' },
    { A: 'Madrid', B: '2800', C: 'Electronics' },
  ];

  const analysis: AIAnalysis = {
    summary: 'Ventas por ciudad',
    dataType: 'ventas',
    funnel: null,
    questions: [
      { id: 'q_city', columnLetter: 'A', questionText: 'Ciudad', chartType: 'pie', rationale: '', enabled: true },
      { id: 'q_cat', columnLetter: 'C', questionText: 'Categoría', chartType: 'doughnut', rationale: '', enabled: true },
    ],
    tableRows: [], // empty → synthesizer fires
    flowchartPages: [],
  };

  const data = processDataset(rawRows, analysis);

  it('synthesizer produces usable rows and pages', () => {
    expect(aiTableRowsAreEmpty(analysis.tableRows, data)).toBe(true);
    expect(aiFlowchartPagesAreEmpty(analysis.flowchartPages, data)).toBe(true);
    const rows = synthesizeTableRows(data);
    const pages = synthesizeFlowchartPages(data);
    expect(rows.length).toBeGreaterThan(5);
    expect(pages).toHaveLength(2);
  });

  it('table PDF uses adaptive summary (no Contactados box)', async () => {
    const html = generateTableHTML({
      title: 'Ventas',
      period: 'MARZO 2026',
      clientName: 'Mi tienda',
      clientLogoBase64: null,
      emitterLogoBase64: null,
      data,
      style: DEFAULT_STYLE,
      tableConfig: { rows: synthesizeTableRows(data) },
    });
    expect(html).toContain('Preguntas analizadas');
    expect(html).not.toContain('Contactados');
    expect(html).toContain('Ciudad');
    expect(html).toContain('Madrid');
    const pdf = await generatePdf(html);
    assertValidPdf(pdf, 10_000);
  });

  it('flowchart PDF contains synthesised question nodes', async () => {
    const html = generateFlowchartHTML({
      title: 'Ventas',
      period: 'MARZO 2026',
      clientName: 'Mi tienda',
      clientLogoBase64: null,
      emitterLogoBase64: null,
      data,
      style: DEFAULT_STYLE,
      flowchartPages: synthesizeFlowchartPages(data),
    });
    expect(html.includes('Ciudad') || html.includes('Categoría')).toBe(true);
    const pdf = await generatePdf(html);
    assertValidPdf(pdf, 10_000);
  });
});
