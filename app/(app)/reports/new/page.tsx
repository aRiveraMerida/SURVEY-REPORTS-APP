'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { parseFile, getColumnHeaders, MAX_FILE_SIZE_BYTES, MAX_ROWS, type ParsedData } from '@/lib/processing/parser';
import { buildColumnStats } from '@/lib/processing/stats';
import { processDataset } from '@/lib/processing/processor';
import {
  synthesizeTableRows,
  synthesizeFlowchartPages,
  aiTableRowsAreEmpty,
  aiFlowchartPagesAreEmpty,
} from '@/lib/processing/synthesizer';
import { renderChartToBase64, imageUrlToBase64 } from '@/lib/reports/chart-renderer';
import { generateChartsHTML } from '@/lib/reports/charts-html';
import { generateTableHTML } from '@/lib/reports/table-html';
import { generateFlowchartHTML } from '@/lib/reports/flowchart-html';
import { exportToExcel } from '@/lib/reports/excel-export';
import { DEFAULT_STYLE } from '@/lib/ai/prompts';
import { logAction } from '@/lib/db/access-logs';
import type { Client, AIAnalysis, AIQuestionConfig, ProcessedData, EmitterSettings } from '@/types/database';

type Step = 1 | 2 | 3;

export default function NewReportPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Cargando...</div>}>
      <NewReportContent />
    </Suspense>
  );
}

function NewReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [step, setStep] = useState<Step>(1);

  // Step 1: Client + file
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(searchParams.get('client') || '');
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Step 2: AI analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [reportType, setReportType] = useState<'charts' | 'table' | 'flowchart'>('charts');
  const [apiCost, setApiCost] = useState<{ inputTokens: number; outputTokens: number; costUsd: number } | null>(null);

  // Step 3: Preview
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
  const [reportHtml, setReportHtml] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const loadClients = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select('*').order('name');
    if (error) {
      console.error('loadClients failed:', error.message);
      setParseError(`Error cargando los clientes: ${error.message}`);
      return;
    }
    setClients(data || []);
  }, [supabase]);

  useEffect(() => { loadClients(); }, [loadClients]);

  // Auto-set title when client is selected
  useEffect(() => {
    if (selectedClient && !title) {
      setTitle(selectedClient.name);
    }
  }, [selectedClient, title]);

  const handleFileUpload = async (f: File) => {
    setParseError(null);
    setAnalysis(null);
    setParsedData(null);

    // Pre-flight: size guard. Matches the server-side /api/send-report
    // limit (25 MB) so users don't discover the cap only at send time.
    if (f.size > MAX_FILE_SIZE_BYTES) {
      const mb = (f.size / 1024 / 1024).toFixed(1);
      const limitMb = (MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0);
      setParseError(`El fichero pesa ${mb} MB. Máximo permitido: ${limitMb} MB.`);
      setFile(null);
      return;
    }

    setFile(f);
    try {
      const parsed = await parseFile(f);
      if (parsed.truncated) {
        setParseError(
          `El fichero tiene más de ${MAX_ROWS.toLocaleString('es-ES')} filas y ha sido truncado. ` +
          `El análisis solo verá las primeras ${parsed.rowCount.toLocaleString('es-ES')} filas.`
        );
      }
      setParsedData(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al parsear el fichero. Verifica el formato.';
      setParseError(msg);
      setFile(null);
    }
  };

  // Step 1 → 2: Send column stats to AI
  const handleAnalyze = async () => {
    if (!parsedData || !file) return;
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const apiKey = localStorage.getItem('claude_api_key');
      if (!apiKey) {
        setAnalysisError('Configura tu API key de Anthropic en Settings antes de continuar.');
        setAnalyzing(false);
        return;
      }

      const headers = await getColumnHeaders(file);
      const columnStats = buildColumnStats(parsedData.rows, headers);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, columnStats, totalRowCount: parsedData.rowCount }),
      });

      const result = await res.json();
      if (!res.ok) {
        setAnalysisError(result.error || 'Error en el análisis');
      } else {
        setAnalysis(result.analysis);
        if (result.usage) setApiCost(result.usage);
        logAction(supabase, 'data_analyzed', '/reports/new');
        setStep(2);
      }
    } catch (err) {
      setAnalysisError('Error de conexión: ' + (err as Error).message);
    }
    setAnalyzing(false);
  };

  // Toggle a question on/off
  const toggleQuestion = (id: string) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      questions: analysis.questions.map((q) =>
        q.id === id ? { ...q, enabled: !q.enabled } : q
      ),
    });
  };

  // Edit question text inline
  const updateQuestionText = (id: string, text: string) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      questions: analysis.questions.map((q) =>
        q.id === id ? { ...q, questionText: text } : q
      ),
    });
  };

  // Change chart type for a question
  const updateChartType = (id: string, chartType: AIQuestionConfig['chartType']) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      questions: analysis.questions.map((q) =>
        q.id === id ? { ...q, chartType } : q
      ),
    });
  };

  // Generate report (reusable with any type, no re-analysis needed)
  const handleGenerate = async (typeOverride?: 'charts' | 'table' | 'flowchart') => {
    if (!parsedData || !analysis || !selectedClient) return;
    const type = typeOverride || reportType;
    if (typeOverride) setReportType(typeOverride);
    setGenerating(true);

    try {
      const data = processDataset(parsedData.rows, analysis);
      setProcessedData(data);

      const style = DEFAULT_STYLE;
      const clientLogoBase64 = selectedClient.logo_url
        ? await imageUrlToBase64(selectedClient.logo_url) : null;
      // Emitter settings are optional — if the row doesn't exist yet or
      // there's any error, fall back to no emitter logo instead of failing
      // the whole report generation.
      const { data: emitterData, error: emitterErr } = await supabase
        .from('emitter_settings').select('*').limit(1).single();
      if (emitterErr && emitterErr.code !== 'PGRST116') {
        console.warn('Failed to load emitter settings:', emitterErr.message);
      }
      const emitterLogoBase64 = (emitterData as EmitterSettings | null)?.logo_url
        ? await imageUrlToBase64((emitterData as EmitterSettings).logo_url!) : null;

      let html = '';
      if (type === 'table') {
        // Fall back to a synthesized table when the AI returned empty rows
        // or when all AI rows would resolve to zero (no funnel in data).
        const tableRows = aiTableRowsAreEmpty(analysis.tableRows, data)
          ? synthesizeTableRows(data)
          : analysis.tableRows;
        html = generateTableHTML({
          title, period, clientName: selectedClient.name,
          clientLogoBase64, emitterLogoBase64, data, style,
          tableConfig: { rows: tableRows },
        });
      } else if (type === 'flowchart') {
        const flowchartPages = aiFlowchartPagesAreEmpty(analysis.flowchartPages, data)
          ? synthesizeFlowchartPages(data)
          : analysis.flowchartPages;
        html = generateFlowchartHTML({
          title, period, clientName: selectedClient.name,
          clientLogoBase64, emitterLogoBase64, data, style,
          flowchartPages,
        });
      } else {
        const chartImages: Record<string, string> = {};
        for (const q of data.questions) {
          chartImages[q.id] = renderChartToBase64(
            q.chartType, Object.keys(q.frequencies), Object.values(q.frequencies), style.chartColors
          );
        }
        html = generateChartsHTML({
          title, period, clientName: selectedClient.name,
          clientLogoBase64, emitterLogoBase64, data, style, chartImages,
        });
      }

      setReportHtml(html);
      setStep(3);
    } catch (err) {
      alert('Error al generar: ' + (err as Error).message);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (!processedData || !reportHtml || !analysis || !file) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('No hay sesión activa. Vuelve a iniciar sesión.');
        setSaving(false);
        return;
      }

      // Upload the original source file to storage. The file is
      // REQUIRED — without it the report can never be emailed because
      // we no longer allow manual file attachment. If the upload fails
      // (e.g. the `source-files` bucket from migration 005 doesn't
      // exist), we block the save and tell the user what happened.
      const safeExt = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
      const storagePath = `${selectedClientId}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
      const { error: uploadErr } = await supabase
        .storage
        .from('source-files')
        .upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (uploadErr) {
        const hint = /bucket|not.*found/i.test(uploadErr.message)
          ? ' Asegúrate de que la migración 005 está aplicada en Supabase (crea el bucket "source-files").'
          : '';
        alert('Error al subir el fichero original: ' + uploadErr.message + hint);
        setSaving(false);
        return;
      }

      const { error: insertErr } = await supabase.from('reports').insert({
        client_id: selectedClientId,
        title,
        period,
        report_type: reportType,
        ai_analysis: analysis,
        report_html: reportHtml,
        report_data: processedData,
        created_by: user.id,
        source_file_path: storagePath,
        source_file_name: file.name,
      });

      if (insertErr) {
        // Roll back the uploaded file
        await supabase.storage.from('source-files').remove([storagePath]).catch(() => {});
        const hint = /source_file/i.test(insertErr.message)
          ? ' Asegúrate de que la migración 005 está aplicada en Supabase (añade las columnas source_file_path y source_file_name a reports).'
          : '';
        alert('Error al guardar: ' + insertErr.message + hint);
      } else {
        logAction(supabase, 'report_created', '/reports/new');
        router.push(`/clients/${selectedClientId}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    if (!reportHtml) return;
    setPrinting(true);
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: reportHtml,
          filename: `${title} - ${period}`,
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
      a.download = `${title} - ${period}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      logAction(supabase, 'report_exported_pdf', '/reports/new');
    } catch (err) {
      alert('Error de conexión: ' + (err as Error).message);
    } finally {
      setPrinting(false);
    }
  };

  const handleExportExcel = () => {
    if (!processedData) return;
    exportToExcel(processedData, title, period);
    logAction(supabase, 'report_exported_excel', '/reports/new');
  };

  // Email sending is deliberately NOT available from this wizard.
  // The user must save the report first and then send it from the
  // report view page — that's the only path that uses the stored
  // source file, the right clientId, and the client's email config,
  // guaranteeing the attachment matches what was saved.

  const stepLabels = ['Datos', 'Análisis IA', 'Informe'];

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/" className="hover:text-gray-600">Inicio</Link>
        <span>/</span>
        <span className="text-gray-700">Nuevo informe</span>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-4 mb-8">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'bg-corp text-white' : 'bg-gray-200 text-gray-500'
            }`}>{step > i + 1 ? '✓' : i + 1}</div>
            <span className={`text-sm ${step >= i + 1 ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
            {i < 2 && <div className="w-12 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 1: Client + File */}
      {step === 1 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-2xl space-y-5">
          <h2 className="text-lg font-semibold">Cliente y datos</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <select value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">Selecciona un cliente</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Informe campaña" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Periodo</label>
              <input type="text" value={period} onChange={(e) => setPeriod(e.target.value)}
                placeholder="FEBRERO 2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fichero de datos</label>
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-corp transition-colors cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              {file ? (
                <div>
                  <p className="font-medium text-green-600">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {parsedData ? `${parsedData.rowCount} filas × ${parsedData.columnCount} columnas` : 'Parseando...'}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-500">Arrastra tu Excel o CSV aquí</p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv</p>
                </div>
              )}
              <input id="file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
            </div>
          </div>

          {parseError && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{parseError}</div>}
          {analysisError && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{analysisError}</div>}

          <button
            onClick={handleAnalyze}
            disabled={!selectedClientId || !title || !period || !parsedData || analyzing}
            className="w-full py-3 bg-corp text-white text-sm font-medium rounded-lg hover:bg-corp-dark disabled:opacity-50 transition-colors"
          >
            {analyzing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Analizando con IA...
              </span>
            ) : 'Analizar con IA →'}
          </button>
        </div>
      )}

      {/* Step 2: AI Analysis + Question selection + Report type */}
      {step === 2 && analysis && (
        <div className="max-w-3xl space-y-5">
          {/* AI Summary */}
          <div className="bg-corp-light border border-corp/20 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-corp-dark mb-1">Análisis de la IA</h3>
                <p className="text-sm text-corp-dark">{analysis.summary}</p>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-corp/10 text-corp-dark">
                {analysis.dataType}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-corp">
              {analysis.resultColumn && (
                <span>Columna resultado: <strong>{analysis.resultColumn}</strong></span>
              )}
              <span>Preguntas detectadas: <strong>{analysis.questions.length}</strong></span>
              <span>Seleccionadas: <strong>{analysis.questions.filter(q => q.enabled).length}</strong></span>
              {analysis.funnel && <span>Funnel: <strong>detectado</strong></span>}
              {apiCost && (
                <span className="ml-auto text-corp">
                  {apiCost.inputTokens + apiCost.outputTokens} tokens · <strong>${apiCost.costUsd.toFixed(4)}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Question selection */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Preguntas detectadas ({analysis.questions.length})
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setAnalysis({ ...analysis, questions: analysis.questions.map(q => ({ ...q, enabled: true })) })}
                  className="text-xs text-corp hover:underline">Todas</button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setAnalysis({ ...analysis, questions: analysis.questions.map(q => ({ ...q, enabled: false })) })}
                  className="text-xs text-gray-500 hover:underline">Ninguna</button>
              </div>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {analysis.questions.map((q) => (
                <div key={q.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    q.enabled ? 'border-corp/20 bg-corp-light/50' : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}>
                  {/* Toggle */}
                  <button
                    onClick={() => toggleQuestion(q.id)}
                    className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      q.enabled ? 'bg-corp border-corp text-white' : 'border-gray-300 bg-white'
                    }`}>
                    {q.enabled && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">Col {q.columnLetter}</span>
                      <select
                        value={q.chartType}
                        onChange={(e) => updateChartType(q.id, e.target.value as AIQuestionConfig['chartType'])}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                        <option value="pie">Pie</option>
                        <option value="doughnut">Doughnut</option>
                        <option value="bar">Barras</option>
                        <option value="horizontalBar">Barras H.</option>
                      </select>
                      {q.filterColumn && (
                        <span className="text-xs text-gray-400">filtro: {q.filterColumn}</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={q.questionText}
                      onChange={(e) => updateQuestionText(q.id, e.target.value)}
                      className="w-full text-sm font-medium text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-corp outline-none px-0 py-0.5"
                    />
                    {q.rationale && (
                      <p className="text-xs text-gray-400 mt-1">{q.rationale}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Report type selection */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Tipo de informe</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'charts' as const, label: 'Gráficos', desc: 'Gráficas por pregunta' },
                { value: 'table' as const, label: 'Tabla', desc: 'Resumen en tabla' },
                { value: 'flowchart' as const, label: 'Flujo', desc: 'Diagrama de flujo' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setReportType(opt.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    reportType === opt.value
                      ? 'border-corp bg-corp-light'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="px-4 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              ← Volver
            </button>
            <button
              onClick={() => handleGenerate()}
              disabled={generating || analysis.questions.filter(q => q.enabled).length === 0}
              className="flex-1 py-2.5 bg-corp text-white text-sm font-medium rounded-lg hover:bg-corp-dark disabled:opacity-50">
              {generating ? 'Generando...' : `Generar informe con ${analysis.questions.filter(q => q.enabled).length} preguntas →`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && reportHtml && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setStep(2)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              ← Volver
            </button>

            {/* Type switcher - cambiar tipo sin re-analizar */}
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              {(['charts', 'table', 'flowchart'] as const).map((t) => (
                <button key={t}
                  onClick={() => handleGenerate(t)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    reportType === t ? 'bg-corp text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}>
                  {t === 'charts' ? 'Gráficos' : t === 'table' ? 'Tabla' : 'Flujo'}
                </button>
              ))}
            </div>

            <div className="flex-1" />
            <button onClick={handlePrint} disabled={printing}
              className="px-4 py-2 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50">
              {printing ? 'Preparando...' : 'PDF'}
            </button>
            <button onClick={handleExportExcel}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">
              Excel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 text-sm font-medium bg-corp text-white rounded-lg hover:bg-corp-dark disabled:opacity-50"
              title="Guarda el informe. Una vez guardado podrás enviarlo por email desde la vista del informe.">
              {saving ? 'Guardando...' : 'Guardar informe'}
            </button>
          </div>

          <p className="text-xs text-gray-400 text-right">
            Para enviarlo por email, guárdalo primero y ábrelo desde la lista de informes del cliente.
          </p>

          {apiCost && (
            <div className="text-xs text-gray-400 text-right">
              Coste análisis: {apiCost.inputTokens + apiCost.outputTokens} tokens · ${apiCost.costUsd.toFixed(4)} USD
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden" style={{ height: '70vh' }}>
            <iframe srcDoc={reportHtml} className="w-full h-full border-0" title="Preview" sandbox="allow-same-origin" />
          </div>
        </div>
      )}
    </div>
  );
}
