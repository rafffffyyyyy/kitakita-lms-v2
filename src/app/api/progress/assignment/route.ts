// /app/api/progress/assignment/route.ts
import { NextResponse } from "next/server";
import { getRlsServerClient } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const t0 = Date.now();

  try {
    const url = new URL(req.url);
    const assignmentId = url.searchParams.get("assignmentId");
    if (!assignmentId) {
      return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 });
    }

    // ✅ RLS-aware server client (no direct cookies() usage here)
    const supabase = getRlsServerClient();

    // Who is calling?
    const { data: authRes, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const user = authRes?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Resolve teacher.id from auth user (teachers.user_id == auth.users.id)
    const { data: teacher, error: tErr } = await supabase
      .from("teachers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!teacher) return NextResponse.json({ error: "Teacher record not found" }, { status: 403 });

    // Verify assignment belongs to this teacher via module -> quarter
    const { data: assignment, error: aErr } = await supabase
      .from("assignments")
      .select("id, module_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

    const { data: mod, error: mErr } = await supabase
      .from("modules")
      .select("id, quarter_id")
      .eq("id", assignment.module_id)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });

    const { data: quarter, error: qErr } = await supabase
      .from("quarters")
      .select("id, teacher_id")
      .eq("id", mod.quarter_id)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!quarter) return NextResponse.json({ error: "Quarter not found" }, { status: 404 });

    if (quarter.teacher_id !== teacher.id) {
      return NextResponse.json({ error: "Forbidden: not your assignment." }, { status: 403 });
    }

    // ------- Data -------
    // Roster = all students under this teacher
    const { data: roster, error: rErr } = await supabase
      .from("students")
      .select("id, first_name, middle_name, last_name, profile_picture_url")
      .eq("teacher_id", teacher.id)
      .order("last_name", { ascending: true });
    if (rErr) throw rErr;

    // All submissions for this assignment (newest first)
    const { data: allSubs, error: sErr } = await supabase
      .from("assignment_submissions")
      .select("id, assignment_id, student_id, submitted_at, grade, feedback, file_url, answer_text")
      .eq("assignment_id", assignmentId)
      .order("submitted_at", { ascending: false, nullsFirst: false });
    if (sErr) throw sErr;

    // Keep latest submission per student (array is already sorted desc by submitted_at)
    const latestMap = new Map<string, any>();
    for (const s of allSubs ?? []) {
      if (!latestMap.has(s.student_id)) latestMap.set(s.student_id, s);
    }
    const latestSubmissions = Array.from(latestMap.values());

    // Metrics
    const submitted = latestSubmissions.filter((s) => !!s.submitted_at).length;
    const gradedList = latestSubmissions.filter((s) => s.grade !== null && s.grade !== undefined);
    const graded = gradedList.length;
    const avgScore = graded
      ? Number((gradedList.reduce((acc, s) => acc + Number(s.grade), 0) / graded).toFixed(2))
      : null;

    return NextResponse.json(
      {
        roster: roster ?? [],
        latestSubmissions,
        metrics: { submitted, graded, avgScore },
        debug: {
          t_ms: Date.now() - t0,
          rows: {
            roster: roster?.length ?? 0,
            subs_all: allSubs?.length ?? 0,
            subs_latest: latestSubmissions.length,
          },
        },
      },
      { status: 200, headers: { "Cache-Control": "private, max-age=10" } }
    );
  } catch (e: any) {
    console.error("GET /api/progress/assignment:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
