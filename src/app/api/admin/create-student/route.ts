import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient, type PostgrestError } from "@supabase/supabase-js";

export const runtime = "nodejs";

function projectRefFromUrl(url: string | undefined) {
  try {
    if (!url) return null;
    const u = new URL(url);
    return u.hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { teacherId, firstName, middleName, lastName, lrn, sectionId, password } = body ?? {};

    if (!teacherId || !firstName || !lastName || !lrn || !sectionId || !password) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const projectRef = projectRefFromUrl(supabaseUrl);

    // --- Cookie-bound RLS client (Next 14+/15 expects getAll/setAll)
    const cookieStore = await cookies();

    const rls = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set({ name, value, ...options })
            );
          } catch {
            // Called from a context where setting cookies isn't allowed — ignore.
          }
        },
      },
    });

    // Prefer Authorization header; fallback to cookies
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const accessToken = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : undefined;

    const { data: sessionData } = await rls.auth.getSession();
    const sessionUserId = sessionData?.session?.user?.id ?? null;

    const userResp = accessToken ? await rls.auth.getUser(accessToken) : await rls.auth.getUser();
    const user = userResp.data.user ?? null;

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
          debug: {
            where: "rls.auth.getUser",
            via: accessToken ? "header" : "cookie",
            hasAuthHeader: !!accessToken,
            sessionUserId,
            projectRef,
          },
        },
        { status: 401 }
      );
    }

    // --- Service-role client (bypasses RLS)
    const svc = createServiceClient(supabaseUrl, serviceKey);

    // Admin check via service-role
    const { data: adminRow, error: adminErr } = await svc
      .from("admins")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (adminErr || !adminRow) {
      return NextResponse.json(
        {
          error: "Forbidden (admin only).",
          debug: {
            where: "admins check (service-role)",
            via: accessToken ? "header" : "cookie",
            sessionUserId: user.id,
            isAdmin: !!adminRow,
            projectRef,
          },
        },
        { status: 403 }
      );
    }

    // Validate teacher & section via service-role
    const { data: teacherRow, error: tErr } = await svc
      .from("teachers")
      .select("id, admin_id")
      .eq("id", teacherId)
      .maybeSingle();

    if (tErr || !teacherRow) {
      return NextResponse.json(
        {
          error: "Teacher not found.",
          debug: { where: "teacher lookup (service-role)", teacherId, tErrMessage: tErr?.message, projectRef },
        },
        { status: 404 }
      );
    }

    if (teacherRow.admin_id && teacherRow.admin_id !== user.id) {
      return NextResponse.json(
        {
          error: "Forbidden (teacher belongs to another admin).",
          debug: { where: "teacher ownership", teacherAdminId: teacherRow.admin_id, adminId: user.id, projectRef },
        },
        { status: 403 }
      );
    }

    const { data: sectionRow, error: sErr } = await svc
      .from("sections")
      .select("id")
      .eq("id", Number(sectionId))
      .maybeSingle();

    if (sErr || !sectionRow) {
      return NextResponse.json(
        {
          error: "Section not found.",
          debug: { where: "section lookup (service-role)", sectionId, sErrMessage: sErr?.message, projectRef },
        },
        { status: 404 }
      );
    }

    // --- Create Auth user first (FK students.id -> auth.users.id)
    const studentEmail = `${String(lrn).trim()}@students.kitakita.local`;
    const { data: createdUser, error: createUserErr } = await svc.auth.admin.createUser({
      email: studentEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: "student",
        lrn: String(lrn).trim(),
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
      },
    });

    if (createUserErr || !createdUser?.user?.id) {
      const status = (createUserErr as any)?.status ?? 500;
      const msg = (createUserErr as any)?.message || "Failed to create auth user.";
      const isConflict = status === 409 || status === 422 || /already/i.test(msg);
      return NextResponse.json(
        {
          error: isConflict ? "Student auth user already exists." : msg,
          debug: { where: "auth.admin.createUser", status, msg, email: studentEmail, projectRef },
        },
        { status: isConflict ? 409 : 500 }
      );
    }

    const newAuthId = createdUser.user.id;

    // --- Insert student row using the new auth user id
    const insertPayload = {
      id: newAuthId,               // FK -> auth.users.id
      teacher_id: teacherId,
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      lrn,
      username: lrn,
      password,                    // consider hashing/removing later
      section_id: Number(sectionId),
      created_at: new Date().toISOString(),
    };

    const { error: insertErr } = await svc.from("students").insert(insertPayload);

    if (insertErr) {
      // rollback auth user if insert failed
      try { await svc.auth.admin.deleteUser(newAuthId); } catch {}
      const code = (insertErr as PostgrestError & { code?: string }).code;
      if (code === "23505") {
        return NextResponse.json({ error: "LRN or username already exists." }, { status: 409 });
      }
      return NextResponse.json(
        { error: insertErr.message, debug: { where: "students insert", code, projectRef } },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, password }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error." }, { status: 500 });
  }
}
