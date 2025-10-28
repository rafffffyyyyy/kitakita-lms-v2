"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ShieldCheckIcon,
  EnvelopeIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

export default function OtpModal({
  email,
  open,
  onCancel,
  onVerified,
  resendCooldownSec = 20, // you asked to cut from 60s → 20s
}: {
  email: string;
  open: boolean;
  onCancel: () => void;
  onVerified: () => void;
  resendCooldownSec?: number;
}) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 100);
    // send OTP as soon as the modal opens
    void sendOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!cooldown) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const codeOk = useMemo(() => /^[0-9]{6}$/.test(code.trim()), [code]);

  const sendOtp = async () => {
    if (sending) return;
    setErr(null);
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false, // no phantom users
          // emailRedirectTo: `${location.origin}/`, // optional
        },
      });
      if (error) throw error;
      setCooldown(resendCooldownSec);
    } catch (e: any) {
      setErr(e?.message || "Failed to send verification code.");
    } finally {
      setSending(false);
    }
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!codeOk || verifying) return;
    setErr(null);
    setVerifying(true);
    try {
      // This will sign in a temporary session for the email owner.
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      if (!data?.session) throw new Error("Invalid code.");

      // Immediately clear the OTP session — we still require password next.
      await supabase.auth.signOut({ scope: "local" });

      setOk(true);
      setTimeout(() => {
        setOk(false);
        onVerified();
      }, 200);
    } catch (e: any) {
      setErr(e?.message || "Verification failed. Check the code and try again.");
    } finally {
      setVerifying(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Email verification"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600/10">
            <ShieldCheckIcon className="h-5 w-5 text-indigo-600" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">Verify your email</h2>
          <button
            onClick={onCancel}
            className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={verify} className="px-5 py-4 space-y-4">
          <div className="text-sm text-slate-600">
            We sent a 6-digit code to <b>{email}</b>.
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-2.5">
              <EnvelopeIcon className="h-5 w-5 text-slate-400" />
            </span>
            <input
              ref={inputRef}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 py-2 text-center text-lg tracking-widest
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {err && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          )}
          {ok && !err && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircleIcon className="h-5 w-5" />
              Verified!
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={sendOtp}
                disabled={sending || cooldown > 0}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {sending ? (
                  <span className="inline-flex items-center gap-1">
                    <ArrowPathIcon className="h-4 w-4 animate-spin" /> Sending…
                  </span>
                ) : cooldown > 0 ? (
                  `Resend in ${cooldown}s`
                ) : (
                  "Resend code"
                )}
              </button>

              <button
                type="submit"
                disabled={!codeOk || verifying}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {verifying ? "Verifying…" : "Verify"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
