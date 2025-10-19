import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";

/**
 * Your UserContext already POSTs here with { event, session }.
 * This writes the Supabase sb-* cookies on the server so API routes see the user.
 */
export async function POST(req: Request) {
  const { event, session } = await req.json();

  const cookieStore = await cookies(); // Next 15
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptionsWithName) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptionsWithName) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        },
      },
    }
  );

  switch (event) {
    case "INITIAL_SESSION":
    case "SIGNED_IN":
    case "TOKEN_REFRESHED":
    case "USER_UPDATED":
      if (session?.access_token && session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }
      break;
    case "SIGNED_OUT":
      await supabase.auth.signOut();
      break;
  }

  return NextResponse.json({ ok: true });
}
