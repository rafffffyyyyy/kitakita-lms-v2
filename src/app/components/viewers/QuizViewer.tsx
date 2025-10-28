// /src/app/components/QuizViewer.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Squares2X2Icon,
  ArrowUturnLeftIcon,
  ClipboardDocumentListIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import QuizRunner from "./QuizRunner";
import DeleteConfirmModal from "../DeleteConfirmModal";

type QuizRow = {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  type: "quiz";
  time_limit_minutes: number | null;
  available_from: string | null;
  expires_at: string | null;
  max_attempts: number | null;
  reveal_correct_answers: boolean | null;
  is_published: boolean | null;
  shuffle: boolean | null;
};

export default function QuizViewer({ moduleId }: { moduleId: string }) {
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [active, setActive] = useState<QuizRow | null>(null);

  // Delete state
  const [toDelete, setToDelete] = useState<QuizRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select<
          "id,module_id,title,description,type,time_limit_minutes,available_from,expires_at,max_attempts,reveal_correct_answers,is_published,shuffle,created_at"
        >()
        .eq("module_id", moduleId)
        .eq("type", "quiz")
        .eq("is_published", true)
        .order("created_at", { ascending: true });

      if (error) console.error(error);
      setQuizzes(((data as unknown) as QuizRow[]) ?? []);
      setLoading(false);
    })();
  }, [moduleId]);

  // Confirmed delete handler (logic unchanged)
  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const { error } = await supabase.from("quizzes").delete().eq("id", toDelete.id);
      if (error) {
        console.error("Failed to delete quiz:", error);
        setDeleteError(error.message ?? "Failed to delete quiz.");
        setDeleting(false);
        return;
      }
      setQuizzes((prev) => prev.filter((q) => q.id !== toDelete.id));
      setToDelete(null);
    } catch (err: any) {
      console.error("Unexpected delete error:", err);
      setDeleteError(err?.message ?? "Unexpected error.");
    } finally {
      setDeleting(false);
    }
  };

  // Keyboard activation for row
  const handleCardKeyDown = (e: React.KeyboardEvent, q: QuizRow) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActive(q);
    }
  };

  /* --------------------------- PRESENTATION HELPERS --------------------------- */
  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return "—";
    }
  };

  const statusFor = (q: QuizRow) => {
    const now = Date.now();
    const openAt = q.available_from ? Date.parse(q.available_from) : null;
    const closeAt = q.expires_at ? Date.parse(q.expires_at) : null;

    if (openAt && now < openAt) return { label: "Opens soon", tone: "soon" as const };
    if (closeAt && now > closeAt) return { label: "Closed", tone: "closed" as const };
    return { label: "Open", tone: "open" as const };
  };

  const StatusPill = ({
    tone,
    children,
  }: {
    tone: "open" | "closed" | "soon";
    children: React.ReactNode;
  }) => {
    const cls =
      tone === "open"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
        : tone === "soon"
        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
        : "bg-rose-50 text-rose-700 ring-rose-600/20";
    return (
      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>
        {children}
      </span>
    );
  };

  return (
    <div className="h-full">
      {/* Shell with internal scroll; overlap-safe */}
      <div className="mx-auto h-full max-w-6xl px-3 sm:px-4">
        <div className="flex h-full max-h-[85dvh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* ===== Sticky Header (overlap-proof grid) ===== */}
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/70">
            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr,auto]">
              {/* Fluid column */}
              <div className="min-w-0 flex items-center gap-2">
                <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900/5">
                  <Squares2X2Icon className="h-5 w-5 text-slate-800" />
                </span>
                <h2 className="truncate text-lg font-semibold text-slate-900">Quizzes</h2>
                <span className="ml-1 hidden rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 sm:inline">
                  Module list
                </span>
              </div>

              {/* Auto column (buttons) */}
              <div className="min-w-0 sm:justify-self-end">
                <div className="grid grid-cols-[1fr,auto] items-center gap-2 sm:grid-cols-[auto]">
                  {active && (
                    <button
                      onClick={() => setActive(null)}
                      className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:w-auto"
                    >
                      <ArrowUturnLeftIcon className="h-4 w-4" />
                      Back to list
                    </button>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* ===== Scrollable Body ===== */}
          <div className="grow overflow-y-auto px-4 py-4 sm:px-5">
            {/* Active quiz -> runner panel */}
            {active ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <QuizRunner quiz={active} moduleId={moduleId} onBack={() => setActive(null)} />
              </div>
            ) : loading ? (
              <div className="space-y-3">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : quizzes.length === 0 ? (
              <EmptyState title="No quizzes yet" desc="No published quizzes for this module." />
            ) : (
              // === ONE-ROW PER QUIZ LIST ===
              <ul role="list" className="space-y-3">
                {quizzes.map((q) => {
                  const stat = statusFor(q);
                  return (
                    <li key={q.id} className="min-w-0">
                      {/* Focusable row; no nested button conflicts */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActive(q)}
                        onKeyDown={(e) => handleCardKeyDown(e, q)}
                        aria-label={`Open quiz ${q.title || "Untitled quiz"}`}
                        className="group block w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-transparent transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:p-4"
                      >
                        {/* NEW: Three-area grid that prevents overlap:
                            [icon] [content (title + meta grid)] [actions] */}
                        <div className="grid gap-3 sm:grid-cols-[auto,1fr,auto] sm:items-start">
                          {/* Left: Icon */}
                          <div className="flex items-start sm:items-center">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600/10">
                              <ClipboardDocumentListIcon className="h-5 w-5 text-indigo-600" />
                            </span>
                          </div>

                          {/* Middle: Title + meta grid (wraps responsively) */}
                          <div className="min-w-0">
                            {/* Title row */}
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                                {q.title || "Untitled quiz"}
                              </p>
                              <StatusPill tone={stat.tone}>{stat.label}</StatusPill>
                              {q.shuffle ? (
                                <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
                                  Shuffled
                                </span>
                              ) : null}
                            </div>

                            {/* Description (clamped) */}
                            {q.description && (
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                                {q.description}
                              </p>
                            )}

                            {/* Meta pills in a responsive grid — never overlap */}
                            <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                              <MetaPill>
                                {/* clock */}
                                <svg
                                  className="h-4 w-4 shrink-0"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  aria-hidden="true"
                                >
                                  <circle cx="12" cy="12" r="9" />
                                  <path strokeLinecap="round" d="M12 7v5l3 3" />
                                </svg>
                                <span className="truncate">
                                  {q.time_limit_minutes ? `${q.time_limit_minutes} min limit` : "No time limit"}
                                </span>
                              </MetaPill>

                              <MetaPill>
                                {/* attempts */}
                                <svg
                                  className="h-4 w-4 shrink-0"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  aria-hidden="true"
                                >
                                  <path d="M5 7h14M5 12h14M5 17h14" />
                                </svg>
                                <span className="truncate">
                                  Attempts: {q.max_attempts ? q.max_attempts : 1}
                                </span>
                              </MetaPill>

                              {q.available_from && (
                                <MetaPill title={new Date(q.available_from).toLocaleString()}>
                                  {/* calendar */}
                                  <svg
                                    className="h-4 w-4 shrink-0"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    aria-hidden="true"
                                  >
                                    <rect x="3" y="5" width="18" height="16" rx="2" />
                                    <path d="M16 3v4M8 3v4M3 11h18" />
                                  </svg>
                                  <span className="truncate">Opens: {fmtDate(q.available_from)}</span>
                                </MetaPill>
                              )}

                              {q.expires_at && (
                                <MetaPill title={new Date(q.expires_at).toLocaleString()}>
                                  <svg
                                    className="h-4 w-4 shrink-0"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    aria-hidden="true"
                                  >
                                    <rect x="3" y="5" width="18" height="16" rx="2" />
                                    <path d="M16 3v4M8 3v4M3 11h18" />
                                  </svg>
                                  <span className="truncate">Closes: {fmtDate(q.expires_at)}</span>
                                </MetaPill>
                              )}
                            </div>
                          </div>

                          {/* Right: Actions (own column so it never covers content) */}
                          <div className="sm:justify-self-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setToDelete(q);
                              }}
                              title="Delete quiz"
                              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-white p-1.5 text-slate-400 hover:bg-slate-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                              aria-label={`Delete quiz ${q.title || "Untitled quiz"}`}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ===== Sticky Footer ===== */}
          <footer className="sticky bottom-0 z-20 border-t border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/70">
            <div className="grid grid-cols-1 gap-2 sm:auto-cols-max sm:grid-flow-col">
              {!active ? (
                <p className="self-center truncate text-xs text-slate-500">
                  Select a quiz to view details or start an attempt.
                </p>
              ) : (
                <button
                  onClick={() => setActive(null)}
                  className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:w-auto"
                >
                  <ArrowUturnLeftIcon className="h-4 w-4" />
                  Back to list
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {toDelete && (
        <DeleteConfirmModal
          fileName={toDelete.title || "Untitled quiz"}
          onConfirm={handleConfirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}

      {/* Tiny error toast */}
      {deleteError && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md bg-rose-600/95 px-4 py-2 text-sm text-white shadow">
          {deleteError}
          <button onClick={() => setDeleteError(null)} className="ml-3 text-white/80 underline">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Small UI bits ------------------------------ */

function MetaPill({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="min-w-0 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
    >
      {children}
    </span>
  );
}

function EmptyState({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full bg-slate-900/5">
        <Squares2X2Icon className="h-5 w-5 text-slate-800" />
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {desc && <p className="mt-1 text-xs text-slate-500">{desc}</p>}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto,1fr,auto] sm:items-start">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-200" />
        <div className="min-w-0 space-y-2">
          <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-64 animate-pulse rounded bg-slate-200" />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            <div className="h-6 animate-pulse rounded-full bg-slate-200" />
            <div className="h-6 animate-pulse rounded-full bg-slate-200" />
            <div className="h-6 animate-pulse rounded-full bg-slate-200" />
            <div className="h-6 animate-pulse rounded-full bg-slate-200" />
          </div>
        </div>
        <div className="h-7 w-7 animate-pulse rounded-lg bg-slate-200 justify-self-end" />
      </div>
    </div>
  );
}
