// src/lib/auth/requireTeacher.ts
import { type SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export async function requireTeacherId(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");                    // not logged in

  const { data: teacher, error } = await supabase
    .from("teachers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (error || !teacher) redirect("/unauthorized"); // logged in but not a teacher
  return teacher.id as string;
}
