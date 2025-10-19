import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: { id: string } };
type Body = { password: string; storeInStudents?: boolean };

export async function POST(req: Request, { params }: Params) {
  const studentId = params.id;

  try {
    const { password, storeInStudents = true } = (await req.json()) as Body;
    if (!password || password.length < 4) {
      return NextResponse.json({ error: "Password is required (min 4 chars)." }, { status: 400 });
    }

    // ---- AuthN: read access token from header
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // ---- Create an RLS client that impersonates the caller via Authorization header
    const rls = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Confirm caller identity
    const {
      data: { user: caller },
      error: sessionErr,
    } = await rls.auth.getUser();
    if (sessionErr || !caller) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const callerId = caller.id;

    // ---- AuthZ: admin OR teacher who owns the student
    const { data: isAdmin, error: adminErr } = await rls
      .from("admins")
      .select("id")
      .eq("id", callerId)
      .maybeSingle();
    if (adminErr) {
      return NextResponse.json({ error: adminErr.message }, { status: 500 });
    }

    let allowed = !!isAdmin;

    if (!allowed) {
      const { data: isTeacher, error: teacherErr } = await rls
        .from("teachers")
        .select("id")
        .eq("id", callerId)
        .maybeSingle();
      if (teacherErr) {
        return NextResponse.json({ error: teacherErr.message }, { status: 500 });
      }

      if (isTeacher) {
        const { data: studentRow, error: studentErr } = await rls
          .from("students")
          .select("teacher_id")
          .eq("id", studentId)
          .single();
        if (studentErr) {
          return NextResponse.json({ error: studentErr.message }, { status: 404 });
        }
        allowed = studentRow?.teacher_id === callerId;
      }
    }

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // ---- Set the new password in Supabase Auth (Admin API)
    const admin = createSupabaseAdmin();
    const { error: adminUpdateErr } = await admin.auth.admin.updateUserById(
      studentId,
      { password }
    );
    if (adminUpdateErr) {
      return NextResponse.json(
        { error: `Auth update failed: ${adminUpdateErr.message}` },
        { status: 400 }
      );
    }

    // ---- Mirror to students table (per your rule)
    if (storeInStudents) {
      const { error: stuUpdateErr } = await rls
        .from("students")
        .update({ password })
        .eq("id", studentId);

      if (stuUpdateErr) {
        return NextResponse.json(
          {
            ok: false,
            warning:
              "Password changed in Auth, but updating students.password failed.",
            dbError: stuUpdateErr.message,
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected server error." },
      { status: 500 }
    );
  }
}
