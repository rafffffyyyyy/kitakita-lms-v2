// /app/api/admin/delete-auth-user/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * IMPORTANT:
 *  - Add SUPABASE_SERVICE_ROLE_KEY to your env (Vercel/Local).
 *  - Never expose it to the client. This file runs on the server only.
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // (Optional) Light auth check – only allow logged-in callers:
    // If you want to restrict to admins/owners, add your own check here.
    // For minimal change per your request, we skip strict role checks.

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected server error." },
      { status: 500 }
    );
  }
}
