import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client (server-only)
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      lrn,
      password,
      firstName,
      lastName,
      middleName = null,
      teacherId,
      sectionId,
    } = body as {
      lrn: string;
      password: string;
      firstName: string;
      lastName: string;
      middleName?: string | null;
      teacherId: string;
      sectionId: number;
    };

    // Basic validation
    if (!lrn || !password || !firstName || !lastName || !teacherId || !sectionId) {
      return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 200 });
    }

    // Synthetic email for Auth (we do NOT store this in public.students)
    const email = `${String(lrn).trim()}@students.kitakita.local`.toLowerCase();

    // 1) Create or reuse an Auth user with that email, set the EXACT password provided by teacher
    const { data: existing } = await admin
      .schema("auth")
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let authUserId: string | null = existing?.id ?? null;

    if (!authUserId) {
      // Create Auth user and confirm email (no magic link flow)
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "student", lrn },
      });
      if (createErr || !created?.user) {
        return NextResponse.json(
          { ok: false, error: createErr?.message || "Failed to create auth user." },
          { status: 200 }
        );
      }
      authUserId = created.user.id;
    } else {
      // If the user already exists, make sure the password equals what teacher set
      const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, { password });
      if (updErr) {
        return NextResponse.json(
          { ok: false, error: updErr.message || "Failed to update auth password." },
          { status: 200 }
        );
      }
    }

    // 2) Insert/Upsert into public.students (DO NOT store 'email' column)
    //    We store the auth UID in students.auth_user_id. Keep your own 'id' PK as is.
    const { data: studentRow, error: upsertErr } = await admin
      .from("students")
      .upsert(
        [
          {
            // your schema has: id (uuid), first_name, last_name, middle_name, lrn, username,
            // password, teacher_id (uuid), section_id (int8), created_at, profile_picture_url, auth_user_id (uuid)
            first_name: firstName,
            last_name: lastName,
            middle_name: middleName,
            lrn: String(lrn).trim(),
            username: String(lrn).trim(),
            password,                 // NOTE: you can remove this later when you stop storing plaintext
            teacher_id: teacherId,
            section_id: sectionId,
            created_at: new Date().toISOString(),
            profile_picture_url: null,
            auth_user_id: authUserId, // link to Auth
          },
        ],
        // if LRN is unique in your table, you can conflict on it; otherwise use a different key
        { onConflict: "lrn" }
      )
      .select("id, lrn, username, auth_user_id")
      .maybeSingle();

    if (upsertErr || !studentRow) {
      return NextResponse.json(
        { ok: false, error: upsertErr?.message || "Failed to insert student." },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        student: studentRow,
        authEmail: email,  // purely informational; not stored in public.students
        uid: authUserId,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 200 }
    );
  }
}
