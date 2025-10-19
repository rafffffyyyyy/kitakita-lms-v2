// /app/api/admin/delete-teacher/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // NOT public

type Body = {
  adminId: string;
  teacherId: string;
  deleteAuth?: boolean;
};

export async function POST(req: Request) {
  try {
    if (!URL || !SERVICE_KEY) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }
    const svc = createClient(URL, SERVICE_KEY);

    const { adminId, teacherId, deleteAuth } = (await req.json()) as Body;

    if (!adminId || !teacherId) {
      return NextResponse.json({ error: "adminId and teacherId are required" }, { status: 400 });
    }
    if (adminId === teacherId) {
      return NextResponse.json({ error: "Cannot delete yourself." }, { status: 400 });
    }

    // verify admin
    const { data: adminRow, error: adminErr } = await svc
      .from("admins")
      .select("id")
      .eq("id", adminId)
      .maybeSingle();
    if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 400 });
    if (!adminRow) return NextResponse.json({ error: "Not an admin" }, { status: 403 });

    // verify teacher belongs to admin
    const { data: teacherRow, error: teacherErr } = await svc
      .from("teachers")
      .select("id, admin_id")
      .eq("id", teacherId)
      .maybeSingle();

    if (teacherErr) return NextResponse.json({ error: teacherErr.message }, { status: 400 });
    if (!teacherRow) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    if (teacherRow.admin_id !== adminId) {
      return NextResponse.json({ error: "Teacher does not belong to this admin" }, { status: 403 });
    }

    // delete quarters first (avoid FK issues if you have cascades off)
    const { error: qErr } = await svc.from("quarters").delete().eq("teacher_id", teacherId);
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });

    // delete teacher row
    const { error: tErr } = await svc.from("teachers").delete().eq("id", teacherId);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });

    // optional: delete profile & auth user
    if (deleteAuth) {
      const { error: pErr } = await svc.from("profiles").delete().eq("id", teacherId);
      if (pErr) {
        // profile deletion is nice-to-have; surface but don't rollback
        return NextResponse.json({ error: `Teacher deleted, but profile removal failed: ${pErr.message}` }, { status: 207 });
      }

      const { error: delUserErr } = await svc.auth.admin.deleteUser(teacherId);
      if (delUserErr) {
        return NextResponse.json({ error: `Teacher deleted, but auth user removal failed: ${delUserErr.message}` }, { status: 207 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
