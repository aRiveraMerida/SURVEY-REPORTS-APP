import { Chart, registerables } from 'chart.js';

// Register all chart types
Chart.register(...registerables);

/** Generate a softer version of a hex color for gradient effects */
function soften(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function renderChartToBase64(
  type: 'pie' | 'doughnut' | 'bar' | 'horizontalBar',
  labels: string[],
  values: number[],
  colors: string[],
  width: number = 700,
  height: number = 420
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const chartType = type === 'horizontalBar' ? 'bar' : type;
  const isPie = type === 'pie' || type === 'doughnut';
  const isBar = type === 'bar' || type === 'horizontalBar';

  // For bar charts, create gradient fills
  const backgroundColors = colors.slice(0, labels.length).map((color) => {
    if (isBar) {
      const gradient = type === 'horizontalBar'
        ? ctx.createLinearGradient(0, 0, width, 0)
        : ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, soften(color, 0.7));
      gradient.addColorStop(1, color);
      return gradient;
    }
    return color;
  });

  const chart = new Chart(canvas, {
    type: chartType,
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: backgroundColors as string[],
          borderWidth: isPie ? 3 : 0,
          borderColor: isPie ? '#ffffff' : undefined,
          borderRadius: isBar ? 6 : 0,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: type === 'horizontalBar' ? 'y' : 'x',
      animation: false,
      responsive: false,
      layout: {
        padding: { top: 10, bottom: 10, left: 10, right: 10 },
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      ...(isBar ? {
        scales: {
          x: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0,0,0,0.04)',
              drawTicks: false,
            },
            ticks: {
              color: '#888',
              font: { size: 11, family: "'Inter', sans-serif" },
              padding: 8,
            },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0,0,0,0.04)',
              drawTicks: false,
            },
            ticks: {
              color: '#555',
              font: { size: 11, family: "'Inter', sans-serif" },
              padding: 8,
            },
            border: { display: false },
          },
        },
      } : {
        scales: undefined,
      }),
      ...(isPie ? {
        cutout: type === 'doughnut' ? '55%' : 0,
      } : {}),
    },
  });

  const base64 = canvas.toDataURL('image/png', 1.0);
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
