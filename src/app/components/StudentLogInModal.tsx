// /src/app/components/StudentLogInModal.tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/app/UserContext";
import {
  UserCircleIcon,
  IdentificationIcon,
  LockClosedIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface StudentLoginModalProps {
  closeModal: () => void;
  onLoginSuccess: () => void;
}

export default function StudentLoginModal({
  closeModal,
  onLoginSuccess,
}: StudentLoginModalProps) {
  // Accepts LRN or Username; email also works but not required
  const [identifier, setIdentifier] = useState(""); // LRN or username (or email)
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { refreshRole } = useUser();

  const resolveStudentLRN = async (input: string) => {
    // If user typed an email, just return it as-is
    if (input.includes("@")) return { email: input.toLowerCase(), lrn: null as string | null };

    // If it looks like an LRN (all digits), use it directly
    const looksNumeric = /^[0-9]+$/.test(input);
    if (looksNumeric) {
      return {
        email: `${input}@students.kitakita.local`.toLowerCase(),
        lrn: input,
      };
    }

    // Otherwise, treat as USERNAME and look up the student's LRN
    const { data, error } = await supabase
      .from("students")
      .select("lrn")
      .eq("username", input)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.lrn) throw new Error("Account not found. Check your username/LRN.");

    return {
      email: `${data.lrn}@students.kitakita.local`.toLowerCase(),
      lrn: data.lrn,
    };
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const id = identifier.trim();
    const pw = password.trim();

    if (!id || !pw) {
      setError("Please enter your LRN/Username and password.");
      setLoading(false);
      return;
    }

    try {
      const { email } = await resolveStudentLRN(id);

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: pw,
      });

      if (authError || !data?.user) {
        setError("Invalid credentials. Please check your LRN/Username and password.");
        setLoading(false);
        return;
      }

      // Optional convenience store (not used for auth)
      try {
        localStorage.setItem("student_identifier", id);
      } catch {}

      await refreshRole();
      onLoginSuccess();
      closeModal();
    } catch (err: any) {
      setError(err?.message || "Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-slate-900 to-slate-700 p-5 text-white">
          <button
            type="button"
            onClick={closeModal}
            className="absolute right-3 top-3 rounded-md p-1 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <UserCircleIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-center text-xl font-semibold">Student Login</h2>
          <p className="mt-1 text-center text-xs text-white/80">
            Use your <b>LRN</b> or <b>Username</b> and your password
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4 p-6">
          <label className="block text-sm font-medium text-slate-700">
            LRN / Username
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <IdentificationIcon className="h-5 w-5 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="e.g., 1234567890"
                className="w-full rounded-lg border border-slate-200 pl-10 pr-3 py-2 text-slate-900 placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                inputMode="text"
              />
            </div>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <LockClosedIcon className="h-5 w-5 text-slate-400" />
              </span>
              <input
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 pl-10 pr-16 py-2 text-slate-900 placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-0 mr-2 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" aria-live="assertive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white
                       hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Logging in…" : "Log In"}
          </button>

          <button
            type="button"
            onClick={closeModal}
            className="w-full rounded-lg border border-slate-200 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </form>
      </div>
    </div>
  );
}
