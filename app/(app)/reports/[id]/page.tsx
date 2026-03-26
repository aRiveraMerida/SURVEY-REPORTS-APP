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
  const [sendFile, setSendFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const handlePrint = () => {
    setPrinting(true);
    const w = window.open('', '_blank');
    if (!w) {
      alert('No se pudo abrir la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
      setPrinting(false);
      return;
    }
    w.document.write(report.report_html);
    w.document.close();

    const triggerPrint = () => {
      w.onafterprint = () => { w.close(); };
      w.print();
      setPrinting(false);
    };

    if (w.document.fonts && w.document.fonts.ready) {
      w.document.fonts.ready.then(() => {
        const images = Array.from(w.document.images);
        if (images.length === 0) { triggerPrint(); return; }
        let loaded = 0;
        const checkDone = () => { if (++loaded >= images.length) triggerPrint(); };
        images.forEach((img) => {
          if (img.complete) { checkDone(); }
          else { img.onload = checkDone; img.onerror = checkDone; }
        });
      });
    } else {
      setTimeout(triggerPrint, 1200);
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

  const handleSendEmail = async () => {
    if (!report || !sendFile || !client) return;

    if (!client.contact_emails || client.contact_emails.length === 0) {
      setSendResult({ type: 'error', text: 'El cliente no tiene emails de contacto configurados. Edítalo en el dashboard.' });
      return;
    }

    if (!confirm(`Se enviará el informe PDF y el archivo original${client.file_password ? ' (encriptado)' : ''} a:\n\n${client.contact_emails.join('\n')}\n\n¿Continuar?`)) {
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const arrayBuffer = await sendFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-report',
          clientId: report.client_id,
          reportHtml: report.report_html,
          originalFileBase64: base64,
          originalFileName: sendFile.name,
          title: report.title,
          period: report.period,
        }),
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
          {printing ? 'Preparando PDF...' : 'Imprimir como PDF'}
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
        <div className="mb-4 bg-white rounded-lg border border-blue-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Enviar informe por email</h3>
          {client && (
            <p className="text-xs text-gray-500 mb-3">
              Destinatarios: {client.contact_emails?.length
                ? client.contact_emails.join(', ')
                : <span className="text-amber-600">Sin emails configurados</span>}
              {client.file_password && <span className="ml-2 text-gray-400">· Archivo encriptado con contraseña</span>}
            </p>
          )}
          <div className="flex items-center gap-3">
            <label className="flex-1">
              <span className="block text-xs font-medium text-gray-600 mb-1">Archivo original (Excel/CSV) para adjuntar</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => { setSendFile(e.target.files?.[0] || null); setSendResult(null); }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white hover:file:bg-gray-50"
              />
            </label>
            <button
              onClick={handleSendEmail}
              disabled={sending || !sendFile}
              className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 self-end"
            >
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
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
