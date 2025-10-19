"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

type Role = "admin" | "teacher" | "student";

interface UserContextType {
  role: Role | null;
  setRole: (role: Role) => void;
  userId: string | null;
  setUserId: (id: string | null) => void;
  loading: boolean;
  refreshRole: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<Role | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Student check — NEW: compare auth uid to students.id (not auth_user_id) */
  const resolveStudentByAuth = async (uid: string) => {
    const { data, error } = await supabase
      .from("students")
      .select("id")
      .eq("id", uid) // 👈 schema: students.id == auth.users.id
      .maybeSingle();

    if (error || !data) return false;

    const sid = data.id as string;
    setRole("student");
    setUserId(sid);

    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("lms_role", "student");
        localStorage.setItem("student_id", sid);
      }
    } catch {/* ignore */}
    return true;
  };

  /** Resolve role for a given auth uid */
  const resolveRole = async (uid: string | null) => {
    if (!uid) {
      setRole(null);
      setUserId(null);
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("lms_role");
          localStorage.removeItem("student_id");
        }
      } catch {/* ignore */}
      return;
    }

    // 1) Admin?
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("id", uid)
      .maybeSingle();
    if (adminRow) {
      setRole("admin");
      setUserId(uid);
      try {
        if (typeof window !== "undefined") localStorage.setItem("lms_role", "admin");
      } catch {}
      return;
    }

    // 2) Teacher?
    const { data: teacherRow } = await supabase
      .from("teachers")
      .select("id")
      .eq("id", uid)
      .maybeSingle();
    if (teacherRow) {
      setRole("teacher");
      setUserId(uid);
      try {
        if (typeof window !== "undefined") localStorage.setItem("lms_role", "teacher");
      } catch {}
      return;
    }

    // 3) Student?
    const isStudent = await resolveStudentByAuth(uid);
    if (isStudent) return;

    // 4) Fallback
    setRole(null);
    setUserId(null);
  };

  /** Public method to recompute role */
  const refreshRole = async () => {
    // Fast-path: honor cached student role to avoid flicker
    try {
      if (typeof window !== "undefined") {
        const lr = localStorage.getItem("lms_role");
        if (lr === "student") {
          setRole("student");
          setUserId(localStorage.getItem("student_id"));
          // still verify in background to keep things consistent
        }
      }
    } catch {/* ignore */}

    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id ?? null;
    setUserId(uid);
    await resolveRole(uid);
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      setLoading(true);
      await refreshRole();
      setLoading(false);

      // --- Auth cookie sync to server (/api/auth/callback) ---
      // Send current session once on mount
      try {
        const { data } = await supabase.auth.getSession();
        await fetch("/api/auth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ event: "INITIAL_SESSION", session: data.session }),
        });
      } catch { /* ignore */ }

      // Keep server cookies in sync on any auth change
      const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
        try {
          await fetch("/api/auth/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ event, session }),
          });
        } catch { /* ignore */ }

        const uid = session?.user?.id ?? null;
        setUserId(uid);
        resolveRole(uid);
      });
      unsub = () => sub.subscription.unsubscribe();
      // -------------------------------------------------------
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  return (
    <UserContext.Provider value={{ role, setRole, userId, setUserId, loading, refreshRole }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within a UserProvider");
  return context;
};
