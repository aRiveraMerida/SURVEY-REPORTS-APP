export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatPercent(value: number, total: number): string {
  if (total === 0) return '0%';
  return (value / total * 100).toFixed(2).replace('.', ',') + '%';
}

export function formatNumber(value: number): string {
  return value.toLocaleString('es-ES');
}

export function reportTypeBadge(type: string): { label: string; color: string } {
  switch (type) {
    case 'charts':
      return { label: 'Gráficas', color: 'bg-corp-light text-corp-dark' };
    case 'table':
      return { label: 'Tabla', color: 'bg-green-100 text-green-800' };
    case 'flowchart':
      return { label: 'Flujo', color: 'bg-purple-100 text-purple-800' };
    default:
      return { label: type, color: 'bg-gray-100 text-gray-800' };
  }
}
