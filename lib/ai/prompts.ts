/**
 * Build analysis prompt from column statistics.
 * Generic — works with any type of spreadsheet data.
 */

import type { ColumnStat } from '@/lib/processing/stats';

export function buildAnalysisPrompt(
  columnStats: ColumnStat[],
  totalRowCount: number
): string {
  const statsText = columnStats
    .map((col) => {
      const topVals = col.topValues
        .map((v) => `    "${v.value}" (${v.count})`)
        .join('\n');
      return `  ${col.letter}: "${col.header}" [${col.dataType}] — ${col.nonEmpty} valores, ${col.uniqueCount} únicos\n${topVals}`;
    })
    .join('\n\n');

  return `Eres un analista de datos experto. Analiza las estadísticas de una hoja de cálculo y extrae TODOS los insights relevantes.

## DATOS: ${totalRowCount} filas

Para cada columna se muestran: nombre, tipo detectado, cantidad de valores, valores únicos y los valores más frecuentes con su conteo.

${statsText}

## INSTRUCCIONES

1. **Identifica qué tipo de datos son** (encuesta, campaña telefónica, ventas, inventario, RRHH, etc.)
2. **Busca una columna de clasificación/resultado** que categorice cada registro (si existe)
3. **Extrae TODAS las preguntas/métricas interesantes** — cualquier columna con datos categóricos, SI/NO, valoraciones, opciones múltiples, estados, etc. Sé exhaustivo: es mejor detectar de más (el usuario filtrará después)
4. Para cada pregunta, explica brevemente POR QUÉ es relevante
5. Si los datos tienen estructura de funnel (estados que van de general a específico), defínelo. Si no, devuelve funnel como null.

Devuelve ÚNICAMENTE un JSON válido (sin markdown, sin \`\`\`) con esta estructura:

{
  "summary": "Descripción de qué contienen los datos (2-3 frases)",
  "dataType": "tipo de datos (ej: 'encuesta', 'campaña telefónica', 'ventas'...)",
  "resultColumn": "LETRA de la columna de clasificación principal (o null si no hay)",
  "funnel": null O {
    "totalLabel": "TOTAL REGISTROS",
    "notContacted": {
      "label": "Etiqueta para no contactados",
      "values": ["valor exacto 1", "valor exacto 2"]
    },
    "contactedNotInformed": {
      "label": "Etiqueta para contactados no informados",
      "values": ["valor exacto 1"]
    },
    "informed": {
      "label": "Etiqueta para informados/completados",
      "values": ["valor exacto 1"]
    }
  },
  "questions": [
    {
      "id": "q1",
      "columnLetter": "LETRA",
      "questionText": "Texto descriptivo de la pregunta/métrica",
      "chartType": "pie|doughnut|bar|horizontalBar",
      "rationale": "Por qué esta pregunta es relevante",
      "filterColumn": "LETRA de columna para filtrar (opcional, omitir para usar todas las filas)",
      "filterValues": ["valores exactos por los que filtrar (opcional)"]
    }
  ],
  "tableRows": [
    {
      "label": "Concepto",
      "source": "ruta al dato (total, contacted, notContacted.total, informed.breakdown.VALOR_EXACTO...)",
      "percentOf": "ruta referencia para % (opcional)",
      "level": 0,
      "bold": true,
      "highlight": false
    }
  ],
  "flowchartPages": [
    {
      "id": "page1",
      "title": "Título",
      "nodes": [
        {
          "id": "node1",
          "label": "TOTAL",
          "source": "total",
          "percentOf": "",
          "level": 0,
          "children": ["node2", "node3"]
        }
      ]
    }
  ]
}

## REGLAS

1. **questions**: Sé exhaustivo. Incluye TODAS las columnas con datos categóricos relevantes. Usa "pie" para 2 opciones (SI/NO), "doughnut" para 3-5 opciones, "bar" para 6+ categorías, "horizontalBar" para textos largos.
2. **filterColumn/filterValues**: Si una pregunta solo tiene sentido para un subconjunto de registros (ej: solo los que contestaron una encuesta), indica el filtro. Si no, omítelos para analizar todas las filas.
3. **funnel**: Solo si los datos tienen una estructura jerárquica clara (ej: total → contactados → informados). Usa valores EXACTOS de las estadísticas. Si no hay funnel, devuelve null.
4. **tableRows/flowchartPages**: Si funnel es null, genera tableRows con un resumen general de los datos y flowchartPages vacío ([]). Las rutas "source" válidas cuando hay funnel son: total, contacted, notContacted.total, contactedNotInformed.total, informed.total, notContacted.breakdown.VALOR, contactedNotInformed.breakdown.VALOR, informed.breakdown.VALOR.
5. Responde SOLO con el JSON.`;
}

export const DEFAULT_STYLE = {
  primaryColor: '#53860F',
  secondaryColor: '#2D4A06',
  accentColor: '#7AB317',
  backgroundColor: '#FFFFFF',
  headerGradient: ['#53860F', '#7AB317'] as [string, string],
  fontFamily: "'Inter', sans-serif",
  questionNumberColor: '#53860F',
  chartColors: ['#53860F', '#7AB317', '#2D4A06', '#A8D65B', '#FFC107', '#3B82F6', '#EF4444', '#8B5CF6', '#F97316'],
  pageSize: 'A4' as const,
  orientation: 'landscape' as const,
};
