"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  ShieldCheckIcon,
  EnvelopeIcon,
  LockClosedIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useUser } from "@/app/UserContext"; // ✅ so we can refreshRole() after login

export default function AdminSignInModal({ closeModal }: { closeModal: () => void }) {
  const router = useRouter();
  const { refreshRole } = useUser(); // ✅ get role updater
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // 👈 match teacher UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // ✅ avoid double submit
    setLoading(true);
    setError(null);
    setDebug(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      console.log("🔑 Signing in with Supabase…");
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      console.log("Auth result:", data, authErr);

      if (authErr || !data?.user) {
        const msg =
          authErr?.message?.includes("Invalid login credentials")
            ? "Invalid admin credentials."
            : authErr?.message || "Login failed.";
        setError(msg);
        setLoading(false);
        return;
      }

      const userId = data.user.id;
      console.log("✅ Authenticated user id:", userId);

      console.log("🗂️ Checking admins table for id:", userId);
      const { data: row, error: adminErr, status } = await supabase
        .from("admins")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      console.log("Admins query result:", { row, adminErr, status });

      if (adminErr) {
        setError(`Admin check error: ${adminErr.message}`);
        setDebug(JSON.stringify(adminErr, null, 2));
        setLoading(false);
        return;
      }

      if (!row) {
        setError("You are not authorized as admin (no row found in admins).");
        setLoading(false);
        return;
      }

      // ✅ update role context immediately for the rest of the app
      await refreshRole();

      console.log("✅ Admin verified, redirecting…");
      router.replace("/adminDashboard");
      router.refresh();
      closeModal();
    } catch (err: any) {
      console.error("❌ Unexpected admin login error:", err);
      setError("Unexpected error. See console logs.");
      setDebug(err?.message || JSON.stringify(err));
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
        {/* Header / Hero band (match teacher style) */}
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
            <ShieldCheckIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-center text-xl font-semibold">Admin Login</h2>
          <p className="mt-1 text-center text-xs text-white/80">
            Sign in with your administrator account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          {/* Email */}
          <label className="block text-sm font-medium text-slate-700">
            Email
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <EnvelopeIcon className="h-5 w-5 text-slate-400" />
              </span>
              <input
                type="email"
                placeholder="admin@example.com"
                className="w-full rounded-lg border border-slate-200 pl-10 pr-3 py-2 text-slate-900 placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                inputMode="email"
              />
            </div>
          </label>

          {/* Password (with show/hide like teacher) */}
          <label className="block text-sm font-medium text-slate-700">
            Password
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <LockClosedIcon className="h-5 w-5 text-slate-400" />
              </span>
              <input
                type={showPassword ? "text" : "password"}
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
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 mr-2 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {/* Errors */}
          {error && (
            <p
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              aria-live="assertive"
            >
              {error}
            </p>
          )}

          {/* Optional debug (collapsed style) */}
          {debug && (
            <pre className="max-h-40 overflow-auto rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {debug}
            </pre>
          )}

          {/* Actions */}
          <button
            disabled={loading}
            type="submit"
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
