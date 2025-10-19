"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Role = "teacher" | "student" | "anon";

export function useActor() {
  const [role, setRole] = useState<Role>("anon");
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // 1) If there’s an auth user, treat as teacher/admin pathway.
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;

      if (uid) {
        setTeacherId(uid);
        setRole("teacher");
      } else {
        // 2) Otherwise, check our local student session (set in StudentLoginModal).
        const sid = typeof window !== "undefined" ? localStorage.getItem("student_id") : null;
        if (sid) {
          setStudentId(sid);
          setRole("student");
        } else {
          setRole("anon");
        }
      }

      if (mounted) setReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return { role, teacherId, studentId, ready };
}
