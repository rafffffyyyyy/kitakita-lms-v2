// /app/api/progress/roster/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type RosterStudent = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  lrn: string | null;
  section_id: number | null;
  section_name: string | null;
  profile_picture_url: string | null;
};

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  // 1) Who is calling?
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // 2) Resolve role
  const userId = auth.user.id;

  // Try teacher first (teachers.user_id = auth user id)
  const { data: teacher, error: tErr } = await supabase
    .from("teachers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  // Optional: allow admins to see all students
  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  // 3) Fetch students
  let studentsRows:
    | {
        id: string;
        first_name: string | null;
        middle_name: string | null;
        last_name: string | null;
        lrn: string | null;
        section_id: number | null;
        profile_picture_url: string | null;
      }[]
    | null = null;

  if (teacher?.id) {
    // Teacher: only own students (IMPORTANT: use teachers.id)
    const { data, error } = await supabase
      .from("students")
      .select(
        "id, first_name, middle_name, last_name, lrn, section_id, profile_picture_url"
      )
      .eq("teacher_id", teacher.id)
      .order("last_name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    studentsRows = data ?? [];
  } else if (admin?.id) {
    // Admin: all students
    const { data, error } = await supabase
      .from("students")
      .select(
        "id, first_name, middle_name, last_name, lrn, section_id, profile_picture_url"
      )
      .order("last_name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    studentsRows = data ?? [];
  } else {
    // Not a teacher/admin
    return NextResponse.json({ students: [] });
  }

  // 4) Resolve section names (safe even if no FKs are set for joins)
  const sectionIds = Array.from(
    new Set(
      (studentsRows ?? [])
        .map((s) => s.section_id)
        .filter((v): v is number => typeof v === "number")
    )
  );

  let sectionNameById: Record<number, string> = {};
  if (sectionIds.length) {
    const { data: secs, error: secErr } = await supabase
      .from("sections")
      .select("id, name")
      .in("id", sectionIds);
    if (secErr) return NextResponse.json({ error: secErr.message }, { status: 500 });
    sectionNameById = Object.fromEntries((secs ?? []).map((r) => [r.id, r.name]));
  }

  const students: RosterStudent[] = (studentsRows ?? []).map((s) => ({
    ...s,
    section_name:
      s.section_id != null ? sectionNameById[s.section_id] ?? null : null,
  }));

  return NextResponse.json({ students });
}
