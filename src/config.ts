// Public Supabase settings. Both values are safe to publish: the publishable key can only call the
// PIN-checked functions in supabase/schema.sql, never read or write tables directly.
// (Never put the "secret" / service_role key here.)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://xkqgfylssnjktyqlnpnf.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_R19NvITTVzU6G2KIHcwqiw_HAmSeAN2';
