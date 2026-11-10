// Public Supabase settings. The anon key is meant to be public: the database only lets it
// call the PIN-checked functions in supabase/schema.sql, never read tables directly.
// Fill these in from Supabase → Project Settings → API (Project URL and anon/publishable key).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
