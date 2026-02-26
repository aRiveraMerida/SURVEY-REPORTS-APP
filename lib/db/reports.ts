import { createClient } from '@/lib/supabase/client';
import type { Report } from '@/types/database';

const supabase = createClient();

export async function getReport(id: string): Promise<Report | null> {
  const { data, error } = await supabase
    .from('reports').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from('reports').delete().eq('id', id);
  if (error) throw error;
}
