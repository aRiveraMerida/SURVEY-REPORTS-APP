'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { deleteClientWithAssets, extractStoragePath } from '@/lib/db/clients';
import { logAction } from '@/lib/db/access-logs';
import { formatDate } from '@/lib/utils/formatting';
import type { Client, EmailConfig } from '@/types/database';

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
  // Simple email config: subject line + optional HTML body.
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBodyHtml, setEmailBodyHtml] = useState('');
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
    setEmailSubject(''); setEmailBodyHtml('');
    setSaveError(null); setShowModal(true);
  };
  const openEdit = (c: Client) => {
    setEditingClient(c); setName(c.name); setNotes(c.notes || ''); setLogoFile(null); setLogoPreview(c.logo_url);
    setContactEmails(c.contact_emails || []); setNewContactEmail(''); setFilePassword(c.file_password || '');
    // Load email config from the structured JSONB column, or fall back to
    // the legacy text template for the subject.
    const cfg = c.email_subject_config as EmailConfig | null;
    setEmailSubject(cfg?.subject || c.email_subject_template || '');
    setEmailBodyHtml(cfg?.bodyHtml || '');
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

    const clientData = {
      name: name.trim(),
      notes: notes.trim() || null,
      logo_url: logoUrl,
      contact_emails: contactEmails,
      file_password: filePassword.trim() || null,
      email_subject_config: {
        subject: emailSubject.trim() || null,
        bodyHtml: emailBodyHtml.trim() || null,
      },
      email_subject_template: null,
    };

    let errMsg: string | null = null;

    if (editingClient) {
      const { error } = await supabase
        .from('clients')
        .update(clientData)
        .eq('id', editingClient.id);
      if (error) errMsg = error.message;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSaveError('No hay sesión activa. Vuelve a iniciar sesión.');
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from('clients')
        .insert({ ...clientData, created_by: user.id });
      if (error) {
        errMsg = error.message;
      } else {
        logAction(supabase, 'client_created', '/');
      }
    }

    if (errMsg) {
      const hint = /email_subject_config|email_subject_template|source_file/i.test(errMsg)
        ? ' Ejecuta el script supabase/migrations/apply-all.sql en el SQL editor de Supabase para crear las columnas y buckets necesarios.'
        : '';
      setSaveError(`Error al guardar el cliente: ${errMsg}${hint}`);
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

      {/* Create/Edit modal
          Layout: overlay → card with sticky header + scrollable body
          + sticky footer. The card takes up to 90vh on desktop and
          full-screen on mobile so the body never gets cut off by a
          tall form (which now includes the email subject builder). */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl shadow-xl flex flex-col max-h-screen sm:max-h-[90vh]">
            {/* Header (sticky) */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingClient ? 'Editar cliente' : 'Nuevo cliente'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body (scrollable) */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
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

                {/* Email customisation — simple subject + HTML body */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Personalización del email</label>
                  <p className="text-xs text-gray-400 mb-3">
                    Personaliza el asunto y el cuerpo del email que se envía con los informes de este cliente.
                    Usa <code className="text-gray-600">{'{title}'}</code>, <code className="text-gray-600">{'{period}'}</code> y <code className="text-gray-600">{'{clientName}'}</code> como variables.
                    Déjalos vacíos para usar el formato por defecto.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="Informe {title} — {period}"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cuerpo del email (HTML)</label>
                      <textarea
                        value={emailBodyHtml}
                        onChange={(e) => setEmailBodyHtml(e.target.value)}
                        rows={6}
                        placeholder={'<p>Adjunto encontrará el informe <strong>{title}</strong> del periodo {period}.</p>\n<p>Saludos cordiales.</p>'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-y"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        Escribe HTML o texto plano. Si lo dejas vacío se usará el cuerpo por defecto.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer (sticky) */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 bg-white sm:rounded-b-xl">
              {saveError && (
                <div className="mb-3 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
                  {saveError}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancelar</button>
                <button onClick={handleSave} disabled={!name.trim() || saving}
                  className="px-4 py-2 text-sm font-medium bg-corp text-white rounded-lg hover:bg-corp-dark disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
