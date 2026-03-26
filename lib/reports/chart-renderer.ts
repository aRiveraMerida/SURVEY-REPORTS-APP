import { Chart, registerables } from 'chart.js';

// Register all chart types
Chart.register(...registerables);

export function renderChartToBase64(
  type: 'pie' | 'doughnut' | 'bar' | 'horizontalBar',
  labels: string[],
  values: number[],
  colors: string[],
  width: number = 600,
  height: number = 400
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const chartType = type === 'horizontalBar' ? 'bar' : type;

  const chart = new Chart(canvas, {
    type: chartType,
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: type === 'pie' || type === 'doughnut' ? 2 : 0,
          borderColor: '#fff',
        },
      ],
    },
    options: {
      indexAxis: type === 'horizontalBar' ? 'y' : 'x',
      animation: false,
      responsive: false,
      plugins: {
        legend: { display: false },
      },
      scales:
        type === 'bar' || type === 'horizontalBar'
          ? {
              y: { beginAtZero: true },
            }
          : undefined,
    },
  });

  const base64 = canvas.toDataURL('image/png');
  chart.destroy();
  return base64;
}

/**
 * Convert a URL to base64 data URI
 */
export async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
