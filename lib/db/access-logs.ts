import { SupabaseClient } from '@supabase/supabase-js';

const LOG_COOLDOWN_KEY = 'last_access_log_ts';
const LOG_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Log an access event. Deduplicates to one log per 30 min window.
 */
export async function logAccess(
  supabase: SupabaseClient,
  path: string,
  action: string = 'page_view'
) {
  if (typeof window === 'undefined') return;

  // Deduplication: skip if logged recently
  const lastLog = localStorage.getItem(LOG_COOLDOWN_KEY);
  if (lastLog && Date.now() - parseInt(lastLog, 10) < LOG_COOLDOWN_MS) {
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return;

  await supabase.from('access_logs').insert({
    user_id: user.id,
    user_email: user.email,
    action,
    path,
    user_agent: navigator.userAgent,
  });

  localStorage.setItem(LOG_COOLDOWN_KEY, Date.now().toString());
}

/**
 * Log a specific action (bypasses cooldown for important events).
 */
export async function logAction(
  supabase: SupabaseClient,
  action: string,
  path: string
) {
  if (typeof window === 'undefined') return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return;

  await supabase.from('access_logs').insert({
    user_id: user.id,
    user_email: user.email,
    action,
    path,
    user_agent: navigator.userAgent,
  });
}

/**
 * Get access logs with pagination.
 */
export async function getAccessLogs(
  supabase: SupabaseClient,
  page: number = 1,
  pageSize: number = 50
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('access_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  return { data: data || [], error, total: count || 0 };
}
