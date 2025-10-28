// /app/components/TeacherSignInModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  AcademicCapIcon,
  EnvelopeIcon,
  LockClosedIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabase";
import { useTeacherLogin } from "../auth/teacherAuth";

/* -------------------------- Version-proof types -------------------------- */
type OtpSendResp = Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>;
type OtpVerifyResp = Awaited<ReturnType<typeof supabase.auth.verifyOtp>>;

/* ------------------------- helper: timeout wrapper ------------------------ */
async function withTimeout<T>(p: PromiseLike<T>, ms = 30000, tag = "request"): Promise<T> {
  return (await Promise.race<T>([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${tag} timed out after ${ms}ms`)), ms)
    ),
  ])) as T;
}

/* --------------------------- Inline OTP Modal --------------------------- */
function OtpVerifyModal({
  email,
  onClose,
  onPassed,
}: {
  email: string;
  onClose: () => void;
  onPassed: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0); // optional resend cooldown
  const inputRef = useRef<HTMLInputElement | null>(null);

  // optional: simple 15s cooldown for resend
  useEffect(() => {
    let t: any;
    if (cooldown > 0) {
      t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    }
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || code.trim().length !== 6) return;

    setBusy(true);
    setErr(null);

    try {
      const token = code.trim();
      const { error } = await withTimeout<OtpVerifyResp>(
        supabase.auth.verifyOtp({ email, token, type: "email" }),
        20000,
        "verifyOtp"
      );
      if (error) throw error;

      onPassed();
    } catch (e: any) {
      setErr(e?.message ?? "Invalid or expired code.");
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await withTimeout<OtpSendResp>(
        supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }),
        20000,
        "resendOtp"
      );
      if (error) throw error;
      setCooldown(15);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to resend code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">Enter 6-digit verification code</h2>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={verify} className="p-5 space-y-3">
          <p className="text-sm text-slate-600">
            We sent a code to <b>{email}</b>. Check your inbox and spam folder.
          </p>

          <input
            ref={inputRef}
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full rounded-lg border px-3 py-2 text-center tracking-widest text-lg"
            placeholder="••••••"
            aria-label="6-digit code"
            disabled={busy}
          />

          {err && (
            <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={resend}
              disabled={busy || cooldown > 0}
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:underline disabled:opacity-60"
            >
              <ArrowPathIcon className="h-4 w-4" />
              {busy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            >
              <CheckCircleIcon className="h-5 w-5" />
              {busy ? "Verifying…" : "Verify"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ----------------------------- Component ----------------------------- */
interface TeacherSignInModalProps {
  closeModal: () => void;
  switchToSignUp: () => void; // kept for compatibility but not used
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
    loading,     // from your existing hook
    error,       // from your existing hook
    handleLogin, // your existing login flow
  } = useTeacherLogin();

  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // OTP states
  const [sendingOtp, setSendingOtp] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  // Step 1: send OTP first
  const startLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setLocalError("Please enter your email & password.");
      return;
    }

    if (sendingOtp || loading) return;
    setSendingOtp(true);

    try {
      const { error: otpErr } = await withTimeout<OtpSendResp>(
        supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: { shouldCreateUser: false },
        }),
        20000,
        "sendOtp"
      );
      if (otpErr) throw otpErr;

      setShowOtp(true);
    } catch (e: any) {
      setLocalError(e?.message ?? "Failed to send verification code.");
    } finally {
      setSendingOtp(false);
    }
  };

  // Step 2: after OTP passes → run your existing handleLogin()
  const afterOtpPassed = async () => {
    setShowOtp(false);

    // 2a) Run your original teacher login logic
    const ok = await handleLogin();
    if (!ok) {
      setLocalError(error || "Invalid login attempt.");
      return;
    }

    // 2b) Ensure a Supabase session exists (same as your current code)
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        await supabase.auth.signInWithPassword({ email, password });
      }
    } catch {
      // don't block UI; your app login already succeeded
    }

    onLoginSuccess?.();
    closeModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" aria-modal="true" role="dialog">
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
            Enter email & password. We’ll send a 6-digit code first.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={startLogin} className="space-y-4 p-6">
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
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" aria-live="assertive">
              {localError || error}
            </p>
          )}

          {/* Actions */}
          <button
            type="submit"
            disabled={loading || sendingOtp}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white
                       hover:bg-slate-800 disabled:opacity-60"
          >
            {sendingOtp ? "Sending code…" : loading ? "Logging in…" : "Log In"}
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

      {showOtp && (
        <OtpVerifyModal
          email={email.trim().toLowerCase()}
          onClose={() => setShowOtp(false)}
          onPassed={afterOtpPassed}
        />
      )}
    </div>
  );
}
