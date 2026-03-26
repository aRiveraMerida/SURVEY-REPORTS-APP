import { createClient } from '@/lib/supabase/client';
import type { EmitterSettings } from '@/types/database';

export async function getEmitterSettings(): Promise<EmitterSettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('emitter_settings')
    .select('*')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function updateEmitterSettings(
  id: string,
  updates: Partial<Omit<EmitterSettings, 'id'>>
): Promise<EmitterSettings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('emitter_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createEmitterSettings(
  settings: Omit<EmitterSettings, 'id' | 'updated_at'>
): Promise<EmitterSettings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('emitter_settings')
    .insert(settings)
    .select()
    .single();

  if (error) throw error;
  return data;
}
