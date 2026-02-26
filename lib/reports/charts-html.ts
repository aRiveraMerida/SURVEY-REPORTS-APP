import type { ProcessedData, ReportStyle } from '@/types/database';

interface GenerateOptions {
  title: string;
  period: string;
  clientName: string;
  clientLogoBase64: string | null;
  emitterLogoBase64: string | null;
  data: ProcessedData;
  style: ReportStyle;
  chartImages: Record<string, string>; // question id → base64 PNG
}

export function generateChartsHTML(opts: GenerateOptions): string {
  const { title, period, clientName, clientLogoBase64, emitterLogoBase64, data, style, chartImages } = opts;

  const pageW = style.orientation === 'landscape' ? '297mm' : '210mm';
  const pageH = style.orientation === 'landscape' ? '210mm' : '297mm';

  const clientLogo = clientLogoBase64 ? `<img src="${clientLogoBase64}" style="max-height:60px;max-width:160px;object-fit:contain;">` : '';
  const emitterLogo = emitterLogoBase64 ? `<img src="${emitterLogoBase64}" style="max-height:40px;max-width:120px;object-fit:contain;">` : '';

  let html = `<!DOCTYPE html>
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
      font-size: 22px; font-weight: 400; color: #555; letter-spacing: 0.2px;
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
    /* ---- QUESTION PAGE ---- */
    .question-page {
      padding: 28px 40px;
      display: flex; flex-direction: column;
    }
    .q-top-bar {
      height: 4px; border-radius: 2px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor});
      margin-bottom: 20px;
    }
    .question-header {
      display: flex; align-items: center; gap: 14px;
      margin-bottom: 12px;
    }
    .q-number {
      display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: 8px;
      background: ${style.primaryColor}; color: #fff;
      font-size: 15px; font-weight: 700; flex-shrink: 0;
    }
    .q-text {
      font-size: 17px; font-weight: 600; color: #1a1a1a;
    }
    .total-label {
      font-size: 14px; font-weight: 500; color: #888;
      text-align: center; margin-bottom: 14px; letter-spacing: 0.5px;
    }
    .total-label strong { color: #1a1a1a; font-weight: 700; font-size: 18px; }
    .chart-area {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 36px;
    }
    .chart-image { max-height: 380px; max-width: 480px; }
    .chart-image-full { max-height: 420px; width: 100%; object-fit: contain; }
    .legend {
      min-width: 200px; background: #fafafa; border-radius: 10px;
      padding: 16px 18px;
    }
    .legend-item {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 8px; font-size: 13px;
    }
    .legend-color {
      width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0;
    }
    .legend-text { color: #444; font-weight: 400; }
    .legend-count { color: #888; font-weight: 500; margin-left: auto; }
    .page-footer {
      display: flex; justify-content: space-between; align-items: flex-end;
      padding-top: 8px; border-top: 1px solid #eee; margin-top: auto;
    }
  </style>
</head>
<body>`;

  // Cover page
  html += `
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
  </div>`;

  // Question pages
  data.questions.forEach((q, index) => {
    const chartImg = chartImages[q.id];
    const legendItems = Object.entries(q.frequencies)
      .map(([label, count], i) => {
        const color = style.chartColors[i % style.chartColors.length];
        const pct = q.percentages[label] || '0%';
        return `<div class="legend-item">
          <span class="legend-color" style="background:${color}"></span>
          <span class="legend-text">${label}</span>
          <span class="legend-count">${count} (${pct})</span>
        </div>`;
      })
      .join('');

    const isBarChart = q.chartType === 'bar' || q.chartType === 'horizontalBar';

    html += `
  <div class="page question-page">
    <div class="q-top-bar"></div>
    <div class="question-header">
      <span class="q-number">${index + 1}</span>
      <span class="q-text">${q.questionText}</span>
    </div>
    <p class="total-label">TOTAL ${period.toUpperCase()}: <strong>${q.total}</strong></p>
    <div class="chart-area${isBarChart ? ' full-width' : ''}">
      ${chartImg ? `<img src="${chartImg}" class="${isBarChart ? 'chart-image-full' : 'chart-image'}">` : '<p>No chart</p>'}
      ${!isBarChart ? `<div class="legend">${legendItems}</div>` : ''}
    </div>
    ${isBarChart ? `<div class="legend" style="display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:center;margin-top:10px;background:#fafafa;border-radius:10px;padding:12px 18px">${legendItems}</div>` : ''}
    <div class="page-footer">
      <div>${clientLogo}</div>
      <div>${emitterLogo}</div>
    </div>
  </div>`;
  });

  html += `
</body>
</html>`;

  return html;
}
