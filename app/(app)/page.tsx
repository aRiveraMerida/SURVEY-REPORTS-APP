'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { logAction } from '@/lib/db/access-logs';
import { formatDate } from '@/lib/utils/formatting';
import type { Client } from '@/types/database';

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
  const [saving, setSaving] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    setHasApiKey(!!localStorage.getItem('claude_api_key'));
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('clients').select('*').order('name');
    if (!data) { setLoading(false); return; }

    const withStats: ClientWithStats[] = await Promise.all(
      data.map(async (client) => {
        const { count } = await supabase
          .from('reports').select('*', { count: 'exact', head: true }).eq('client_id', client.id);
        const { data: lastReport } = await supabase
          .from('reports').select('created_at').eq('client_id', client.id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        return { ...client, report_count: count || 0, last_report_date: lastReport?.created_at || null };
      })
    );
    setClients(withStats);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const openCreate = () => {
    setEditingClient(null); setName(''); setNotes(''); setLogoFile(null); setLogoPreview(null); setShowModal(true);
  };
  const openEdit = (c: Client) => {
    setEditingClient(c); setName(c.name); setNotes(c.notes || ''); setLogoFile(null); setLogoPreview(c.logo_url); setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    let logoUrl = editingClient?.logo_url || null;
    if (logoFile) {
      const ext = logoFile.name.split('.').pop();
      const fileName = `clients/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('logos').upload(fileName, logoFile, { upsert: true });
      if (!error) { logoUrl = supabase.storage.from('logos').getPublicUrl(fileName).data.publicUrl; }
    }
    if (editingClient) {
      await supabase.from('clients').update({ name: name.trim(), notes: notes.trim() || null, logo_url: logoUrl }).eq('id', editingClient.id);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('clients').insert({ name: name.trim(), notes: notes.trim() || null, logo_url: logoUrl, created_by: user?.id });
      logAction(supabase, 'client_created', '/');
    }
    setSaving(false); setShowModal(false); loadClients();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cliente y todos sus informes?')) return;
    await supabase.from('clients').delete().eq('id', id);
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
            </div>
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
