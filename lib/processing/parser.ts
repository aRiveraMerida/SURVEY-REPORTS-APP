import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ParsedData {
  rows: Record<string, string>[];
  headers: string[];
  sheetNames: string[];
  columnCount: number;
  rowCount: number;
}

/**
 * Convert Excel column letter to 0-based index: A=0, B=1, ..., Z=25, AA=26
 */
export function columnLetterToIndex(letter: string): number {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64);
  }
  return result - 1;
}

/**
 * Convert 0-based index to column letter
 */
export function indexToColumnLetter(index: number): string {
  let result = '';
  let n = index + 1;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/**
 * Parse an Excel file (.xlsx, .xls) or CSV file
 */
export async function parseFile(
  file: File,
  sheetName?: string | null
): Promise<ParsedData> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return parseCSV(file);
  }
  return parseExcel(file, sheetName);
}

async function parseExcel(file: File, sheetName?: string | null): Promise<ParsedData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetNames = workbook.SheetNames;
  const targetSheet = sheetName && sheetNames.includes(sheetName)
    ? sheetName
    : sheetNames[0];

  const worksheet = workbook.Sheets[targetSheet];
  const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });

  if (jsonData.length === 0) {
    return { rows: [], headers: [], sheetNames, columnCount: 0, rowCount: 0 };
  }

  // First row as headers
  const maxCols = Math.max(...jsonData.map((r) => (r as string[]).length));

  // Generate column letter headers
  const headers: string[] = [];
  for (let i = 0; i < maxCols; i++) {
    headers.push(indexToColumnLetter(i));
  }

  // Convert to keyed rows (using column letters as keys)
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < jsonData.length; i++) {
    const row: Record<string, string> = {};
    const rowData = jsonData[i] as string[];
    for (let j = 0; j < maxCols; j++) {
      const colLetter = indexToColumnLetter(j);
      row[colLetter] = String(rowData[j] ?? '');
    }
    // Also store header-based reference
    row['__rowIndex'] = String(i);
    rows.push(row);
  }

  return {
    rows,
    headers,
    sheetNames,
    columnCount: maxCols,
    rowCount: rows.length,
  };
}

async function parseCSV(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete(results) {
        const data = results.data as string[][];
        if (data.length === 0) {
          resolve({ rows: [], headers: [], sheetNames: ['CSV'], columnCount: 0, rowCount: 0 });
          return;
        }

        const maxCols = Math.max(...data.map((r) => r.length));
        const headers: string[] = [];
        for (let i = 0; i < maxCols; i++) {
          headers.push(indexToColumnLetter(i));
        }

        const rows: Record<string, string>[] = [];
        for (let i = 1; i < data.length; i++) {
          const row: Record<string, string> = {};
          for (let j = 0; j < maxCols; j++) {
            row[indexToColumnLetter(j)] = String(data[i][j] ?? '');
          }
          row['__rowIndex'] = String(i);
          rows.push(row);
        }

        resolve({
          rows,
          headers,
          sheetNames: ['CSV'],
          columnCount: maxCols,
          rowCount: rows.length,
        });
      },
      error(err) {
        reject(err);
      },
    });
  });
}

/**
 * Get column header text from the first row of raw data
 */
export async function getColumnHeaders(file: File, sheetName?: string | null): Promise<Record<string, string>> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return new Promise((resolve) => {
      Papa.parse(file, {
        preview: 1,
        complete(results) {
          const headers: Record<string, string> = {};
          const row = (results.data as string[][])[0] || [];
          row.forEach((val, i) => {
            headers[indexToColumnLetter(i)] = String(val);
          });
          resolve(headers);
        },
      });
    });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = sheetName && workbook.SheetNames.includes(sheetName)
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
  const headers: Record<string, string> = {};
  const row = (data[0] as string[]) || [];
  row.forEach((val, i) => {
    headers[indexToColumnLetter(i)] = String(val);
  });
  return headers;
}
