// /src/app/api/assignments/route.ts
export const runtime = "nodejs";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const STORAGE_BUCKET = "lms-files";

/** Supabase client that impersonates caller via Authorization: Bearer <token> */
function supabaseFromAuthHeader(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers },
      auth: { persistSession: false, detectSessionInUrl: false },
    }
  );
}

function bad(message: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function POST(req: Request) {
  const supabase = supabaseFromAuthHeader(req);

  try {
    // 0) Auth
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return bad("Not authenticated.", 401);

    // 1) Parse form
    const form = await req.formData();
    const moduleId = String(form.get("module_id") || "");
    const name = String(form.get("name") || "").trim();
    const instruction = String(form.get("instruction") || "").trim();
    const maxScore = Number(form.get("max_score"));
    const maxAttemptsRaw = form.get("max_attempts") as string | null;
    const availableFromRaw = form.get("available_from") as string | null;
    const dueAtRaw = form.get("due_at") as string | null;
    const file = form.get("file") as File | null;

    if (!moduleId) return bad("Missing module id.");
    if (!name) return bad("Assignment name is required.");
    if (!instruction) return bad("Instructions are required.");
    if (!Number.isFinite(maxScore) || maxScore <= 0)
      return bad("Max score must be a positive number.");

    const maxAttempts =
      maxAttemptsRaw && maxAttemptsRaw !== "" ? Number(maxAttemptsRaw) : null;
    if (maxAttempts !== null && (!Number.isInteger(maxAttempts) || maxAttempts < 1))
      return bad("Max attempts must be an integer ≥ 1.");

    const availableFrom =
      availableFromRaw && availableFromRaw !== "" ? new Date(availableFromRaw) : null;
    const dueAt = dueAtRaw && dueAtRaw !== "" ? new Date(dueAtRaw) : null;
    if (availableFrom && dueAt && dueAt < availableFrom)
      return bad("Due date must be after (or equal to) Available From.");

    // 2) OPTIONAL preflight; handle “function missing” gracefully
    const { data: ownRes, error: ownErr } = await supabase.rpc(
      "is_teacher_for_module",
      { mid: moduleId }
    );

    if (ownErr) {
      // When function doesn’t exist, PostgREST often returns PGRST204 or 42883
      const code = (ownErr as any).code ?? "";
      const msg = String(ownErr.message || "");
      const looksMissing =
        code === "PGRST204" ||
        code === "42883" ||
        /is_teacher_for_module/i.test(msg) ||
        /does not exist/i.test(msg);

      if (!looksMissing) {
        return bad(`Ownership check failed: ${msg}`, 403, { step: "preflight" });
      }
      // else: let RLS decide on insert
    } else if (ownRes !== null && ownRes !== true) {
      return bad("You do not own this module.", 403, { step: "preflight" });
    }

    // 3) Insert assignment (RLS will verify ownership)
    const { data: ins, error: insErr } = await supabase
      .from("assignments")
      .insert([
        {
          module_id: moduleId,
          name,
          instruction,
          max_score: maxScore,
          max_attempts: maxAttempts,
          available_from: availableFrom?.toISOString() ?? null,
          due_at: dueAt?.toISOString() ?? null,
        },
      ])
      .select("id")
      .single();

    if (insErr) return bad(insErr.message, 403, { step: "insert_assignment" });
    const assignmentId = ins!.id as string;

    // 4) Optional file upload
    if (file && file.size > 0) {
      const safe = file.name.replace(/\s+/g, "_");
      const key = `assignments/${assignmentId}/${randomUUID()}_${safe}`;

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(key, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
      if (upErr) return bad(upErr.message, 403, { step: "upload" });

      const { error: fileRowErr } = await supabase
        .from("assignment_files")
        .insert([{ assignment_id: assignmentId, file_url: key, file_name: file.name }]);
      if (fileRowErr) return bad(fileRowErr.message, 403, { step: "insert_file_row" });
    }

    // 5) Revalidate
    revalidatePath(`/modules/${moduleId}`);
    return NextResponse.json({ ok: true, id: assignmentId });
  } catch (e: any) {
    return bad(e?.message ?? "Unknown server error.", 500);
  }
}
