"use client";

import { useState } from "react";
import {
  AcademicCapIcon,
  EnvelopeIcon,
  LockClosedIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useTeacherLogin } from "../auth/teacherAuth";
import { supabase } from "@/lib/supabase";

interface TeacherSignInModalProps {
  closeModal: () => void;
  switchToSignUp: () => void; // kept for compatibility but not used (link removed)
  onLoginSuccess?: () => void;
}

export default function TeacherSignInModal({
  closeModal,
  switchToSignUp, // eslint-disable-line @typescript-eslint/no-unused-vars
  onLoginSuccess,
}: TeacherSignInModalProps) {
  const {
    email,
    setEmail,
    password,
    setPassword,
    loading,
    error,
    handleLogin,
  } = useTeacherLogin();

  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false); // UI-only convenience

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // 1) Your existing login flow (do NOT change)
    const success = await handleLogin();
    if (!success) {
      setLocalError(error || "Invalid login attempt.");
      return;
    }

    // 2) Ensure a Supabase Auth session exists in the browser so the server can see it.
    //    If there is already a session, this is a no-op. Otherwise we create one
    //    using the same credentials the teacher just used.
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        await supabase.auth.signInWithPassword({ email, password });
        // Your UserContext will POST the session to /api/auth/callback,
        // which writes sb-* cookies for server API routes.
      }
    } catch {
      // We don't block UI on this—your app login already succeeded.
    }

    onLoginSuccess?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header / Hero band */}
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
            <AcademicCapIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-center text-xl font-semibold">Teacher Login</h2>
          <p className="mt-1 text-center text-xs text-white/80">
            Sign in with your registered teacher account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Email */}
          <label className="block text-sm font-medium text-slate-700">
            Email
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <EnvelopeIcon className="h-5 w-5 text-slate-400" />
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@example.com"
                className="w-full rounded-lg border border-slate-200 pl-10 pr-3 py-2 text-slate-900 placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-slate-300"
                required
                autoComplete="username"
                inputMode="email"
              />
            </div>
          </label>

          {/* Password */}
          <label className="block text-sm font-medium text-slate-700">
            Password
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <LockClosedIcon className="h-5 w-5 text-slate-400" />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 pl-10 pr-10 py-2 text-slate-900 placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-slate-300"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 mr-2 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {/* Errors */}
          {(localError || error) && (
            <p
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              aria-live="assertive"
            >
              {localError || error}
            </p>
          )}

          {/* Actions */}
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
