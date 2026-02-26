import { createClient } from '@/lib/supabase/client';
import type { Client } from '@/types/database';

const supabase = createClient();

export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getClient(id: string): Promise<Client | null> {
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
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadLogo(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('logos')
    .upload(fileName, file, { upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('logos').getPublicUrl(fileName);
  return data.publicUrl;
}

