import type { ProcessedData, ReportStyle } from '@/types/database';

/** Escape HTML special characters to prevent XSS */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function buildCoverCSS(style: ReportStyle): string {
  return `
    /* ---- COVER ---- */
    .cover {
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      background: linear-gradient(135deg, #ffffff 0%, #f8faf4 40%, #eef4e4 100%);
      position: relative;
    }
    .cover::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background:
        radial-gradient(ellipse 80% 60% at 20% 80%, ${style.primaryColor}08 0%, transparent 70%),
        radial-gradient(ellipse 60% 50% at 85% 20%, ${style.accentColor}0a 0%, transparent 60%);
      pointer-events: none;
    }
    .cover-accent {
      position: absolute; top: 0; left: 0; right: 0; height: 8px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor}, ${style.primaryColor});
    }
    .cover-content {
      text-align: center; position: relative; z-index: 1;
      padding: 0 60px;
    }
    .cover-divider {
      width: 80px; height: 4px; border-radius: 2px; margin: 0 auto 32px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor});
    }
    .cover-title {
      font-size: 44px; font-weight: 800; color: #1a1a1a;
      letter-spacing: -0.5px; margin-bottom: 16px;
      line-height: 1.15;
    }
    .cover-subtitle {
      font-size: 20px; font-weight: 400; color: #666; letter-spacing: 0.3px;
      line-height: 1.4;
    }
    .cover-period {
      display: inline-block; margin-top: 28px;
      padding: 10px 36px; border-radius: 100px;
      background: linear-gradient(135deg, ${style.primaryColor}, ${style.accentColor});
      color: #fff; font-size: 13px; font-weight: 600;
      letter-spacing: 1.5px; text-transform: uppercase;
      box-shadow: 0 4px 16px ${style.primaryColor}33;
    }
    .cover-logos {
      position: absolute; bottom: 44px; left: 56px; right: 56px;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .cover-logo-client img { max-height: 56px; max-width: 180px; object-fit: contain; }
    .cover-logo-emitter img { max-height: 40px; max-width: 130px; object-fit: contain; opacity: 0.7; }
    .cover-side-bar {
      position: absolute; right: 0; top: 8px; bottom: 0; width: 5px;
      background: linear-gradient(180deg, ${style.primaryColor}, ${style.accentColor}44, transparent);
    }
    .cover-bottom-bar {
      position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, transparent, ${style.accentColor}44, transparent);
    }
    .cover-corner {
      position: absolute; width: 120px; height: 120px; border-radius: 50%;
      opacity: 0.04;
    }
    .cover-corner-tl {
      top: -40px; left: -40px;
      background: ${style.primaryColor};
    }
    .cover-corner-br {
      bottom: -30px; right: -30px;
      background: ${style.accentColor};
      width: 180px; height: 180px;
    }`;
}

function buildCoverHTML(
  clientName: string,
  title: string,
  period: string,
  clientLogoBase64: string | null,
  emitterLogoBase64: string | null
): string {
  const clientLogoImg = clientLogoBase64 ? `<img src="${clientLogoBase64}">` : '';
  const emitterLogoImg = emitterLogoBase64 ? `<img src="${emitterLogoBase64}">` : '';

  return `
  <div class="page cover">
    <div class="cover-accent"></div>
    <div class="cover-side-bar"></div>
    <div class="cover-bottom-bar"></div>
    <div class="cover-corner cover-corner-tl"></div>
    <div class="cover-corner cover-corner-br"></div>
    <div class="cover-content">
      <div class="cover-divider"></div>
      <h1 class="cover-title">${esc(clientName)}</h1>
      <p class="cover-subtitle">${esc(title)}</p>
      <div class="cover-period">${esc(period)}</div>
    </div>
    <div class="cover-logos">
      <div class="cover-logo-client">${clientLogoImg}</div>
      <div class="cover-logo-emitter">${emitterLogoImg}</div>
    </div>
  </div>`;
}

export { buildCoverCSS, buildCoverHTML, esc };

