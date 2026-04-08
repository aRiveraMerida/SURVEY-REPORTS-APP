'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { deleteReportWithAssets } from '@/lib/db/reports';
import { formatDate, reportTypeBadge } from '@/lib/utils/formatting';
import type { Client, Report } from '@/types/database';

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: clientData } = await supabase
      .from('clients').select('*').eq('id', id).single();
    const { data: reportsData } = await supabase
      .from('reports').select('*').eq('client_id', id)
      .order('created_at', { ascending: false });

    setClient(clientData);
    setReports(reportsData || []);
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('¿Eliminar este informe? Se eliminará también el fichero original asociado.')) return;
    try {
      await deleteReportWithAssets(supabase, reportId);
    } catch (err) {
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'desconocido'));
    }
    load();
  };

  const handleDownload = (report: Report) => {
    const blob = new Blob([report.report_html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${report.title} - ${report.period}.html`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;
  if (!client) return <div className="text-center py-12 text-gray-500">Cliente no encontrado</div>;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/" className="hover:text-gray-600">Inicio</Link>
        <span>/</span>
        <span className="text-gray-700">{client.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {client.logo_url ? (
            <img src={client.logo_url} alt="" className="w-14 h-14 object-contain rounded-lg border border-gray-200" />
          ) : (
            <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-300">{client.name.charAt(0)}</span>
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            {client.notes && <p className="text-sm text-gray-500 mt-1">{client.notes}</p>}
          </div>
        </div>
        <Link
          href={`/reports/new?client=${id}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-corp text-white text-sm font-medium rounded-lg hover:bg-corp-dark transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo informe
        </Link>
      </div>

      {/* Reports */}
      {reports.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500 mb-4">Este cliente aún no tiene informes</p>
          <Link
            href={`/reports/new?client=${id}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-corp text-white text-sm font-medium rounded-lg hover:bg-corp-dark"
          >
            Crear el primer informe
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Título</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Periodo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Tipo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const badge = reportTypeBadge(r.report_type);
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.title}</td>
                    <td className="px-4 py-3 text-gray-700">{r.period}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/reports/${r.id}`}
                          className="text-gray-400 hover:text-corp" title="Ver">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </Link>
                        <button onClick={() => handleDownload(r)}
                          className="text-gray-400 hover:text-green-600" title="Descargar">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                        <button onClick={() => handleDeleteReport(r.id)}
                          className="text-gray-400 hover:text-red-600" title="Eliminar">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
