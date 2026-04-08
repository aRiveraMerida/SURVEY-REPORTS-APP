'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel } from '@/lib/reports/excel-export';
import { logAction } from '@/lib/db/access-logs';
import type { Report, Client } from '@/types/database';

export default function ReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  // Email sending state
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [manualEmails, setManualEmails] = useState<string[]>([]);
  const [newManualEmail, setNewManualEmail] = useState('');
  // Legacy fallback: reports created before source-file persistence need
  // the user to upload the original file manually.
  const [legacyFile, setLegacyFile] = useState<File | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single()
      .then(async ({ data }) => {
        setReport(data);
        if (data?.client_id) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('*')
            .eq('id', data.client_id)
            .single();
          setClient(clientData);
        }
        setLoading(false);
      });
  }, [id, supabase]);

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando informe...</div>;
  if (!report) return <div className="text-center py-12 text-gray-500">Informe no encontrado</div>;

  const handlePrint = async () => {
    if (!report) return;
    setPrinting(true);
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: report.report_html,
          filename: `${report.title} - ${report.period}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error al generar el PDF.' }));
        alert(err.error || 'Error al generar el PDF.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title} - ${report.period}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      logAction(supabase, 'report_exported_pdf', `/reports/${id}`);
    } catch (err) {
      alert('Error de conexión: ' + (err as Error).message);
    } finally {
      setPrinting(false);
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

  // Merge client emails + manual emails
  const allRecipients = [
    ...(client?.contact_emails || []),
    ...manualEmails,
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  const hasStoredFile = !!report?.source_file_path;

  const handleSendEmail = async () => {
    if (!report) return;

    if (allRecipients.length === 0) {
      setSendResult({ type: 'error', text: 'Añade al menos un destinatario. Puedes escribirlo abajo o configurar emails en el cliente desde el dashboard.' });
      return;
    }

    if (!hasStoredFile && !legacyFile) {
      setSendResult({ type: 'error', text: 'Este informe no tiene fichero original asociado. Adjunta el Excel/CSV de origen para continuar.' });
      return;
    }

    if (!confirm(`Se enviará el informe PDF y el archivo original${client?.file_password ? ' (encriptado)' : ''} a:\n\n${allRecipients.join('\n')}\n\n¿Continuar?`)) {
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      type SendBody = {
        action: 'send-report';
        clientId: string;
        reportId?: string;
        reportHtml: string;
        originalFileBase64?: string;
        originalFileName?: string;
        title: string;
        period: string;
        overrideEmails: string[];
      };

      const payload: SendBody = {
        action: 'send-report',
        clientId: report.client_id,
        reportHtml: report.report_html,
        title: report.title,
        period: report.period,
        overrideEmails: allRecipients,
      };

      if (hasStoredFile) {
        // Server loads the file from storage — guaranteed to be the exact
        // one used to generate the report.
        payload.reportId = report.id;
      } else if (legacyFile) {
        // Legacy reports: upload the file inline.
        const arrayBuffer = await legacyFile.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        payload.originalFileBase64 = base64;
        payload.originalFileName = legacyFile.name;
      }

      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (res.ok) {
        setSendResult({ type: 'success', text: result.message });
        logAction(supabase, 'report_emailed', `/reports/${id}`);
      } else {
        setSendResult({ type: 'error', text: result.error });
      }
    } catch (err) {
      setSendResult({ type: 'error', text: 'Error de conexión: ' + (err as Error).message });
    }

    setSending(false);
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
          disabled={printing}
          className="px-4 py-2 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
        >
          {printing ? 'Generando PDF...' : 'Descargar PDF'}
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
        <button
          onClick={() => setShowSendPanel(!showSendPanel)}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Enviar por email
        </button>
      </div>

      {/* Send email panel */}
      {showSendPanel && (
        <div className="mb-4 bg-white rounded-lg border border-blue-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Enviar informe por email</h3>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Destinatarios</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {allRecipients.map((email, i) => {
                const isFromClient = client?.contact_emails?.includes(email);
                return (
                  <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm ${
                    isFromClient ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {email}
                    {!isFromClient && (
                      <button onClick={() => setManualEmails(manualEmails.filter(e => e !== email))} className="text-gray-400 hover:text-red-500">×</button>
                    )}
                  </span>
                );
              })}
              {allRecipients.length === 0 && (
                <span className="text-xs text-amber-600">Sin destinatarios. Añade uno abajo o configura emails en el cliente.</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                value={newManualEmail}
                onChange={(e) => setNewManualEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const email = newManualEmail.trim();
                    if (email && !allRecipients.includes(email)) { setManualEmails([...manualEmails, email]); setNewManualEmail(''); }
                  }
                }}
                placeholder="Añadir email destinatario"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const email = newManualEmail.trim();
                  if (email && !allRecipients.includes(email)) { setManualEmails([...manualEmails, email]); setNewManualEmail(''); }
                }}
                className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
              >Añadir</button>
            </div>
          </div>

          {client?.file_password && (
            <p className="text-xs text-gray-400">El archivo original se enviará encriptado con contraseña.</p>
          )}

          {hasStoredFile ? (
            <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-600">
                <span className="font-medium">Fichero de datos:</span>{' '}
                <span className="text-gray-800">{report.source_file_name}</span>
                <div className="text-[11px] text-gray-400 mt-0.5">Se adjuntará automáticamente el fichero usado al generar este informe.</div>
              </div>
              <button
                onClick={handleSendEmail}
                disabled={sending || allRecipients.length === 0}
                className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {sending ? 'Enviando...' : `Enviar a ${allRecipients.length}`}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <label className="flex-1">
                <span className="block text-xs font-medium text-amber-700 mb-1">
                  Este informe no tiene fichero original asociado (generado antes de la mejora).
                  Adjunta el Excel/CSV de origen:
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => { setLegacyFile(e.target.files?.[0] || null); setSendResult(null); }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white hover:file:bg-gray-50"
                />
              </label>
              <button
                onClick={handleSendEmail}
                disabled={sending || !legacyFile || allRecipients.length === 0}
                className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 self-end"
              >
                {sending ? 'Enviando...' : `Enviar a ${allRecipients.length}`}
              </button>
            </div>
          )}
          {sendResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${
              sendResult.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {sendResult.text}
            </div>
          )}
        </div>
      )}

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
