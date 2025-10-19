"use server";

import "server-only";
import { cookies } from "next/headers";
import {
  createServerClient,
  type CookieOptionsWithName,
} from "@supabase/ssr";

/** Server-side Supabase client (RLS-safe) for Next.js 15 */
export async function createRLSClient() {
  const cookieStore = await cookies(); // <-- await in Next 15

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptionsWithName) {
          // Will throw in read-only contexts (plain Server Components)
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // no-op in read-only contexts
          }
        },
        remove(name: string, options: CookieOptionsWithName) {
          // Will throw in read-only contexts (plain Server Components)
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // no-op in read-only contexts
          }
        },
      },
    }
  );
}
