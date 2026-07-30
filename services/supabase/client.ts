// Lazily-created supabase-js singleton. Only touched when the supabase adapter is
// actually selected (VITE_DATA_BACKEND=supabase) and a method runs — so a default
// `mock` build never constructs a client nor requires the env vars.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (requeridas con VITE_DATA_BACKEND=supabase).',
    );
  }
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
