import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createBrowserClient(url, key);
}

// Lazy singleton — only created on first access, not on import
let _client: ReturnType<typeof createClient> | null = null;
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    if (!_client) _client = createClient();
    const value = (_client as any)[prop];
    return typeof value === "function" ? value.bind(_client) : value;
  },
});
