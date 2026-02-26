'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel } from '@/lib/reports/excel-export';
import { logAction } from '@/lib/db/access-logs';
import type { Report } from '@/types/database';

export default function ReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setReport(data);
        setLoading(false);
      });
  }, [id, supabase]);

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando informe...</div>;
  if (!report) return <div className="text-center py-12 text-gray-500">Informe no encontrado</div>;

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(report.report_html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([report.report_html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title} - ${report.period}.html`;
    a.click();
    URL.revokeObjectURL(url);
    logAction(supabase, 'report_exported_html', `/reports/${id}`);
  };

  const handleExportExcel = () => {
    if (!report.report_data) return;
    exportToExcel(report.report_data, report.title, report.period);
    logAction(supabase, 'report_exported_excel', `/reports/${id}`);
  };

  return (
    <div>
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link
          href="/"
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          ← Volver al Dashboard
        </Link>
        <div className="flex-1" />
        <span className="text-sm text-gray-500">
          {report.title} · {report.period}
        </span>
        <button
          onClick={handlePrint}
          className="px-4 py-2 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900"
        >
          Imprimir como PDF
        </button>
        <button
          onClick={handleExportExcel}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Exportar Excel
        </button>
        <button
          onClick={handleDownload}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Descargar HTML
        </button>
      </div>

      {/* Report iframe */}
      <div
        className="bg-white rounded-lg border border-gray-200 overflow-hidden"
        style={{ height: '80vh' }}
      >
        <iframe
          srcDoc={report.report_html}
          className="w-full h-full border-0"
          title={report.title}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
