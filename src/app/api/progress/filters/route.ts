// /app/api/progress/filters/route.ts
import { NextResponse } from "next/server";
import { getRlsServerClient } from "@/lib/supabaseServer";
import type { QuarterOpt, ModuleOpt, AssignmentOpt } from "@/lib/types/progress";

type AssignmentListItem = AssignmentOpt & { max_score: number | null };

export async function GET(req: Request) {
  const t0 = performance.now();

  try {
    const url = new URL(req.url);
    const quarterId = url.searchParams.get("quarterId");
    const moduleId = url.searchParams.get("moduleId");

    const supabase = getRlsServerClient();

    // Who is calling?
    const { data: authRes, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const user = authRes?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Resolve teacher via user_id (teachers.user_id === auth.users.id)
    const { data: teacher, error: teacherErr } = await supabase
      .from("teachers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (teacherErr) throw teacherErr;
    if (!teacher) {
      return NextResponse.json({ error: "Teacher record not found." }, { status: 403 });
    }

    // --------- Branches ---------

    // 1) No params -> quarters for this teacher
    if (!quarterId && !moduleId) {
      const { data: quarters, error: qErr } = await supabase
        .from("quarters")
        .select("id, name")
        .eq("teacher_id", teacher.id)
        .order("created_at", { ascending: true });
      if (qErr) throw qErr;

      return NextResponse.json(
        {
          quarters: (quarters ?? []) as QuarterOpt[],
          debug: { t_ms: Math.round(performance.now() - t0) },
        },
        { status: 200, headers: { "Cache-Control": "private, max-age=20" } }
      );
    }

    // 2) quarterId -> modules in that quarter
    if (quarterId && !moduleId) {
      const { data: modulesData, error: mErr } = await supabase
        .from("modules")
        .select("id, title, quarter_id")
        .eq("quarter_id", quarterId)
        .order("created_at", { ascending: true });
      if (mErr) throw mErr;

      const modules: ModuleOpt[] = modulesData ?? [];

      return NextResponse.json(
        {
          modules,
          debug: { t_ms: Math.round(performance.now() - t0) },
        },
        { status: 200, headers: { "Cache-Control": "private, max-age=20" } }
      );
    }

    // 3) moduleId -> assignments in that module
    if (moduleId) {
      const { data: assigns, error: aErr } = await supabase
        .from("assignments")
        .select("id, name, module_id")
        .eq("module_id", moduleId)
        .order("created_at", { ascending: true });
      if (aErr) throw aErr;

      // Keep your shape, add a typed placeholder field
      const assignments: AssignmentListItem[] = (assigns ?? []).map((a) => ({
        ...a,
        max_score: null,
      }));

      return NextResponse.json(
        {
          assignments,
          debug: { t_ms: Math.round(performance.now() - t0) },
        },
        { status: 200, headers: { "Cache-Control": "private, max-age=20" } }
      );
    }

    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load filters." }, { status: 500 });
  }
}
