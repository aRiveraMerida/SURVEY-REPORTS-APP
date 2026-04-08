import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Report } from '@/types/database';

export async function getReport(id: string): Promise<Report | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('reports').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/**
 * Delete a report row AND its associated source file from storage, if any.
 * Storage cleanup is best-effort — if it fails we still delete the row and
 * log a warning, so the UI doesn't get stuck on a broken file.
 */
export async function deleteReportWithAssets(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  // Look up the source file path before deleting the row
  const { data: report } = await supabase
    .from('reports')
    .select('source_file_path')
    .eq('id', id)
    .single();

  if (report?.source_file_path) {
    const { error: storageErr } = await supabase
      .storage
      .from('source-files')
      .remove([report.source_file_path]);
    if (storageErr) {
      console.warn(`Storage cleanup failed for report ${id}:`, storageErr.message);
    }
  }

  const { error } = await supabase.from('reports').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteReport(id: string): Promise<void> {
  const supabase = createClient();
  return deleteReportWithAssets(supabase, id);
}
