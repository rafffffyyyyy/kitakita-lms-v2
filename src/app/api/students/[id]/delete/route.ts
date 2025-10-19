import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: { id: string } };

export async function DELETE(req: Request, { params }: Params) {
  const studentId = params.id;

  try {
    // 1) AuthN via access token header from client
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    // 2) RLS client impersonating the caller
    const rls = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Who is the caller?
    const { data: { user: caller }, error: getUserErr } = await rls.auth.getUser();
    if (getUserErr || !caller) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    // 3) AuthZ: admin → allowed; teacher → allowed only if owns student
    const { data: adminRow, error: adminErr } =
      await rls.from("admins").select("id").eq("id", caller.id).maybeSingle();
    if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });

    let allowed = !!adminRow;

    if (!allowed) {
      const { data: teacherRow, error: teacherErr } =
        await rls.from("teachers").select("id").eq("id", caller.id).maybeSingle();
      if (teacherErr) return NextResponse.json({ error: teacherErr.message }, { status: 500 });

      if (teacherRow) {
        const { data: stu, error: stuErr } =
          await rls.from("students").select("teacher_id").eq("id", studentId).single();
        if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 404 });
        allowed = stu?.teacher_id === caller.id;
      }
    }

    if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    // 4) App data delete first (cascade your child tables as needed)
    //    Make sure foreign keys to students use ON DELETE CASCADE or manually delete children first.
    const { error: delStudentErr } = await rls.from("students").delete().eq("id", studentId);
    if (delStudentErr) return NextResponse.json({ error: delStudentErr.message }, { status: 400 });

    // 5) Delete the Supabase Auth user (service role)
    const admin = createSupabaseAdmin();
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(studentId);
    if (delAuthErr) {
      // App row was removed; Auth removal failed → return warning for manual follow-up.
      return NextResponse.json(
        { ok: false, warning: `Student row deleted, but failed to remove Auth user: ${delAuthErr.message}` },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected server error." }, { status: 500 });
  }
}
