'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { EmitterSettings } from '@/types/database';

export default function SettingsPage() {
  const [settings, setSettings] = useState<EmitterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [phones, setPhones] = useState<string[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [web, setWeb] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [addresses, setAddresses] = useState('');

  // SMTP settings
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  // API key
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'valid' | 'invalid' | null>(null);

  // Tag inputs
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const supabase = createClient();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('emitter_settings')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      alert('Error al cargar configuración: ' + error.message);
    }

    if (data) {
      setSettings(data);
      setCompanyName(data.company_name || '');
      setLogoPreview(data.logo_url);
      setPhones(data.footer_phones || []);
      setEmails(data.footer_emails || []);
      setWeb(data.footer_web || '');
      setLinkedin(data.footer_linkedin || '');
      setAddresses((data.footer_addresses || []).join('\n'));
      setSmtpHost(data.smtp_host || '');
      setSmtpPort(String(data.smtp_port || 587));
      setSmtpUser(data.smtp_user || '');
      setSmtpPass(data.smtp_pass || '');
      setSmtpFrom(data.smtp_from || '');
    }

    // Load API key from localStorage
    const savedKey = localStorage.getItem('claude_api_key');
    if (savedKey) setApiKey(savedKey);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage(null);

    let logoUrl = settings?.logo_url || null;

    if (logoFile) {
      const ext = logoFile.name.split('.').pop();
      const fileName = `emitter/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, logoFile, { upsert: true });

      if (!uploadError) {
        const { data } = supabase.storage.from('logos').getPublicUrl(fileName);
        logoUrl = data.publicUrl;
      }
    }

    const updates = {
      company_name: companyName,
      logo_url: logoUrl,
      footer_phones: phones,
      footer_emails: emails,
      footer_web: web || null,
      footer_linkedin: linkedin || null,
      footer_addresses: addresses.split('\n').filter(Boolean),
      smtp_host: smtpHost.trim() || null,
      smtp_port: parseInt(smtpPort) || 587,
      smtp_user: smtpUser.trim() || null,
      smtp_pass: smtpPass.trim() || null,
      smtp_from: smtpFrom.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (settings?.id) {
      const { error } = await supabase
        .from('emitter_settings')
        .update(updates)
        .eq('id', settings.id);

      if (error) {
        setMessage({ type: 'error', text: 'Error al guardar: ' + error.message });
      } else {
        setMessage({ type: 'success', text: 'Guardado correctamente' });
      }
    }

    setSaving(false);
  };

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('claude_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('claude_api_key');
    }
    setMessage({ type: 'success', text: 'API key guardada localmente' });
  };

  const handleVerifyKey = async () => {
    if (!apiKey.trim()) return;
    setVerifyingKey(true);
    setKeyStatus(null);

    try {
      // Proxy the verification through our server so we don't expose
      // the key to the browser via the dangerous direct-browser-access
      // header.
      const response = await fetch('/api/verify-anthropic-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const result = await response.json();
      setKeyStatus(result.valid ? 'valid' : 'invalid');
    } catch {
      setKeyStatus('invalid');
    }

    setVerifyingKey(false);
  };

  const handleExport = async () => {
    const { data: clients } = await supabase.from('clients').select('*');
    const { data: reports } = await supabase.from('reports').select('*');
    const { data: emitter } = await supabase.from('emitter_settings').select('*');

    const backup = {
      exportedAt: new Date().toISOString(),
      emitter_settings: emitter,
      clients,
      reports,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey-reports-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addPhone = () => {
    if (newPhone.trim()) {
      setPhones([...phones, newPhone.trim()]);
      setNewPhone('');
    }
  };

  const addEmail = () => {
    if (newEmail.trim()) {
      setEmails([...emails, newEmail.trim()]);
      setNewEmail('');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Cargando configuración...</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

      {message && (
        <div
          className={`mb-6 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Section 1: Emitter Settings */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Empresa emisora</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la empresa</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-corp focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-16 h-16 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300 text-sm">Logo</div>
              )}
              <label className="cursor-pointer px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                {logoPreview ? 'Cambiar' : 'Subir logo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }
                  }}
                />
              </label>
            </div>
          </div>

          {/* Phones */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfonos</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {phones.map((phone, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm">
                  {phone}
                  <button onClick={() => setPhones(phones.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPhone())}
                placeholder="973 22 87 05 (LLEIDA)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button onClick={addPhone} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Añadir</button>
            </div>
          </div>

          {/* Emails */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Emails</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {emails.map((email, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm">
                  {email}
                  <button onClick={() => setEmails(emails.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                placeholder="movimer@movimer.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button onClick={addEmail} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Añadir</button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Web</label>
            <input
              type="text"
              value={web}
              onChange={(e) => setWeb(e.target.value)}
              placeholder="www.movimer.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn</label>
            <input
              type="text"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="LinkedIn: Movimer World"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Direcciones</label>
            <textarea
              value={addresses}
              onChange={(e) => setAddresses(e.target.value)}
              rows={3}
              placeholder="Una dirección por línea"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
            />
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-corp text-white rounded-lg hover:bg-corp-dark disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </section>

      {/* Section 2: Claude API Key */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">API key de Claude</h2>
        <p className="text-sm text-gray-500 mb-4">
          Tu clave de API de Anthropic (Claude). <strong>Es obligatoria</strong> para que la IA analice los datos y genere informes.
        </p>

        <div className="space-y-3">
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setKeyStatus(null); }}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-lg text-sm font-mono"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleVerifyKey}
              disabled={!apiKey.trim() || verifyingKey}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {verifyingKey ? 'Verificando...' : 'Verificar clave'}
            </button>
            <button
              onClick={handleSaveApiKey}
              className="px-3 py-1.5 text-sm bg-corp text-white rounded-lg hover:bg-corp-dark"
            >
              Guardar
            </button>

            {keyStatus === 'valid' && (
              <span className="text-sm text-green-600">Clave válida</span>
            )}
            {keyStatus === 'invalid' && (
              <span className="text-sm text-red-600">Clave inválida o sin saldo</span>
            )}
          </div>

          <p className="text-xs text-gray-400">
            La clave se guarda solo en tu navegador (localStorage). No se sube al servidor.
          </p>
        </div>
      </section>

      {/* Section 3: SMTP */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Configuración SMTP</h2>
        <p className="text-sm text-gray-500 mb-4">
          Servidor de correo para el envío de informes a clientes. Se guarda en la base de datos.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Host SMTP</label>
              <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Puerto</label>
              <input type="text" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
              <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="usuario@empresa.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <div className="relative">
                <input type={showSmtpPass ? 'text' : 'password'} value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="Contraseña SMTP"
                  className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg text-sm" />
                <button onClick={() => setShowSmtpPass(!showSmtpPass)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                  {showSmtpPass ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email remitente (From)</label>
            <input type="email" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)}
              placeholder="informes@empresa.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
                  setMessage({ type: 'error', text: 'Completa todos los campos SMTP antes de probar.' });
                  return;
                }
                setTestingSmtp(true);
                try {
                  const res = await fetch('/api/send-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'test-smtp' }),
                  });
                  const result = await res.json();
                  setMessage({ type: res.ok ? 'success' : 'error', text: result.message || result.error });
                } catch {
                  setMessage({ type: 'error', text: 'Error al conectar con el servidor.' });
                }
                setTestingSmtp(false);
              }}
              disabled={testingSmtp || !smtpHost}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {testingSmtp ? 'Probando...' : 'Probar conexión'}
            </button>
            <p className="text-xs text-gray-400">
              Guarda primero la configuración y luego prueba la conexión.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: Backup */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Backup</h2>

        <div className="space-y-3">
          <button
            onClick={handleExport}
            className="w-full px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            Exportar todos los datos
            <span className="block text-xs text-gray-400 mt-0.5">
              Descarga un JSON con clientes e informes
            </span>
          </button>

          <label className="block w-full px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-left">
            Importar datos
            <span className="block text-xs text-gray-400 mt-0.5">
              Restaurar desde un backup JSON
            </span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                // Reset input so selecting the same file twice re-triggers
                e.target.value = '';

                try {
                  const text = await file.text();
                  let backup: unknown;
                  try {
                    backup = JSON.parse(text);
                  } catch {
                    setMessage({ type: 'error', text: 'El fichero no es un JSON válido.' });
                    return;
                  }

                  // Schema validation — check shape before touching the DB
                  if (!backup || typeof backup !== 'object') {
                    setMessage({ type: 'error', text: 'El backup no es un objeto JSON.' });
                    return;
                  }
                  const b = backup as { clients?: unknown; reports?: unknown; emitter_settings?: unknown };

                  const clients = Array.isArray(b.clients) ? b.clients : [];
                  const reports = Array.isArray(b.reports) ? b.reports : [];

                  // Per-record shape check: each must have an id and look
                  // like the right entity. Drop invalid entries and count
                  // them so the user knows what will happen.
                  type Row = { id?: unknown; name?: unknown; title?: unknown; client_id?: unknown };
                  const validClients = (clients as Row[]).filter(
                    (c) => c && typeof c.id === 'string' && typeof c.name === 'string'
                  );
                  const validReports = (reports as Row[]).filter(
                    (r) => r && typeof r.id === 'string' && typeof r.title === 'string' && typeof r.client_id === 'string'
                  );
                  const droppedClients = clients.length - validClients.length;
                  const droppedReports = reports.length - validReports.length;

                  if (validClients.length === 0 && validReports.length === 0) {
                    setMessage({ type: 'error', text: 'El backup no contiene clientes ni informes válidos.' });
                    return;
                  }

                  // Preview + confirmation. upsert OVERWRITES existing rows
                  // with matching id, so we make that explicit.
                  const preview =
                    `Vas a importar:\n` +
                    `  • ${validClients.length} clientes\n` +
                    `  • ${validReports.length} informes\n\n` +
                    (droppedClients > 0 || droppedReports > 0
                      ? `Se descartarán ${droppedClients} clientes y ${droppedReports} informes por esquema inválido.\n\n`
                      : '') +
                    `Los registros con el mismo id SOBRESCRIBIRÁN los existentes.\n\n¿Continuar?`;
                  if (!confirm(preview)) return;

                  // Upsert — sequential to surface the first DB error cleanly
                  for (const client of validClients) {
                    const { error } = await supabase.from('clients').upsert(client as object);
                    if (error) {
                      setMessage({ type: 'error', text: `Error importando cliente: ${error.message}` });
                      return;
                    }
                  }
                  for (const report of validReports) {
                    const { error } = await supabase.from('reports').upsert(report as object);
                    if (error) {
                      setMessage({ type: 'error', text: `Error importando informe: ${error.message}` });
                      return;
                    }
                  }

                  setMessage({
                    type: 'success',
                    text: `Importados ${validClients.length} clientes y ${validReports.length} informes.`,
                  });
                } catch {
                  setMessage({ type: 'error', text: 'Error al importar. Verifica el formato del archivo.' });
                }
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
