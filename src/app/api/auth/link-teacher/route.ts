import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { teacherId, email, password } = await req.json() as {
      teacherId: string;
      email: string;
      password: string;
    };

    if (!teacherId || !email || !password) {
      return NextResponse.json({ error: "teacherId, email, password required." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();

    // find or create user
    let userId: string | null = null;

    // try to find by email (auth.users)
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) throw listErr;
    const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "teacher" },
      });
      if (createErr) throw createErr;
      userId = created.user?.id ?? null;
    }

    if (!userId) throw new Error("Failed to provision auth user.");

    // set teachers.user_id = auth user id (only if not set)
    const { error: upErr } = await admin
      .from("teachers")
      .update({ user_id: userId })
      .eq("id", teacherId)
      .is("user_id", null);

    if (upErr) throw upErr;

    return NextResponse.json({ ok: true, userId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to link teacher." }, { status: 500 });
  }
}
