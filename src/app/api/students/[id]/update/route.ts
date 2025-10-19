import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: { id: string } };
type Body = {
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  lrn?: string;
  section_id?: number;        // optional direct id
  section_name?: string;      // or name to resolve on server (case-insensitive)
};

export async function POST(req: Request, { params }: Params) {
  const studentId = params.id;

  try {
    const payload = (await req.json()) as Body;

    // --- AuthN: read access token from Authorization header
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // --- RLS client that impersonates caller for role checks
    const rls = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const {
      data: { user: caller },
      error: getUserErr,
    } = await rls.auth.getUser();

    if (getUserErr || !caller) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // --- AuthZ: admin → allow; teacher → allow only if owns the student
    const { data: adminRow, error: adminErr } = await rls
      .from("admins")
      .select("id")
      .eq("id", caller.id)
      .maybeSingle();
    if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });

    let allowed = !!adminRow;

    if (!allowed) {
      const { data: teacherRow, error: teacherErr } = await rls
        .from("teachers")
        .select("id")
        .eq("id", caller.id)
        .maybeSingle();
      if (teacherErr) {
        return NextResponse.json({ error: teacherErr.message }, { status: 500 });
      }

      if (teacherRow) {
        const { data: stu, error: stuErr } = await rls
          .from("students")
          .select("teacher_id")
          .eq("id", studentId)
          .single();
        if (stuErr) {
          return NextResponse.json({ error: stuErr.message }, { status: 404 });
        }
        allowed = stu?.teacher_id === caller.id;
      }
    }

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // --- Use service-role client to actually update (bypass RLS after our checks)
    const admin = createSupabaseAdmin();

    // Resolve section id if needed
    let resolvedSectionId: number | undefined = payload.section_id;
    if (resolvedSectionId === undefined && payload.section_name?.trim()) {
      const { data: sec, error: secErr } = await admin
        .from("sections")
        .select("id")
        .ilike("name", payload.section_name.trim())
        .maybeSingle();

      if (secErr) {
        return NextResponse.json({ error: secErr.message }, { status: 400 });
      }
      if (!sec) {
        return NextResponse.json({ error: "Invalid section name." }, { status: 400 });
      }
      resolvedSectionId = sec.id;
    }

    // Build update object; keep your "username mirrors LRN" rule
    const updates: Record<string, any> = {};
    if (payload.first_name !== undefined) updates.first_name = payload.first_name;
    if (payload.middle_name !== undefined) updates.middle_name = payload.middle_name || null;
    if (payload.last_name !== undefined) updates.last_name = payload.last_name;
    if (payload.lrn !== undefined) {
      updates.lrn = payload.lrn;
      updates.username = payload.lrn; // mirror
    }
    if (resolvedSectionId !== undefined) updates.section_id = resolvedSectionId;

    // No-op guard
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, noop: true });
    }

    const { error: updErr } = await admin
      .from("students")
      .update(updates)
      .eq("id", studentId);

    if (updErr) {
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
