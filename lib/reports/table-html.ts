import type { ProcessedData, ReportStyle, AITableRow, FunnelData } from '@/types/database';
import { buildCoverCSS, buildCoverHTML, esc } from './charts-html';

interface TableConfig {
  rows: AITableRow[];
}
import { resolveSource, resolvePercent } from '@/lib/processing/resolver';

/** True when the funnel actually contains classified data. */
function hasFunnel(funnel: FunnelData): boolean {
  return (
    funnel.contacted > 0 ||
    funnel.informed.total > 0 ||
    funnel.notContacted.total > 0 ||
    funnel.contactedNotInformed.total > 0
  );
}

interface GenerateTableOptions {
  title: string;
  period: string;
  clientName: string;
  clientLogoBase64: string | null;
  emitterLogoBase64: string | null;
  data: ProcessedData;
  style: ReportStyle;
  tableConfig: TableConfig;
}

export function generateTableHTML(opts: GenerateTableOptions): string {
  const { title, period, clientName, clientLogoBase64, emitterLogoBase64, data, style, tableConfig } = opts;

  const pageW = style.orientation === 'landscape' ? '297mm' : '210mm';
  const pageH = style.orientation === 'landscape' ? '210mm' : '297mm';

  const clientLogo = clientLogoBase64
    ? `<img src="${clientLogoBase64}" style="max-height:36px;max-width:120px;object-fit:contain;opacity:0.6;">`
    : '';
  const emitterLogo = emitterLogoBase64
    ? `<img src="${emitterLogoBase64}" style="max-height:30px;max-width:100px;object-fit:contain;opacity:0.5;">`
    : '';

  const funnel = data.funnel;

  // Resolve all row values. Pass the full ProcessedData so rows can reference
  // both funnel data and individual question data (question.<id>.*).
  const resolvedRows = tableConfig.rows.map((row) => {
    const count = resolveSource(row.source, data);
    const pct = resolvePercent(count, row.percentOf, data);
    return { ...row, count, pct };
  });

  // Build table rows HTML
  const tableRowsHtml = resolvedRows
    .map((row) => {
      const indent = row.level * 24;
      const isHighlight = row.highlight;
      const bgColor = isHighlight ? `background:linear-gradient(90deg, ${style.primaryColor}0d, ${style.primaryColor}05);` : '';
      const fontWeight = row.bold ? 'font-weight:700;' : 'font-weight:400;';
      const fontSize = row.level === 0 ? 'font-size:14px;' : 'font-size:12.5px;';
      const borderLeft = row.level > 0 ? `border-left:3px solid ${style.chartColors[(row.level - 1) % style.chartColors.length]};` : '';
      const textColor = row.level === 0 ? 'color:#1a1a1a;' : 'color:#444;';

      return `<tr style="${bgColor}">
        <td style="${fontWeight}${fontSize}${borderLeft}${textColor}padding:9px 12px 9px ${12 + indent}px;">
          ${esc(row.label)}
        </td>
        <td style="padding:9px 12px;text-align:right;${fontWeight}${fontSize}color:#1a1a1a;">${row.count.toLocaleString('es-ES')}</td>
        <td style="padding:9px 12px;text-align:right;${fontWeight}${fontSize}color:#888;">${row.pct}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${title} - ${period}</title>
  <style>
    @page { size: ${style.pageSize} ${style.orientation}; margin: 0; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: avoid; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${style.fontFamily}; background: #fff; color: #1a1a1a; -webkit-font-smoothing: antialiased; }
    .page {
      width: ${pageW}; height: ${pageH};
      position: relative; overflow: hidden;
      background: ${style.backgroundColor};
    }
    ${buildCoverCSS(style)}
    /* ---- TABLE PAGE ---- */
    .table-page {
      padding: 24px 36px 20px;
      display: flex; flex-direction: column;
      background: linear-gradient(180deg, #fafcf8 0%, #ffffff 4%);
    }
    .t-top-bar {
      height: 3px; border-radius: 2px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor}, ${style.primaryColor}44);
      margin-bottom: 16px;
    }
    .table-header {
      font-size: 17px; font-weight: 700; color: #1a1a1a;
      margin-bottom: 16px; display: flex; align-items: baseline; gap: 10px;
    }
    .table-header-period {
      font-size: 14px; color: #999; font-weight: 400;
    }
    .summary-box {
      display: flex; gap: 14px; margin-bottom: 18px;
    }
    .summary-item {
      flex: 1; padding: 16px 20px; border-radius: 12px;
      background: linear-gradient(135deg, #f8faf5, #f2f6ec);
      border: 1px solid #e4ecd4;
      text-align: center; position: relative; overflow: hidden;
    }
    .summary-item::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor});
      border-radius: 2px 2px 0 0;
    }
    .summary-item .value {
      font-size: 28px; font-weight: 800;
      background: linear-gradient(135deg, ${style.primaryColor}, ${style.secondaryColor});
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .summary-item .label {
      font-size: 9px; font-weight: 700; color: #999;
      margin-top: 4px; letter-spacing: 1px; text-transform: uppercase;
    }
    .data-table {
      width: 100%; border-collapse: separate; border-spacing: 0; flex: 1;
      border-radius: 10px; overflow: hidden;
      border: 1px solid #e8e8e8;
    }
    .data-table thead th {
      background: linear-gradient(135deg, ${style.primaryColor}, ${style.secondaryColor});
      color: #fff; padding: 11px 14px; text-align: left;
      font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;
    }
    .data-table thead th:nth-child(2),
    .data-table thead th:nth-child(3) { text-align: right; }
    .data-table tbody tr { border-bottom: 1px solid #f2f2f2; }
    .data-table tbody tr:nth-child(even) { background: #fafafa; }
    .data-table tbody tr:hover { background: #f5f8f0; }
    .page-footer {
      display: flex; justify-content: space-between; align-items: center;
      padding-top: 10px; margin-top: auto;
      border-top: 1px solid #f0f0f0;
    }
    .page-number {
      font-size: 10px; color: #bbb; font-weight: 500;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <!-- Cover -->
  ${buildCoverHTML(clientName, title, period, clientLogoBase64, emitterLogoBase64)}

  <!-- Table page -->
  <div class="page table-page">
    <div class="t-top-bar"></div>
    <div class="table-header">
      ${esc(title)}
      <span class="table-header-period">${esc(period.toUpperCase())}</span>
    </div>

    ${hasFunnel(funnel) ? `<div class="summary-box">
      <div class="summary-item">
        <div class="value">${(funnel.total || data.totalRows).toLocaleString('es-ES')}</div>
        <div class="label">Total registros</div>
      </div>
      <div class="summary-item">
        <div class="value">${funnel.contacted.toLocaleString('es-ES')}</div>
        <div class="label">Contactados</div>
      </div>
      <div class="summary-item">
        <div class="value">${funnel.informed.total.toLocaleString('es-ES')}</div>
        <div class="label">Informados</div>
      </div>
    </div>` : `<div class="summary-box">
      <div class="summary-item">
        <div class="value">${data.totalRows.toLocaleString('es-ES')}</div>
        <div class="label">Total registros</div>
      </div>
      <div class="summary-item">
        <div class="value">${data.questions.length.toLocaleString('es-ES')}</div>
        <div class="label">Preguntas analizadas</div>
      </div>
      <div class="summary-item">
        <div class="value">${data.questions.reduce((sum, q) => sum + q.total, 0).toLocaleString('es-ES')}</div>
        <div class="label">Respuestas totales</div>
      </div>
    </div>`}

    <table class="data-table">
      <thead>
        <tr>
          <th>Concepto</th>
          <th style="text-align:right">Cantidad</th>
          <th style="text-align:right">%</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>

    <div class="page-footer">
      <div>${clientLogo}</div>
      <div class="page-number">2 / 2</div>
      <div>${emitterLogo}</div>
    </div>
  </div>
</body>
</html>`;
}
