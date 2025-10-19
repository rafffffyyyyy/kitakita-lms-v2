"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = {
  first_name?: string;
  last_name?: string;
  role?: "admin" | "teacher" | "student";
};

export default function HeaderUser() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        setProfile({ first_name: "Guest", role: undefined });
        return;
      }

      // Adjust table/columns to your schema
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,role")
        .eq("id", user.id)
        .maybeSingle();

      setProfile(data ?? { first_name: "User" });
    })();
  }, []);

  const name =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Guest";
  const role = profile?.role ? profile.role[0].toUpperCase() + profile.role.slice(1) : "—";

  const initials = (profile?.first_name?.[0] ?? "U").toUpperCase();

  return (
    <div className="ml-auto flex items-center gap-3">
      <div className="text-right leading-none">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-slate-300">{role}</div>
      </div>
      <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm">
        {initials}
      </div>
    </div>
  );
}
