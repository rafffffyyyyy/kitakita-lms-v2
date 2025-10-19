// /app/api/students/reset-password/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const { studentId, newPassword } = await req.json();
    if (!studentId || !newPassword) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Find student's auth_user_id
    const { data: stu, error: stuErr } = await admin
      .from("students")
      .select("auth_user_id")
      .eq("id", studentId)
      .single();

    if (stuErr || !stu?.auth_user_id) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // 2) Update password in Auth
    const { error: updErr } = await admin.auth.admin.updateUserById(stu.auth_user_id, {
      password: newPassword,
    });

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    // (Optional) also store plaintext password in students.password if you insist
    // Consider removing or hashing for security.
    await admin.from("students").update({ password: newPassword }).eq("id", studentId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
