import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a user-scoped server client. Only the public anon key is used; the
 * caller's bearer token is forwarded so Postgres auth.uid() and RLS apply.
 */
export function createRequestSupabaseClient(
  authorization: string,
): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: authorization },
    },
  });
}
