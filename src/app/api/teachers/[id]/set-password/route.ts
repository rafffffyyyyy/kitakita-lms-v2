import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: { id: string } };
type Body = { password: string };

export async function POST(req: Request, { params }: Params) {
  const teacherId = params.id;
  try {
    const { password } = (await req.json()) as Body;

    // Basic guard (adjust to your policy)
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // ---- AuthN: bearer from admin UI
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    // ---- AuthZ: caller must be an admin (RLS client)
    const rls = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: adminRow, error: adminErr } = await rls
      .from("admins")
      .select("id")
      .eq("id", (await rls.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();
    if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });
    if (!adminRow) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    // ---- Service-role: update password in Auth
    const admin = createSupabaseAdmin();

    // (Helpful: verify the auth user exists before update)
    const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(teacherId);
    if (getErr) return NextResponse.json({ error: getErr.message }, { status: 400 });
    if (!authUser) {
      return NextResponse.json({ error: "Auth user not found for this teacher." }, { status: 404 });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(teacherId, { password });
    if (updErr) {
      // Surface exact GoTrue message (e.g. “Password should be at least 6 characters”)
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected server error." },
      { status: 500 }
    );
  }
}
