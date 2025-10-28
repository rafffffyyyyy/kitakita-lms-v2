// /src/app/components/AdminSignInModal.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  ShieldCheckIcon,
  EnvelopeIcon,
  LockClosedIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useUser } from "@/app/UserContext";

/* -------------------------- Version-proof types -------------------------- */
type PwResp = Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
type OtpVerifyResp = Awaited<ReturnType<typeof supabase.auth.verifyOtp>>;
type OtpSendResp = Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>;
type UserResp = Awaited<ReturnType<typeof supabase.auth.getUser>>;
type SingleResp<T> = { data: T | null; error: any; status: number };

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
  const inputRef = useRef<HTMLInputElement | null>(null);

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

      // Simple, direct verify (no signOut, no polling)
      const { data, error } = await withTimeout<OtpVerifyResp>(
        supabase.auth.verifyOtp({ email, token, type: "email" }),
        30000,
        "verifyOtp"
      );
      if (error) throw error;

      // Some SDK versions may not return session on `data`; ensure user exists
      const userRes: UserResp = await withTimeout(
        supabase.auth.getUser(),
        8000,
        "getUser"
      );
      if (!data?.user && !userRes.data.user) {
        throw new Error("Verification succeeded but no user session was found.");
      }

      onPassed();
    } catch (e: any) {
      setErr(e?.message ?? "Invalid or expired code.");
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await withTimeout<OtpSendResp>(
        supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }),
        30000,
        "resendOtp"
      );
      if (error) throw error;
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
              disabled={busy}
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:underline disabled:opacity-60"
            >
              <ArrowPathIcon className="h-4 w-4" />
              {busy ? "Sending…" : "Resend code"}
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

/* --------------------------- Admin Sign-in UI --------------------------- */
export default function AdminSignInModal({ closeModal }: { closeModal: () => void }) {
  const router = useRouter();
  const { refreshRole } = useUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  // Step 1: send OTP
  const startLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || sendingOtp) return;

    setError(null);

    if (!email || !password) {
      setError("Please enter your email & password.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setSendingOtp(true);
    try {
      const { error: otpErr } = await withTimeout<OtpSendResp>(
        supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: { shouldCreateUser: false },
        }),
        30000,
        "sendOtp"
      );
      if (otpErr) throw otpErr;
      setShowOtp(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send verification code.");
    } finally {
      setSendingOtp(false);
    }
  };

  // Step 2: after OTP → password auth → admin check
  const afterOtpPassed = async () => {
    setShowOtp(false); // hide modal immediately
    setLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      // Straight password sign-in (no poll, no extra signOut)
      const { data, error: authErr } = await withTimeout<PwResp>(
        supabase.auth.signInWithPassword({ email: normalizedEmail, password }),
        30000,
        "passwordLogin"
      );
      if (authErr || !data?.user) {
        setError("Email or password is incorrect.");
        closeModal();
        router.push("/");
        return;
      }

      const userId = data.user.id;

      // Check admins table
      const adminCheck = await withTimeout<SingleResp<{ id: string }>>(
        Promise.resolve(supabase.from("admins").select("id").eq("id", userId).maybeSingle()),
        15000,
        "adminCheck"
      );
      if (adminCheck.error) {
        setError(`Admin check error: ${adminCheck.error.message}`);
        await supabase.auth.signOut(); // normal sign out if role check fails
        closeModal();
        router.push("/");
        return;
      }
      if (!adminCheck.data) {
        setError("You are not authorized as admin.");
        await supabase.auth.signOut();
        closeModal();
        router.push("/");
        return;
      }

      // Role ok → continue
      await withTimeout(Promise.resolve(refreshRole()), 8000, "refreshRole");
      router.replace("/adminDashboard");
      router.refresh();
      closeModal();
    } catch (err: any) {
      setError("Unexpected error. Please try again.");
      await supabase.auth.signOut();
      closeModal();
      router.push("/");
    } finally {
      setLoading(false);
    }
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
            <ShieldCheckIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-center text-xl font-semibold">Admin Login</h2>
          <p className="mt-1 text-center text-xs text-white/80">
            Enter email & password. We will send a 6-digit code first.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={startLogin} className="space-y-4 p-6">
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

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" aria-live="assertive">
              {error}
            </p>
          )}

          <button
            disabled={loading || sendingOtp}
            type="submit"
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
