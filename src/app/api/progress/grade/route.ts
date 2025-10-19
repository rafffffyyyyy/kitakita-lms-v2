import { NextResponse } from "next/server";
import { createRLSClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { submissionId: string; grade: number | string; feedback?: string | null };
    const submissionId = body?.submissionId?.trim();
    const gradeNum = Number(body?.grade);
    const feedback = body?.feedback ?? null;

    if (!submissionId || Number.isNaN(gradeNum))
      return NextResponse.json({ error: "submissionId and numeric grade are required." }, { status: 400 });

    const supabase = await createRLSClient();

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("assignment_submissions")
      .update({ grade: gradeNum, feedback })
      .eq("id", submissionId)
      .select("id, grade, feedback")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Submission not found or not accessible." }, { status: 404 });

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed to save grade." }, { status: 500 });
  }
}
