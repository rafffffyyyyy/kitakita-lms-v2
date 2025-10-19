// src/app/api/create-student/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // ensure Node runtime

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Payload = {
  lrn: string;
  password: string;            // temp password chosen by teacher (or you can generate server-side)
  firstName: string;
  lastName: string;
  middleName?: string | null;
  teacherId: string;           // uuid (teachers.id)
  sectionId: number;           // int8 (sections.id)
};

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SERVER_MISCONFIGURED: missing Supabase env vars" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Payload;

    // Basic validation
    const lrn = (body.lrn ?? "").trim();
    const password = (body.password ?? "").trim();
    const firstName = (body.firstName ?? "").trim();
    const lastName = (body.lastName ?? "").trim();
    const middleName = body.middleName?.toString().trim() || null;
    const teacherId = (body.teacherId ?? "").trim();
    const sectionId = Number(body.sectionId);

    if (!lrn || !password || !firstName || !lastName || !teacherId || !sectionId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const email = `${lrn}@students.kitakita.local`.toLowerCase();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // (Optional) quick uniqueness checks you likely already enforce with indexes:
    // - LRN unique
    // - username unique
    // If you have unique indexes, Supabase will throw on conflict anyway.
    // const { data: existingLRN } = await admin.from("students").select("id").eq("lrn", lrn).maybeSingle();
    // if (existingLRN) return NextResponse.json({ error: "LRN already exists" }, { status: 409 });

    // 1) Create Auth user (or fetch if it already exists)
    let userId: string | null = null;

    // Try to find existing user by email first (faster than create+list)
    // @ts-ignore (getUserByEmail exists in supabase-js v2 admin API)
    const { data: foundByEmail } = await admin.auth.admin.getUserByEmail?.(email);
    if (foundByEmail?.user) {
      userId = foundByEmail.user.id;
    } else {
      const { data: createData, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "student", lrn },
      });
      if (createErr || !createData?.user) {
        return NextResponse.json({ error: createErr?.message ?? "Failed to create auth user" }, { status: 400 });
      }
      userId = createData.user.id;
    }

    // 2) Upsert profile (nice-to-have for your header)
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: userId!,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      email,
      created_at: new Date().toISOString(),
    });
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    // 3) Upsert students row linked via auth_user_id
    // ⚠️ I strongly recommend removing `password` column usage from `students` to avoid plaintext storage.
    const { data: studentRow, error: upsertErr } = await admin
      .from("students")
      .upsert(
        {
          auth_user_id: userId!,
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          lrn,
          username: lrn,           // if you still keep it
          // password,              // ← stop storing this long term; Auth is the source of truth
          teacher_id: teacherId,
          section_id: sectionId,
          created_at: new Date().toISOString(),
        },
        { onConflict: "auth_user_id" }
      )
      .select("id")
      .single();

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        student_id: studentRow.id,
        auth_user_id: userId,
        email,
        // Only return the password if you really need to show it; otherwise omit it.
        // tempPassword: password,
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
