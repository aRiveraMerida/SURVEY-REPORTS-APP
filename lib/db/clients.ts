import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Client } from '@/types/database';

/**
 * Extract the storage object path from a Supabase public URL.
 * Returns null if the URL doesn't look like a Supabase public object URL.
 *
 * Example:
 *   https://xyz.supabase.co/storage/v1/object/public/logos/clients/123.png
 *     → "clients/123.png"
 */
export function extractStoragePath(publicUrl: string | null, bucket: string): string | null {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}

export async function getClients(): Promise<Client[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createClientRecord(
  name: string,
  logoUrl: string | null
): Promise<Client> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('clients')
    .insert({ name, logo_url: logoUrl, created_by: user?.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateClient(
  id: string,
  updates: { name?: string; logo_url?: string | null }
): Promise<Client> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteClient(id: string): Promise<void> {
  const supabase = createClient();
  return deleteClientWithAssets(supabase, id);
}

/**
 * Delete a client, all its reports, and every file they reference in
 * Supabase Storage (source files + client logo). Storage cleanup is
 * best-effort; DB deletion is authoritative.
 */
export async function deleteClientWithAssets(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  // 1. Collect every source file belonging to this client's reports
  const { data: reports } = await supabase
    .from('reports')
    .select('source_file_path')
    .eq('client_id', id);

  const sourcePaths = (reports || [])
    .map((r: { source_file_path: string | null }) => r.source_file_path)
    .filter((p: string | null): p is string => !!p);

  if (sourcePaths.length > 0) {
    const { error: srcErr } = await supabase.storage.from('source-files').remove(sourcePaths);
    if (srcErr) console.warn('source-files cleanup failed:', srcErr.message);
  }

  // 2. Client logo (best-effort — the URL may point to an external host)
  const { data: client } = await supabase
    .from('clients')
    .select('logo_url')
    .eq('id', id)
    .single();

  const logoPath = extractStoragePath(client?.logo_url || null, 'logos');
  if (logoPath) {
    const { error: logoErr } = await supabase.storage.from('logos').remove([logoPath]);
    if (logoErr) console.warn('logo cleanup failed:', logoErr.message);
  }

  // 3. Delete the client row — reports cascade via FK ON DELETE CASCADE
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadLogo(file: File, folder: string): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('logos')
    .upload(fileName, file, { upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('logos').getPublicUrl(fileName);
  return data.publicUrl;
}

