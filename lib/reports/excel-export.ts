import * as XLSX from 'xlsx';
import type { ProcessedData } from '@/types/database';

/**
 * Sanitize a string for use as an Excel sheet name.
 * Removes forbidden characters: : \ / ? * [ ]
 * Truncates to 31 chars (Excel limit) and ensures uniqueness.
 */
function sanitizeSheetName(name: string, existing: string[]): string {
  let clean = name.replace(/[:\\/?*\[\]]/g, '').trim();
  if (!clean) clean = 'Hoja';
  clean = clean.length > 31 ? clean.slice(0, 28) + '...' : clean;

  // Ensure uniqueness
  let final = clean;
  let counter = 2;
  while (existing.includes(final)) {
    const suffix = ` (${counter})`;
    final = clean.length + suffix.length > 31
      ? clean.slice(0, 31 - suffix.length) + suffix
      : clean + suffix;
    counter++;
  }
  return final;
}

/**
 * Export processed report data to an Excel (.xlsx) file and trigger download.
 */
export function exportToExcel(
  rawData: ProcessedData | string,
  title: string,
  period: string
) {
  // Handle case where data might be a JSON string (from Supabase JSONB)
  let data: ProcessedData;
  if (typeof rawData === 'string') {
    try {
      data = JSON.parse(rawData);
    } catch {
      alert('Error: los datos del informe no tienen un formato válido.');
      return;
    }
  } else {
    data = rawData;
  }

  // Validate data structure
  if (!data || !data.questions || !Array.isArray(data.questions)) {
    alert('Error: no hay datos de preguntas para exportar. Genera el informe primero.');
    return;
  }

  if (data.questions.length === 0) {
    alert('El informe no contiene preguntas analizadas. No se puede exportar un Excel vacío.');
    return;
  }

  // Ensure each question has valid frequencies
  const validQuestions = data.questions.filter(
    (q) => q && q.frequencies && Object.keys(q.frequencies).length > 0
  );

  if (validQuestions.length === 0) {
    alert('Las preguntas del informe no contienen datos de frecuencias. Verifica que el análisis se completó correctamente.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryRows: Record<string, string | number>[] = [
    { Campo: 'Título', Valor: title },
    { Campo: 'Periodo', Valor: period },
    { Campo: 'Total registros', Valor: data.totalRows || 0 },
    { Campo: 'Preguntas analizadas', Valor: validQuestions.length },
  ];

  if (data.funnel && data.funnel.contacted > 0) {
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

  for (const q of validQuestions) {
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
  const usedNames = ['Resumen', 'Datos'];
  for (const q of validQuestions) {
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

    const sheetName = sanitizeSheetName(q.questionText, usedNames);
    usedNames.push(sheetName);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // Trigger download — sanitize file name for OS compatibility
  const safeTitle = title.replace(/[:\\/?*\[\]<>|"]/g, '').trim() || 'Informe';
  const safePeriod = period.replace(/[:\\/?*\[\]<>|"]/g, '').trim() || 'Periodo';
  XLSX.writeFile(wb, `${safeTitle} - ${safePeriod}.xlsx`);
}
