import type { ProcessedData, ReportStyle, AITableRow } from '@/types/database';

interface TableConfig {
  rows: AITableRow[];
}
import { resolveSource, resolvePercent } from '@/lib/processing/resolver';

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
    ? `<img src="${clientLogoBase64}" style="max-height:60px;max-width:150px;object-fit:contain;">`
    : '';
  const emitterLogo = emitterLogoBase64
    ? `<img src="${emitterLogoBase64}" style="max-height:40px;max-width:120px;object-fit:contain;">`
    : '';

  const funnel = data.funnel;

  // Resolve all row values
  const resolvedRows = tableConfig.rows.map((row) => {
    const count = resolveSource(row.source, funnel);
    const pct = resolvePercent(count, row.percentOf, funnel);
    return { ...row, count, pct };
  });

  // Build table rows HTML
  const tableRowsHtml = resolvedRows
    .map((row) => {
      const indent = row.level * 24;
      const bgColor = row.highlight ? `background:${style.headerGradient[0]};` : '';
      const fontWeight = row.bold ? 'font-weight:bold;' : '';
      const fontSize = row.level === 0 ? 'font-size:15px;' : 'font-size:13px;';
      const borderLeft = row.level > 0 ? `border-left:3px solid ${style.chartColors[(row.level - 1) % style.chartColors.length]};` : '';

      return `<tr style="${bgColor}">
        <td style="padding:10px 12px;${fontWeight}${fontSize}${borderLeft}padding-left:${12 + indent}px;">
          ${row.label}
        </td>
        <td style="padding:10px 12px;text-align:right;${fontWeight}${fontSize}">${row.count.toLocaleString('es-ES')}</td>
        <td style="padding:10px 12px;text-align:right;${fontWeight}${fontSize}color:#666;">${row.pct}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${title} - ${period}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: ${style.pageSize} ${style.orientation}; margin: 0; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: avoid; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${style.fontFamily}; background: #fff; color: #1a1a1a; }
    .page {
      width: ${pageW}; height: ${pageH};
      position: relative; overflow: hidden;
      background: ${style.backgroundColor};
    }
    /* ---- COVER ---- */
    .cover {
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      background: linear-gradient(160deg, #fafafa 0%, #f0f5e6 100%);
    }
    .cover-accent {
      position: absolute; top: 0; left: 0; right: 0; height: 6px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor});
    }
    .cover-content { text-align: center; }
    .cover-title {
      font-size: 42px; font-weight: 800; color: #1a1a1a;
      letter-spacing: -0.5px; margin-bottom: 12px;
    }
    .cover-subtitle {
      font-size: 22px; font-weight: 400; color: #555;
    }
    .cover-period {
      display: inline-block; margin-top: 20px;
      padding: 8px 28px; border-radius: 100px;
      background: ${style.primaryColor}; color: #fff;
      font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;
    }
    .cover-logos {
      position: absolute; bottom: 40px; left: 50px; right: 50px;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .cover-side-bar {
      position: absolute; right: 0; top: 6px; bottom: 0; width: 6px;
      background: linear-gradient(180deg, ${style.primaryColor}, transparent);
    }
    /* ---- TABLE PAGE ---- */
    .table-page {
      padding: 28px 40px;
      display: flex; flex-direction: column;
    }
    .t-top-bar {
      height: 4px; border-radius: 2px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor});
      margin-bottom: 16px;
    }
    .table-header {
      font-size: 18px; font-weight: 700; color: #1a1a1a;
      margin-bottom: 16px;
    }
    .table-header span { color: #888; font-weight: 400; }
    .summary-box {
      display: flex; gap: 16px; margin-bottom: 20px;
    }
    .summary-item {
      flex: 1; padding: 14px 20px; border-radius: 10px;
      background: #f8faf5; border: 1px solid #e8f0d8; text-align: center;
    }
    .summary-item .value { font-size: 26px; font-weight: 800; color: ${style.primaryColor}; }
    .summary-item .label {
      font-size: 10px; font-weight: 600; color: #888;
      margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase;
    }
    .data-table {
      width: 100%; border-collapse: collapse; flex: 1;
    }
    .data-table thead th {
      background: ${style.primaryColor}; color: #fff;
      padding: 10px 14px; text-align: left; font-size: 12px;
      font-weight: 600; letter-spacing: 0.3px; text-transform: uppercase;
    }
    .data-table thead th:nth-child(2),
    .data-table thead th:nth-child(3) { text-align: right; }
    .data-table tbody tr { border-bottom: 1px solid #f0f0f0; }
    .data-table tbody tr:nth-child(even) { background: #fafafa; }
    .page-footer {
      display: flex; justify-content: space-between; align-items: flex-end;
      padding-top: 8px; border-top: 1px solid #eee; margin-top: auto;
    }
  </style>
</head>
<body>
  <!-- Cover -->
  <div class="page cover">
    <div class="cover-accent"></div>
    <div class="cover-side-bar"></div>
    <div class="cover-content">
      ${clientLogo ? `<div style="margin-bottom:28px">${clientLogo}</div>` : ''}
      <h1 class="cover-title">${clientName}</h1>
      <p class="cover-subtitle">${title}</p>
      <div class="cover-period">${period}</div>
    </div>
    <div class="cover-logos">
      <div>${clientLogo}</div>
      <div>${emitterLogo}</div>
    </div>
  </div>

  <!-- Table page -->
  <div class="page table-page">
    <div class="t-top-bar"></div>
    <div class="table-header">${title} <span>— ${period.toUpperCase()}</span></div>

    <div class="summary-box">
      <div class="summary-item">
        <div class="value">${funnel.total.toLocaleString('es-ES')}</div>
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
    </div>

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
      <div>${emitterLogo}</div>
    </div>
  </div>
</body>
</html>`;
}
