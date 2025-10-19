import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Body = {
  teacherId: string;
  lrn: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  sectionId?: number;
  sectionName?: string;
  password?: string; // optional client-generated temp password
  profilePictureUrl?: string | null;
};

const deriveStudentEmail = (lrn: string) => `${lrn.trim()}@students.kitakita.local`;
const genTempPassword = () => Math.random().toString(36).slice(-10);

export async function POST(req: Request) {
  try {
    if (!URL || !SERVICE_KEY) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }
    const svc = createClient(URL, SERVICE_KEY);

    const {
      teacherId,
      lrn,
      firstName,
      middleName,
      lastName,
      sectionId,
      sectionName,
      password,
      profilePictureUrl,
    } = (await req.json()) as Body;

    if (!teacherId || !lrn?.trim() || !firstName?.trim() || !lastName?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1) Verify teacher/admin exists
    const { data: teacherRow, error: teacherErr } = await svc
      .from("teachers")
      .select("id")
      .eq("id", teacherId)
      .maybeSingle();
    if (teacherErr) return NextResponse.json({ error: teacherErr.message }, { status: 400 });
    if (!teacherRow)
      return NextResponse.json({ error: "Not a teacher (or teacher not found)" }, { status: 403 });

    // 2) Resolve section
    let resolvedSectionId: number | null = null;
    if (typeof sectionId === "number") {
      resolvedSectionId = sectionId;
    } else if (sectionName) {
      const { data: sec, error: secErr } = await svc
        .from("sections")
        .select("id")
        .ilike("name", sectionName.trim())
        .maybeSingle();
      if (secErr) return NextResponse.json({ error: secErr.message }, { status: 400 });
      if (!sec) return NextResponse.json({ error: "Section not found" }, { status: 404 });
      resolvedSectionId = sec.id as number;
    }

    // 3) Fail early for LRN/username duplicates
    {
      const { data: existing, error: dupErr } = await svc
        .from("students")
        .select("id")
        .or(`lrn.eq.${lrn},username.eq.${lrn}`)
        .maybeSingle();
      if (dupErr) return NextResponse.json({ error: dupErr.message }, { status: 400 });
      if (existing)
        return NextResponse.json({ error: "LRN/username already exists" }, { status: 409 });
    }

    // 4) Create auth user first (we need its id to be students.id)
    const email = deriveStudentEmail(lrn);
    const pwd = (password?.trim() || genTempPassword());
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password: pwd,
      email_confirm: true,
      user_metadata: {
        role: "student",
        lrn,
        teacher_id: teacherId,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
      },
    });
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 });
    const authUserId = created?.user?.id;
    if (!authUserId) return NextResponse.json({ error: "Could not determine user id" }, { status: 500 });

    // From here on, if something fails, clean up the auth user
    const cleanupAuth = async () => {
      try {
        await svc.auth.admin.deleteUser(authUserId);
      } catch {
        /* ignore */
      }
    };

    // 5) Upsert profile (id == auth uid)
    const { error: profileErr } = await svc.from("profiles").upsert(
      {
        id: authUserId,
        email,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        profile_picture_url: profilePictureUrl || null,
        created_at: new Date(),
      },
      { onConflict: "id" },
    );
    if (profileErr) {
      await cleanupAuth();
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    // 6) Insert/Upsert student with id = authUserId  (NO auth_user_id column now)
    const { data: studentRow, error: studentErr } = await svc
      .from("students")
      .upsert(
        {
          id: authUserId,                       // 👈 matches auth.users.id
          teacher_id: teacherId,
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
          lrn,
          username: lrn,
          section_id: resolvedSectionId,
          profile_picture_url: profilePictureUrl || null,
          password: pwd,                         // 👈 temporary copy for teacher reference
          created_at: new Date(),
        },
        { onConflict: "id" },                    // 👈 conflict key is now "id"
      )
      .select("id, lrn, username, section_id")
      .maybeSingle();

    if (studentErr) {
      await cleanupAuth();
      return NextResponse.json({ error: studentErr.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      userId: authUserId,
      email,
      password: pwd,
      student: studentRow,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
