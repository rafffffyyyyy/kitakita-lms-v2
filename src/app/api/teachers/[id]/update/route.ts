import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const teacherId = params.id;

  // Parse body (names only)
  const { first_name, middle_name, last_name } = await req.json().catch(() => ({} as any));

  if (!first_name || !last_name) {
    return NextResponse.json({ error: "first_name and last_name are required." }, { status: 400 });
  }

  // 🔧 Get bearer token from the request (no next/headers)
  const authHeader = req.headers.get("authorization") ?? "";

  // Build a Supabase client that honors the Bearer token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // Identify caller
  const { data: me, error: meErr } = await supabase.auth.getUser();
  if (meErr || !me?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Authorize: caller must be an admin
  const { data: adminRow, error: adminErr } = await supabase
    .from("admins")
    .select("id")
    .eq("id", me.user.id)
    .maybeSingle();

  if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });
  if (!adminRow) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  // Update teachers table
  const { error: tErr } = await supabase
    .from("teachers")
    .update({
      first_name,
      middle_name: middle_name ?? null,
      last_name,
    })
    .eq("id", teacherId);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });

  // (Optional) keep profiles in sync
  const { error: pErr } = await supabase
    .from("profiles")
    .update({
      first_name,
      middle_name: middle_name ?? null,
      last_name,
    })
    .eq("id", teacherId);

  if (pErr) {
    return NextResponse.json({ ok: true, warning: `Updated teacher, but profiles failed: ${pErr.message}` });
  }

  return NextResponse.json({ ok: true });
}
