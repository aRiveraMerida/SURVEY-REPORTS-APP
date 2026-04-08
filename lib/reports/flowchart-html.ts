import type { ProcessedData, ReportStyle, AIFlowchartPage, AIFlowchartNode } from '@/types/database';
import { buildCoverCSS, buildCoverHTML, esc } from './charts-html';

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
  data: ProcessedData,
  style: ReportStyle,
  nodeIndex: number
): string {
  const count = resolveSource(node.source, data);
  const pct = resolvePercent(count, node.percentOf, data);
  const color = style.chartColors[nodeIndex % style.chartColors.length];

  return `<div class="fc-node" data-id="${node.id}" data-level="${node.level}"
      style="border-top:4px solid ${color};">
    <div class="node-label">${esc(node.label)}</div>
    <div class="node-count" style="background:linear-gradient(135deg, ${color}, ${color}cc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${count.toLocaleString('es-ES')}</div>
    ${pct ? `<div class="node-pct">${pct}</div>` : ''}
  </div>`;
}

export function generateFlowchartHTML(opts: GenerateFlowchartOptions): string {
  const { title, period, clientName, clientLogoBase64, emitterLogoBase64, data, style, flowchartPages } = opts;

  const pageW = style.orientation === 'landscape' ? '297mm' : '210mm';
  const pageH = style.orientation === 'landscape' ? '210mm' : '297mm';

  const clientLogo = clientLogoBase64
    ? `<img src="${clientLogoBase64}" style="max-height:36px;max-width:120px;object-fit:contain;opacity:0.6;">`
    : '';
  const emitterLogo = emitterLogoBase64
    ? `<img src="${emitterLogoBase64}" style="max-height:30px;max-width:100px;object-fit:contain;opacity:0.5;">`
    : '';

  const totalPages = flowchartPages.length + 1;

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
    /* ---- FLOWCHART PAGE ---- */
    .fc-page {
      padding: 24px 32px 20px;
      display: flex; flex-direction: column;
      background: linear-gradient(180deg, #fafcf8 0%, #ffffff 4%);
    }
    .fc-top-bar {
      height: 3px; border-radius: 2px;
      background: linear-gradient(90deg, ${style.primaryColor}, ${style.accentColor}, ${style.primaryColor}44);
      margin-bottom: 16px;
    }
    .fc-page-header {
      font-size: 17px; font-weight: 700; color: #1a1a1a;
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
      width: 2px; height: 22px;
      background: linear-gradient(180deg, ${style.primaryColor}44, ${style.accentColor}44);
      margin: 0 auto;
      position: relative;
    }
    .fc-connector::after {
      content: '';
      position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%);
      width: 0; height: 0;
      border-left: 4px solid transparent; border-right: 4px solid transparent;
      border-top: 5px solid ${style.accentColor}66;
    }
    .fc-branch-connectors {
      display: flex; justify-content: center; position: relative;
      height: 22px; width: 100%;
    }
    .fc-branch-connectors::before {
      content: ''; position: absolute; top: 0;
      left: 25%; right: 25%; height: 2px;
      background: linear-gradient(90deg, ${style.primaryColor}44, ${style.accentColor}44);
    }
    .fc-node {
      background: #fff; border: 1px solid #eaeaea; border-radius: 12px;
      padding: 16px 20px; min-width: 160px; max-width: 260px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04);
      transition: transform 0.2s;
    }
    .node-label {
      font-size: 9px; font-weight: 700; color: #aaa;
      text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;
    }
    .node-count {
      font-size: 26px; font-weight: 800;
    }
    .node-pct {
      font-size: 11px; color: #999; margin-top: 4px; font-weight: 600;
      letter-spacing: 0.3px;
    }
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
  ${buildCoverHTML(clientName, title, period, clientLogoBase64, emitterLogoBase64)}`;

  // Generate a page for each flowchart page
  flowchartPages.forEach((page, pageIndex) => {
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
        .map((node) => renderNodeBox(node, data, style, nodeGlobalIndex++))
        .join('');

      nodesHtml += `<div class="fc-level">${levelHtml}</div>`;
    }

    html += `
  <div class="page fc-page">
    <div class="fc-top-bar"></div>
    <div class="fc-page-header">${esc(page.title)}</div>

    <div class="fc-canvas">
      ${nodesHtml}
    </div>
    <div class="page-footer">
      <div>${clientLogo}</div>
      <div class="page-number">${pageIndex + 2} / ${totalPages}</div>
      <div>${emitterLogo}</div>
    </div>
  </div>`;
  });

  html += `
</body>
</html>`;

  return html;
}
