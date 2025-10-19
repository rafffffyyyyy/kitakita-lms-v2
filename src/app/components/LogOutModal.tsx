// /src/app/components/LogOutModal.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface LogOutModalProps {
  closeModal: () => void;
  /** Optional: parent can handle redirect/cleanup. If omitted, we fallback to router.replace("/") */
  onLogOut?: () => void;
}

/** Soft timeout that NEVER throws. Returns { error } when timed out. */
async function softTimeout<T extends { error?: any }>(
  p: Promise<T>,
  ms = 7000,
  label = "op"
): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => {
      console.warn(`[logout] ${label} soft-timeout after ${ms}ms`);
      // emulate a “successful” resolution but with an error payload
      resolve({ error: new Error(`${label} timed out`) } as T);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        // normalize into { error }
        resolve({ error: e } as T);
      }
    );
  });
}

export default function LogOutModal({ closeModal, onLogOut }: LogOutModalProps) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "local" | "global" | "redirect">("idle");
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !loading && closeModal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, closeModal]);

  const handleLogOut = async () => {
    if (loading) return;
    setLoading(true);
    setErr(null);

    // Keep modal open while we log out so we can show status/errors.
    // Strategy:
    // 1) Try LOCAL sign out (fast, clears this tab).
    // 2) Optionally try GLOBAL revoke (best-effort; soft-timeout, never throws).
    // 3) Clear local UI state.
    // 4) Redirect home and refresh.
    try {
      // 1) LOCAL sign out
      setStep("local");
      const localResult = await softTimeout(
        supabase.auth.signOut({ scope: "local" }),
        1000,
        "local signOut"
      );
      if (localResult.error) {
        console.warn("[logout] local signOut error:", localResult.error);
        // Not fatal—continue with best-effort global or redirect anyway.
      }

      // 2) GLOBAL (best-effort, may hang on some networks/extensions)
      setStep("global");
      const globalResult = await softTimeout(
        supabase.auth.signOut({ scope: "global" }),
        5000,
        "global signOut"
      );
      if (globalResult.error) {
        console.warn("[logout] global signOut best-effort error:", globalResult.error);
        // Don’t block logout UX—continue.
      }

      // 3) Clear any app-local state (don’t let stale role/UI persist)
      try {
        localStorage.removeItem("role");
        localStorage.removeItem("sidebar-collapsed");
      } catch (e) {
        // ignore storage errors
      }

      // 4) Redirect home and refresh UI
      setStep("redirect");
      if (onLogOut) {
        // Let parent clean up if they provided a hook
        await Promise.resolve(onLogOut());
      } else {
        router.replace("/");
        // refresh after a tick so guards/components re-read session synchronously
        startTransition(() => {
          setTimeout(() => router.refresh(), 50);
        });
      }

      // Close the modal at the very end so user sees the result until we move away.
      closeModal();
    } catch (e: any) {
      // We should not get here because softTimeout never throws,
      // but keep a hard catch to prevent unhandled runtime errors.
      console.error("[logout] unexpected error (caught):", e);
      setErr(e?.message || "Unexpected error during logout.");
      // Still try to get them out of protected areas
      try {
        router.replace("/");
        startTransition(() => {
          setTimeout(() => router.refresh(), 50);
        });
      } catch {}
    } finally {
      setLoading(false);
      setStep("idle");
    }
  };

  const onOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Disable closing while loading to avoid mid-flight issues
    if (!loading && e.target === e.currentTarget) closeModal();
  };

  const statusText =
    step === "local"
      ? "Signing you out (this tab)…"
      : step === "global"
      ? "Finishing sign out across devices…"
      : step === "redirect"
      ? "Redirecting…"
      : "Are you sure you want to log out?";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
    >
      <div className="bg-white p-6 rounded-md w-full max-w-sm shadow-lg">
        <h2 id="logout-title" className="text-xl font-semibold mb-2">Log Out</h2>
        <p className="mb-4 text-slate-700">{loading ? statusText : "Are you sure you want to log out?"}</p>

        {err && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            ref={confirmRef}
            onClick={handleLogOut}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? "Signing out…" : "Yes, Log Out"}
          </button>
          <button
            onClick={closeModal}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
  