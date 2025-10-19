// /app/api/admin/create-teacher/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // NOT public

type Body = {
  adminId: string; // current admin auth uid
  email: string;
  password: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
};

export async function POST(req: Request) {
  try {
    if (!URL || !SERVICE_KEY) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }
    const svc = createClient(URL, SERVICE_KEY);

    const { adminId, email, password, firstName, middleName, lastName } =
      (await req.json()) as Body;

    if (!adminId) {
      return NextResponse.json({ error: "adminId is required" }, { status: 400 });
    }

    // verify admin exists
    const { data: adminRow, error: adminErr } = await svc
      .from("admins")
      .select("id")
      .eq("id", adminId)
      .maybeSingle();
    if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 400 });
    if (!adminRow) return NextResponse.json({ error: "Not an admin" }, { status: 403 });

    const normalizedEmail = email.trim().toLowerCase();

    // 1) Create auth user
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: "teacher",
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
      },
    });

    let authUserId = created?.user?.id as string | undefined;

    if (createErr) {
      const msg = (createErr.message || "").toLowerCase();
      if (msg.includes("already") && msg.includes("registered")) {
        // Link to existing profile by email
        const { data: byEmail, error: findErr } = await svc
          .from("profiles")
          .select("id")
          .eq("email", normalizedEmail)
          .maybeSingle();
        if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 });
        if (!byEmail) {
          return NextResponse.json(
            { error: "Email already registered but no profile found." },
            { status: 409 }
          );
        }
        authUserId = byEmail.id;
      } else {
        return NextResponse.json({ error: createErr.message }, { status: 400 });
      }
    }

    if (!authUserId) {
      return NextResponse.json({ error: "Could not determine user id" }, { status: 500 });
    }

    // 2) Upsert profile
    const { error: profileErr } = await svc
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          email: normalizedEmail,
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
        },
        { onConflict: "id" }
      );
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });

    // 3) Upsert teacher (with admin_id)
    const { error: teacherErr } = await svc
      .from("teachers")
      .upsert(
        {
          id: authUserId,
          admin_id: adminId,
          email: normalizedEmail,
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
        },
        { onConflict: "id" }
      );
    if (teacherErr) return NextResponse.json({ error: teacherErr.message }, { status: 400 });

    // 4) Create default quarters (idempotent without unique constraint)
    const DEFAULT_QUARTERS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

    // Fetch existing quarter names for this teacher
    const { data: existingQuarters, error: qSelErr } = await svc
      .from("quarters")
      .select("name")
      .eq("teacher_id", authUserId);

    if (qSelErr) {
      return NextResponse.json({ error: qSelErr.message }, { status: 400 });
    }

    const existingNames = new Set((existingQuarters ?? []).map((q) => q.name));
    const toInsert = DEFAULT_QUARTERS
      .filter((name) => !existingNames.has(name))
      .map((name) => ({
        teacher_id: authUserId,
        name,
        created_at: new Date(),
      }));

    let createdQuarterNames: string[] = [];
    if (toInsert.length > 0) {
      const { data: inserted, error: qInsErr } = await svc
        .from("quarters")
        .insert(toInsert)
        .select("name");
      if (qInsErr) {
        return NextResponse.json({ error: qInsErr.message }, { status: 400 });
      }
      createdQuarterNames = (inserted ?? []).map((r) => r.name);
    }

    return NextResponse.json({
      ok: true,
      userId: authUserId,
      createdQuarters: createdQuarterNames, // e.g., ["1st Quarter","2nd Quarter",...]
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
