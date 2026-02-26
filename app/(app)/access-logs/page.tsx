'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getAccessLogs } from '@/lib/db/access-logs';
import type { AccessLog } from '@/types/database';

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  page_view: 'Acceso',
  login: 'Inicio de sesión',
  report_created: 'Informe creado',
  report_exported_html: 'Exportación HTML',
  report_exported_excel: 'Exportación Excel',
  report_exported_pdf: 'Exportación PDF',
  client_created: 'Cliente creado',
  data_analyzed: 'Análisis IA',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const supabase = createClient();

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const result = await getAccessLogs(supabase, page, PAGE_SIZE);
    setLogs(result.data);
    setTotal(result.total);
    setLoading(false);
  }, [supabase, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registro de accesos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Historial de accesos y acciones realizadas en la plataforma
          </p>
        </div>
        <span className="text-sm text-gray-400">{total} registros</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando registros...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No hay registros de acceso</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha y hora</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Usuario</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Acción</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Ruta</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{log.user_email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.action === 'login'
                          ? 'bg-blue-50 text-blue-700'
                          : log.action.startsWith('report_')
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{log.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
