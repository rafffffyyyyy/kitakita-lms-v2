import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRLSClient } from "@/lib/supabase/server";

export async function GET() {
  const jar = await cookies();
  const cookieNames = jar.getAll().map((c) => c.name);

  const supabase = await createRLSClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  // In your schema, teachers.id === auth.uid()
  let teacher: { id: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("teachers")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    teacher = (data as any) ?? null;
  }

  return NextResponse.json({
    cookieNames,
    hasSbCookies: cookieNames.some((n) => n.startsWith("sb-")),
    user: user ? { id: user.id, email: user.email } : null,
    authError: authErr?.message ?? null,
    teacher,
  });
}
