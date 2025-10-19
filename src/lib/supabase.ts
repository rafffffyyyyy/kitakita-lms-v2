// src/lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Keep exactly ONE client in the browser (even across HMR)
const g = globalThis as unknown as { __sb?: SupabaseClient };
export const supabase =
  g.__sb ??
  createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
g.__sb ??= supabase;

/* ---------- DEVTOOLS HOOK (dev only) ---------- */
declare global {
  interface Window {
    __SB__?: SupabaseClient;
    __SUPABASE_CREATED__?: boolean;
  }
}

// Optional: confirm only one is created + expose for console debugging
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  window.__SB__ = supabase;
  if (!window.__SUPABASE_CREATED__) {
    window.__SUPABASE_CREATED__ = true;
    console.log("[supabase] client created once");
  }
}
