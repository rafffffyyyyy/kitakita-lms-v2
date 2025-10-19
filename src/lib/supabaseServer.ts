// /lib/supabaseServer.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";
// import type { Database } from "@/lib/types/supabase"; // <- if you have generated types

/**
 * Robust cookie bridge for @supabase/ssr that works across Next 14/15
 * and avoids the "cookies() returns Promise" TS error in some setups.
 */
export function getRlsServerClient(/* <Database> generic if you have it */) {
  // ❗ Do NOT hold cookies() in a variable — some projects get a Promise type here.
  const getStore = () => (nextCookies as unknown as () => any)();

  // If you have DB types, use: createServerClient<Database>(...)
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const store = getStore();
          return store?.get?.(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          const store = getStore();
          store?.set?.({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          const store = getStore();
          store?.set?.({ name, value: "", ...options });
        },
      },
    }
  );
}
