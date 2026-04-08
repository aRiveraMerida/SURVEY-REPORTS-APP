'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { deleteClientWithAssets, extractStoragePath } from '@/lib/db/clients';
import { logAction } from '@/lib/db/access-logs';
import { formatDate } from '@/lib/utils/formatting';
import {
  DEFAULT_SUBJECT_CONFIG,
  SEPARATOR_OPTIONS,
  renderSubjectFromConfig,
} from '@/lib/email/subject';
import type { Client, EmailSubjectConfig } from '@/types/database';

interface ClientWithStats extends Client {
  report_count: number;
  last_report_date: string | null;
}

export default function HomePage() {
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [contactEmails, setContactEmails] = useState<string[]>([]);
  const [newContactEmail, setNewContactEmail] = useState('');
  const [filePassword, setFilePassword] = useState('');
  // Structured email subject config (replaces the old free-text
  // template input). Controlled by a form in the modal.
  const [subjectConfig, setSubjectConfig] = useState<EmailSubjectConfig>(DEFAULT_SUBJECT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    setHasApiKey(!!localStorage.getItem('claude_api_key'));
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    // Single query with embedded reports. We only need created_at to
    // derive both the count and the latest report date, so we project
    // just that column from the nested relation. Supabase turns this
    // into a single round-trip instead of N+1.
    const { data, error } = await supabase
      .from('clients')
      .select('*, reports(created_at)')
      .order('name');

    if (error || !data) {
      console.error('loadClients failed:', error?.message);
      setLoading(false);
      return;
    }

    type ClientRow = Client & { reports: { created_at: string }[] };
    const withStats: ClientWithStats[] = (data as ClientRow[]).map((client) => {
      const reports = client.reports || [];
      const sorted = reports
        .map((r) => r.created_at)
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      return {
        ...client,
        report_count: reports.length,
        last_report_date: sorted[0] || null,
      };
    });

    setClients(withStats);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const openCreate = () => {
    setEditingClient(null); setName(''); setNotes(''); setLogoFile(null); setLogoPreview(null);
    setContactEmails([]); setNewContactEmail(''); setFilePassword('');
    setSubjectConfig(DEFAULT_SUBJECT_CONFIG);
    setSaveError(null); setShowModal(true);
  };
  const openEdit = (c: Client) => {
    setEditingClient(c); setName(c.name); setNotes(c.notes || ''); setLogoFile(null); setLogoPreview(c.logo_url);
    setContactEmails(c.contact_emails || []); setNewContactEmail(''); setFilePassword(c.file_password || '');
    // Prefer the new structured config. Fall back to the legacy free-text
    // template: users who typed a template by hand before migration 006
    // still see sensible defaults — the template keeps working on the
    // backend until they save the modal, at which point it's replaced.
    setSubjectConfig(c.email_subject_config || DEFAULT_SUBJECT_CONFIG);
    setSaveError(null); setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSaveError(null);

    let logoUrl = editingClient?.logo_url || null;

    if (logoFile) {
      // Reject oversized images before uploading — logos get embedded as
      // base64 in every report HTML, so keep them small.
      if (logoFile.size > 2 * 1024 * 1024) {
        setSaveError('El logo no puede superar los 2 MB.');
        setSaving(false);
        return;
      }
      const rawExt = (logoFile.name.split('.').pop() || 'png').toLowerCase();
      const ext = rawExt.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'png';
      const fileName = `clients/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('logos').upload(fileName, logoFile, { upsert: false });
      if (uploadErr) {
        setSaveError('Error al subir el logo: ' + uploadErr.message);
        setSaving(false);
        return;
      }
      const newUrl = supabase.storage.from('logos').getPublicUrl(fileName).data.publicUrl;
      // Best-effort: remove the previous logo file so we don't accumulate orphans
      const oldPath = extractStoragePath(editingClient?.logo_url || null, 'logos');
      if (oldPath) {
        await supabase.storage.from('logos').remove([oldPath]).catch(() => {});
      }
      logoUrl = newUrl;
    }

    // Build the payload. `email_subject_config` was added in migration
    // 006 (and `email_subject_template` back in 005). If either migration
    // hasn't been applied the insert/update would fail with "column does
    // not exist"; the writeClient helper catches that and retries after
    // dropping the missing columns, so the user never hits a dead end.
    type ClientWritePayload = {
      name: string;
      notes: string | null;
      logo_url: string | null;
      contact_emails: string[];
      file_password: string | null;
      email_subject_config?: EmailSubjectConfig | null;
      // email_subject_template is legacy — we no longer WRITE it from
      // the UI (the new form replaces it). We clear it on save so
      // there's a single source of truth.
      email_subject_template?: string | null;
    };
    const clientData: ClientWritePayload = {
      name: name.trim(),
      notes: notes.trim() || null,
      logo_url: logoUrl,
      contact_emails: contactEmails,
      file_password: filePassword.trim() || null,
      email_subject_config: subjectConfig,
      email_subject_template: null,
    };

    // Helper that performs the DB write with graceful fallback when a
    // column is missing. Tries the full payload first; on "column
    // does not exist" it drops the offending field and retries, up to
    // a hard limit. Returns `null` on success or the final error
    // message on failure.
    const writeClient = async (): Promise<string | null> => {
      const { data: { user } } = editingClient
        ? { data: { user: null } }
        : await supabase.auth.getUser();
      if (!editingClient && !user) {
        return 'No hay sesión activa. Vuelve a iniciar sesión.';
      }

      // Build an ordered list of optional fields we'll strip on retry
      // when their column is missing, most-recently-added first.
      const OPTIONAL_FIELDS: (keyof ClientWritePayload)[] = [
        'email_subject_config',
        'email_subject_template',
      ];

      const payload: ClientWritePayload = { ...clientData };
      for (let attempt = 0; attempt <= OPTIONAL_FIELDS.length; attempt++) {
        const { error } = editingClient
          ? await supabase.from('clients').update(payload).eq('id', editingClient.id)
          : await supabase.from('clients').insert({ ...payload, created_by: user!.id });

        if (!error) {
          if (!editingClient) logAction(supabase, 'client_created', '/');
          return null;
        }

        // On column-missing errors, strip the matching field and retry.
        const missingField = OPTIONAL_FIELDS.find(
          (f) => new RegExp(String(f), 'i').test(error.message) && f in payload,
        );
        if (missingField) {
          console.warn(
            `clients.${String(missingField)} column missing; retrying without it. Apply the latest migration to enable.`,
          );
          delete payload[missingField];
          continue;
        }
        return error.message;
      }
      return 'No se pudo guardar el cliente tras varios reintentos.';
    };

    const errMsg = await writeClient();

    if (errMsg) {
      setSaveError(`Error al guardar el cliente: ${errMsg}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowModal(false);
    loadClients();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cliente y todos sus informes? Se eliminarán también los ficheros asociados en el almacenamiento.')) return;
    try {
      await deleteClientWithAssets(supabase, id);
      logAction(supabase, 'client_deleted', '/');
    } catch (err) {
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'desconocido'));
    }
    loadClients();
  };

  return (
    <div>
      {/* API key warning */}
      {!hasApiKey && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            Necesitas configurar tu <Link href="/settings" className="font-medium underline">API key de Anthropic</Link> para poder generar informes con IA.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <div className="flex gap-3">
          <Link href="/reports/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
            + Nuevo informe
          </Link>
          <button onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-corp text-white text-sm font-medium rounded-lg hover:bg-corp-dark">
            + Nuevo cliente
          </button>
        </div>
      </div>

      {/* Client grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">No hay clientes registrados</p>
          <button onClick={openCreate}
            className="px-4 py-2.5 bg-corp text-white text-sm font-medium rounded-lg hover:bg-corp-dark">
            Crear el primer cliente
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <Link href={`/clients/${c.id}`} className="block mb-4">
                <div className="flex items-start gap-4">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt={c.name} className="w-14 h-14 object-contain rounded-lg border border-gray-100" />
                  ) : (
                    <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl font-bold text-gray-300">{c.name.charAt(0)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                    {c.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{c.notes}</p>}
                    <div className="mt-2 flex gap-3 text-xs text-gray-400">
                      <span>{c.report_count} informe{c.report_count !== 1 ? 's' : ''}</span>
                      {c.last_report_date && <span>· Último: {formatDate(c.last_report_date)}</span>}
                    </div>
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <Link href={`/reports/new?client=${c.id}`}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-corp bg-corp-light rounded-md hover:bg-corp-light text-center">
                  + Informe
                </Link>
                <button onClick={() => openEdit(c)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100">
                  Editar
                </button>
                <button onClick={() => handleDelete(c.id)}
                  className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-md" title="Eliminar">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold mb-4">{editingClient ? 'Editar cliente' : 'Nuevo cliente'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre del cliente" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas opcionales" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="w-14 h-14 object-contain rounded-lg border" />
                  ) : (
                    <div className="w-14 h-14 bg-gray-100 rounded-lg" />
                  )}
                  <label className="cursor-pointer px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                    {logoPreview ? 'Cambiar' : 'Subir logo'}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); } }} />
                  </label>
                </div>
              </div>

              {/* Email recipients */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emails de contacto</label>
                <p className="text-xs text-gray-400 mb-2">Destinatarios para el envío de informes</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {contactEmails.map((email, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm">
                      {email}
                      <button onClick={() => setContactEmails(contactEmails.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="email" value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newContactEmail.trim()) {
                        e.preventDefault();
                        setContactEmails([...contactEmails, newContactEmail.trim()]);
                        setNewContactEmail('');
                      }
                    }}
                    placeholder="email@cliente.com"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <button type="button" onClick={() => {
                    if (newContactEmail.trim()) {
                      setContactEmails([...contactEmails, newContactEmail.trim()]);
                      setNewContactEmail('');
                    }
                  }} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Añadir</button>
                </div>
              </div>

              {/* File encryption password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña para ficheros</label>
                <p className="text-xs text-gray-400 mb-2">El archivo Excel adjunto se enviará encriptado con esta contraseña</p>
                <input type="text" value={filePassword} onChange={(e) => setFilePassword(e.target.value)}
                  placeholder="Contraseña de encriptación"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
              </div>

              {/* Email subject builder — declarative form */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asunto del email</label>
                <p className="text-xs text-gray-400 mb-3">
                  Elige qué partes incluir en el asunto cuando se envíe un informe a este cliente.
                </p>

                <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                  {/* Prefix */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Texto al principio (opcional)</label>
                    <input
                      type="text"
                      value={subjectConfig.prefix}
                      onChange={(e) => setSubjectConfig({ ...subjectConfig, prefix: e.target.value })}
                      placeholder="Ej: Informe"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>

                  {/* Included parts */}
                  <div>
                    <span className="block text-xs font-medium text-gray-600 mb-1.5">Incluir en el asunto</span>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={subjectConfig.includeTitle}
                          onChange={(e) => setSubjectConfig({ ...subjectConfig, includeTitle: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-corp focus:ring-corp"
                        />
                        Título del informe
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={subjectConfig.includePeriod}
                          onChange={(e) => setSubjectConfig({ ...subjectConfig, includePeriod: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-corp focus:ring-corp"
                        />
                        Periodo
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={subjectConfig.includeClientName}
                          onChange={(e) => setSubjectConfig({ ...subjectConfig, includeClientName: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-corp focus:ring-corp"
                        />
                        Nombre del cliente
                      </label>
                    </div>
                  </div>

                  {/* Separator */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Separador entre partes</label>
                    <select
                      value={subjectConfig.separator}
                      onChange={(e) => setSubjectConfig({ ...subjectConfig, separator: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      {SEPARATOR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Suffix */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Texto al final (opcional)</label>
                    <input
                      type="text"
                      value={subjectConfig.suffix}
                      onChange={(e) => setSubjectConfig({ ...subjectConfig, suffix: e.target.value })}
                      placeholder="Ej: (confidencial)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>

                  {/* Live preview */}
                  <div className="pt-2 border-t border-gray-200">
                    <span className="block text-xs font-medium text-gray-600 mb-1">Vista previa</span>
                    <div className="px-3 py-2 bg-white border border-gray-200 rounded text-sm text-gray-800 font-medium">
                      {renderSubjectFromConfig(subjectConfig, {
                        title: name.trim() || 'Nombre del informe',
                        period: 'MARZO 2026',
                        clientName: name.trim() || 'Nombre del cliente',
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Ejemplo usando periodo <em>MARZO 2026</em>. El título y el cliente se toman del informe enviado.
                    </p>
                  </div>
                </div>

                {/* Legacy template notice */}
                {editingClient?.email_subject_template && !editingClient?.email_subject_config && (
                  <p className="text-[11px] text-amber-600 mt-2">
                    Este cliente tenía una plantilla antigua con variables:{' '}
                    <code className="text-amber-700">{editingClient.email_subject_template}</code>.
                    Se reemplazará por el formulario de arriba al guardar.
                  </p>
                )}
              </div>
            </div>
            {saveError && (
              <div className="mt-4 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
                {saveError}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancelar</button>
              <button onClick={handleSave} disabled={!name.trim() || saving}
                className="px-4 py-2 text-sm font-medium bg-corp text-white rounded-lg hover:bg-corp-dark disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
