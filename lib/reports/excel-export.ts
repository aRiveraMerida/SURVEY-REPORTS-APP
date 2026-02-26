import * as XLSX from 'xlsx';
import type { ProcessedData } from '@/types/database';

/**
 * Export processed report data to an Excel (.xlsx) file and trigger download.
 */
export function exportToExcel(
  data: ProcessedData,
  title: string,
  period: string
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryRows: Record<string, string | number>[] = [
    { Campo: 'Título', Valor: title },
    { Campo: 'Periodo', Valor: period },
    { Campo: 'Total registros', Valor: data.totalRows },
    { Campo: 'Preguntas analizadas', Valor: data.questions.length },
  ];

  if (data.funnel.total > 0 && data.funnel.contacted > 0) {
    summaryRows.push(
      { Campo: '', Valor: '' },
      { Campo: 'EMBUDO DE CONTACTO', Valor: '' },
      { Campo: 'Total registros', Valor: data.funnel.total },
      { Campo: 'No contactados', Valor: data.funnel.notContacted.total },
      { Campo: 'Contactados no informados', Valor: data.funnel.contactedNotInformed.total },
      { Campo: 'Informados', Valor: data.funnel.informed.total },
      { Campo: 'Total contactados', Valor: data.funnel.contacted },
    );
  }

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen');

  // Sheet 2: All questions data
  const questionsRows: Record<string, string | number>[] = [];

  for (const q of data.questions) {
    questionsRows.push({
      Pregunta: q.questionText,
      Respuesta: '',
      Cantidad: '',
      Porcentaje: '',
      'Total respuestas': q.total,
    });

    const entries = Object.entries(q.frequencies).sort((a, b) => b[1] - a[1]);
    for (const [label, count] of entries) {
      questionsRows.push({
        Pregunta: '',
        Respuesta: label,
        Cantidad: count,
        Porcentaje: q.percentages[label] || '0%',
        'Total respuestas': '',
      });
    }

    // Blank separator row
    questionsRows.push({ Pregunta: '', Respuesta: '', Cantidad: '', Porcentaje: '', 'Total respuestas': '' });
  }

  const questionsSheet = XLSX.utils.json_to_sheet(questionsRows);
  questionsSheet['!cols'] = [{ wch: 40 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, questionsSheet, 'Datos');

  // Individual sheets per question
  for (const q of data.questions) {
    const rows = Object.entries(q.frequencies)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        Respuesta: label,
        Cantidad: count,
        Porcentaje: q.percentages[label] || '0%',
      }));

    rows.push({ Respuesta: 'TOTAL', Cantidad: q.total, Porcentaje: '100%' });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }];

    // Truncate sheet name to 31 chars (Excel limit)
    const sheetName = q.questionText.length > 28
      ? q.questionText.slice(0, 28) + '...'
      : q.questionText;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // Trigger download
  const fileName = `${title} - ${period}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
