import type { ProcessedData, ReportStyle, AIFlowchartPage, AIFlowchartNode } from '@/types/database';

type FlowchartPage = AIFlowchartPage;
type FlowchartNode = AIFlowchartNode;
import { resolveSource, resolvePercent } from '@/lib/processing/resolver';

interface GenerateFlowchartOptions {
  title: string;
  period: string;
  clientName: string;
  clientLogoBase64: string | null;
  emitterLogoBase64: string | null;
  data: ProcessedData;
  style: ReportStyle;
  flowchartPages: FlowchartPage[];
}

function renderNodeBox(
  node: FlowchartNode,
  funnel: ProcessedData['funnel'],
  style: ReportStyle,
  nodeIndex: number
): string {
  const count = resolveSource(node.source, funnel);
  const pct = resolvePercent(count, node.percentOf, funnel);
  const color = style.chartColors[nodeIndex % style.chartColors.length];

  const detailsHtml = '';

  return `<div class="fc-node" data-id="${node.id}" data-level="${node.level}" 
      data-position="center"
      style="border-top:4px solid ${color};">
    <div class="node-label">${node.label}</div>
    <div class="node-count" style="color:${color}">${count.toLocaleString('es-ES')}</div>
    ${pct ? `<div class="node-pct">${pct}</div>` : ''}
    ${detailsHtml}
  </div>`;
}

export function generateFlowchartHTML(opts: GenerateFlowchartOptions): string {
  const { title, period, clientName, clientLogoBase64, emitterLogoBase64, data, style, flowchartPages } = opts;

  const pageW = style.orientation === 'landscape' ? '297mm' : '210mm';
  const pageH = style.orientation === 'landscape' ? '210mm' : '297mm';

  const clientLogo = clientLogoBase64
    ? `<img src="${clientLogoBase64}" style="max-height:60px;max-width:150px;object-fit:contain;">`
    : '';
  const emitterLogo = emitterLogoBase64
    ? `<img src="${emitterLogoBase64}" style="max-height:40px;max-width:120px;object-fit:contain;">`
    : '';

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
    /* ---- FLOWCHART PAGE ---- */
    .fc-page {
      padding: 24px 32px;
      display: flex; flex-direction: column;
    }
    .fc-top-bar {
      height: 4px; border-radius: 2px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor});
      margin-bottom: 16px;
    }
    .fc-page-header {
      font-size: 18px; font-weight: 700; color: #1a1a1a;
      margin-bottom: 16px;
    }
    .fc-canvas {
      flex: 1; position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 0;
    }
    .fc-level {
      display: flex; justify-content: center; gap: 20px;
      width: 100%; position: relative;
    }
    .fc-connector {
      width: 2px; height: 20px; background: #d0d0d0; margin: 0 auto;
    }
    .fc-branch-connectors {
      display: flex; justify-content: center; position: relative;
      height: 20px; width: 100%;
    }
    .fc-branch-connectors::before {
      content: ''; position: absolute; top: 0;
      left: 25%; right: 25%; height: 2px; background: #d0d0d0;
    }
    .fc-node {
      background: #fff; border: 1px solid #e8e8e8; border-radius: 10px;
      padding: 14px 18px; min-width: 160px; max-width: 260px;
      text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .node-label {
      font-size: 10px; font-weight: 600; color: #888;
      text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;
    }
    .node-count {
      font-size: 24px; font-weight: 800;
    }
    .node-pct {
      font-size: 12px; color: #888; margin-top: 4px; font-weight: 500;
    }
    .node-details {
      margin-top: 8px; border-top: 1px solid #eee; padding-top: 6px;
    }
    .node-detail {
      display: flex; justify-content: space-between; gap: 8px;
      font-size: 10px; color: #666; padding: 2px 0;
    }
    .detail-label { text-align: left; }
    .detail-value { font-weight: 600; white-space: nowrap; }
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
  </div>`;

  // Generate a page for each flowchart page
  for (const page of flowchartPages) {
    // Group nodes by level
    const levels = new Map<number, FlowchartNode[]>();
    for (const node of page.nodes) {
      const arr = levels.get(node.level) || [];
      arr.push(node);
      levels.set(node.level, arr);
    }

    const sortedLevels = [...levels.entries()].sort(([a], [b]) => a - b);

    let nodesHtml = '';
    let nodeGlobalIndex = 0;
    for (let li = 0; li < sortedLevels.length; li++) {
      const [, nodes] = sortedLevels[li];

      // Add connector between levels
      if (li > 0) {
        if (nodes.length > 1) {
          nodesHtml += `<div class="fc-branch-connectors"></div>`;
        } else {
          nodesHtml += `<div class="fc-connector"></div>`;
        }
      }

      const levelHtml = nodes
        .map((node) => renderNodeBox(node, data.funnel, style, nodeGlobalIndex++))
        .join('');

      nodesHtml += `<div class="fc-level">${levelHtml}</div>`;
    }

    html += `
  <div class="page fc-page">
    <div class="fc-top-bar"></div>
    <div class="fc-page-header">${page.title}</div>
    
    <div class="fc-canvas">
      ${nodesHtml}
    </div>
    <div class="page-footer">
      <div>${clientLogo}</div>
      <div>${emitterLogo}</div>
    </div>
  </div>`;
  }

  html += `
</body>
</html>`;

  return html;
}
