/**
 * Build column-level statistics from all rows.
 * This gives the AI a complete view of data distribution
 * without needing to send individual rows.
 */

export interface ColumnStat {
  letter: string;
  header: string;
  dataType: 'text' | 'number' | 'date' | 'mixed';
  nonEmpty: number;
  uniqueCount: number;
  topValues: { value: string; count: number }[];
}

function detectType(values: string[]): 'text' | 'number' | 'date' | 'mixed' {
  let nums = 0;
  let dates = 0;
  let texts = 0;

  for (const v of values) {
    if (!v) continue;
    if (!isNaN(Number(v.replace(',', '.')))) {
      nums++;
    } else if (/^\d{1,4}[/\-\.]\d{1,2}[/\-\.]\d{1,4}$/.test(v)) {
      dates++;
    } else {
      texts++;
    }
  }

  const total = nums + dates + texts;
  if (total === 0) return 'text';
  if (nums / total > 0.8) return 'number';
  if (dates / total > 0.8) return 'date';
  if (texts / total > 0.8) return 'text';
  return 'mixed';
}

export function buildColumnStats(
  rows: Record<string, string>[],
  headers: Record<string, string>
): ColumnStat[] {
  const stats: ColumnStat[] = [];

  for (const [letter, header] of Object.entries(headers)) {
    const values = rows.map((r) => (r[letter] || '').trim());
    const nonEmpty = values.filter((v) => v !== '').length;

    // Frequency count
    const freq: Record<string, number> = {};
    for (const v of values) {
      if (v === '') continue;
      freq[v] = (freq[v] || 0) + 1;
    }

    const uniqueCount = Object.keys(freq).length;
    const topValues = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([value, count]) => ({ value, count }));

    stats.push({
      letter,
      header,
      dataType: detectType(values),
      nonEmpty,
      uniqueCount,
      topValues,
    });
  }

  return stats;
}