export function generateChartsHTML(opts: GenerateOptions): string {
  const { title, period, clientName, clientLogoBase64, emitterLogoBase64, data, style, chartImages } = opts;

  const pageW = style.orientation === 'landscape' ? '297mm' : '210mm';
  const pageH = style.orientation === 'landscape' ? '210mm' : '297mm';

  const clientLogo = clientLogoBase64 ? `<img src="${clientLogoBase64}" style="max-height:36px;max-width:120px;object-fit:contain;opacity:0.6;">` : '';
  const emitterLogo = emitterLogoBase64 ? `<img src="${emitterLogoBase64}" style="max-height:30px;max-width:100px;object-fit:contain;opacity:0.5;">` : '';

  const totalPages = data.questions.length + 1;

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
    body { font-family: ${style.fontFamily}; background: #fff; color: #1a1a1a; -webkit-font-smoothing: antialiased; }
    .page {
      width: ${pageW}; height: ${pageH};
      position: relative; overflow: hidden;
      background: ${style.backgroundColor};
    }
    ${buildCoverCSS(style)}
    /* ---- QUESTION PAGE ---- */
    .question-page {
      padding: 24px 36px 20px;
      display: flex; flex-direction: column;
      background: linear-gradient(180deg, #fafcf8 0%, #ffffff 4%);
    }
    .q-top-bar {
      height: 3px; border-radius: 2px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor}, ${style.primaryColor}44);
      margin-bottom: 18px;
    }
    .question-header {
      display: flex; align-items: center; gap: 14px;
      margin-bottom: 8px;
    }
    .q-number {
      display: inline-flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 12px;
      background: linear-gradient(135deg, ${style.primaryColor}, ${style.accentColor});
      color: #fff; font-size: 16px; font-weight: 700; flex-shrink: 0;
      box-shadow: 0 3px 12px ${style.primaryColor}40;
    }
    .q-text {
      font-size: 17px; font-weight: 700; color: #1a1a1a;
      line-height: 1.35; letter-spacing: -0.2px;
    }
    .total-label {
      font-size: 12px; font-weight: 500; color: #999;
      text-align: center; margin-bottom: 14px; letter-spacing: 1.2px;
      text-transform: uppercase;
    }
    .total-label strong {
      color: ${style.primaryColor}; font-weight: 800; font-size: 18px;
      margin-left: 6px;
      background: linear-gradient(135deg, ${style.primaryColor}, ${style.accentColor});
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .chart-area {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 32px;
      padding: 4px 0;
    }
    .chart-image-wrap {
      display: flex; align-items: center; justify-content: center;
      background: #fff; border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.03);
      padding: 16px;
    }
    .chart-image { max-height: 350px; max-width: 460px; display: block; }
    .chart-image-full-wrap {
      display: flex; align-items: center; justify-content: center;
      flex: 1;
      background: #fff; border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.03);
      padding: 20px 24px;
    }
    .chart-image-full { max-height: 370px; width: 100%; object-fit: contain; display: block; }
    .legend {
      min-width: 200px; max-width: 260px;
      background: linear-gradient(180deg, #fafcf8 0%, #f5f7f0 100%);
      border-radius: 14px;
      padding: 18px 20px;
      border: 1px solid #e8eddc;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    }
    .legend-title {
      font-size: 9px; font-weight: 700; color: ${style.primaryColor};
      text-transform: uppercase; letter-spacing: 1.5px;
      margin-bottom: 14px; padding-bottom: 10px;
      border-bottom: 2px solid ${style.primaryColor}18;
    }
    .legend-item {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 4px; font-size: 12px;
      padding: 5px 8px;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .legend-item:nth-child(odd) { background: rgba(0,0,0,0.015); }
    .legend-item:last-child { margin-bottom: 0; }
    .legend-color {
      width: 12px; height: 12px; border-radius: 4px; flex-shrink: 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }
    .legend-text {
      color: #444; font-weight: 500; flex: 1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-size: 11.5px;
    }
    .legend-count {
      color: #666; font-weight: 700; font-size: 11px; white-space: nowrap;
      background: rgba(0,0,0,0.04); padding: 2px 8px; border-radius: 10px;
    }
    .legend-bar {
      display: flex; align-items: center; gap: 10px;
      flex-wrap: wrap; justify-content: center;
      background: linear-gradient(180deg, #fafcf8 0%, #f5f7f0 100%);
      border-radius: 14px;
      padding: 14px 20px; margin-top: 10px;
      border: 1px solid #e8eddc;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    }
    .legend-bar .legend-item { margin-bottom: 0; background: transparent; }
    /* ---- FOOTER ---- */
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
<body>`;

  // Cover page
  html += buildCoverHTML(clientName, title, period, clientLogoBase64, emitterLogoBase64);

  // Question pages
  data.questions.forEach((q, index) => {
    const chartImg = chartImages[q.id];
    const entries = Object.entries(q.frequencies);
    const legendItems = entries
      .map(([label, count], i) => {
        const color = style.chartColors[i % style.chartColors.length];
        const pct = q.percentages[label] || '0%';
        return `<div class="legend-item">
          <span class="legend-color" style="background:${color}"></span>
          <span class="legend-text" title="${esc(label)}">${esc(label)}</span>
          <span class="legend-count">${count} (${esc(pct)})</span>
        </div>`;
      })
      .join('');

    const isBarChart = q.chartType === 'bar' || q.chartType === 'horizontalBar';

    html += `
  <div class="page question-page">
    <div class="q-top-bar"></div>
    <div class="question-header">
      <span class="q-number">${index + 1}</span>
      <span class="q-text">${esc(q.questionText)}</span>
    </div>
    <p class="total-label">Total respuestas ${esc(period.toUpperCase())}: <strong>${q.total}</strong></p>
    <div class="chart-area">
      ${isBarChart
        ? `<div class="chart-image-full-wrap">${chartImg ? `<img src="${chartImg}" class="chart-image-full">` : '<p>No chart</p>'}</div>`
        : `<div class="chart-image-wrap">${chartImg ? `<img src="${chartImg}" class="chart-image">` : '<p>No chart</p>'}</div>
           <div class="legend"><div class="legend-title">Distribución</div>${legendItems}</div>`
      }
    </div>
    ${isBarChart ? `<div class="legend-bar">${legendItems}</div>` : ''}
    <div class="page-footer">
      <div>${clientLogo}</div>
      <div class="page-number">${index + 2} / ${totalPages}</div>
      <div>${emitterLogo}</div>
    </div>
  </div>`;
  });

  html += `
</body>
</html>`;

  return html;
}
