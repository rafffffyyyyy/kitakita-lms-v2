"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Squares2X2Icon,
  ArrowUturnLeftIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import QuizRunner from "./QuizRunner";

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

  return (
    <div className="h-full">
      {/* Panel shell: prevents overflow, scrolls internally */}
      <div className="mx-auto h-full max-w-5xl px-3 sm:px-4">
        <div className="flex h-full max-h-[85dvh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* ===== Sticky Header ===== */}
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/70">
            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr,auto]">
              {/* Title */}
              <div className="min-w-0 flex items-center gap-2">
                <Squares2X2Icon className="h-5 w-5 text-slate-700" />
                <h2 className="truncate text-lg font-semibold text-slate-900">Quizzes</h2>
                <span className="ml-1 hidden rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 sm:inline">
                  Module list
                </span>
              </div>

              {/* Toolbar (non-overlapping, responsive) */}
              <div className="min-w-0 sm:justify-self-end">
                <div className="flex flex-wrap items-center gap-2">
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
            {/* Active quiz -> wrap runner to avoid leaking outside panel */}
            {active ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <QuizRunner quiz={active} moduleId={moduleId} onBack={() => setActive(null)} />
              </div>
            ) : loading ? (
              <div className="space-y-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard className="hidden sm:block" />
              </div>
            ) : quizzes.length === 0 ? (
              <EmptyState
                title="No quizzes yet"
                desc="No published quizzes for this module."
              />
            ) : (
              <ul
                role="list"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {quizzes.map((q) => (
                  <li key={q.id} className="min-w-0">
                    <button
                      onClick={() => setActive(q)}
                      className="group block h-full w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      aria-label={`Open quiz ${q.title || "Untitled quiz"}`}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-2">
                        <ClipboardDocumentListIcon className="h-5 w-5 text-slate-600 group-hover:text-slate-900" />
                        <div className="min-w-0 truncate font-medium text-slate-900">
                          {q.title || "Untitled quiz"}
                        </div>
                      </div>

                      {/* Description */}
                      {q.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                          {q.description}
                        </p>
                      )}

                      {/* Meta */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <MetaPill>
                          {/* clock icon */}
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path strokeLinecap="round" d="M12 7v5l3 3" />
                          </svg>
                          <span className="truncate">
                            {q.time_limit_minutes ? `${q.time_limit_minutes} min limit` : "No time limit"}
                          </span>
                        </MetaPill>

                        <MetaPill>
                          {/* attempts icon */}
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M5 7h14M5 12h14M5 17h14" />
                          </svg>
                          <span className="truncate">
                            Attempts: {q.max_attempts ? q.max_attempts : 1}
                          </span>
                        </MetaPill>

                        {q.available_from && (
                          <MetaPill title={new Date(q.available_from).toLocaleString()}>
                            {/* calendar icon */}
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <rect x="3" y="5" width="18" height="16" rx="2" />
                              <path d="M16 3v4M8 3v4M3 11h18" />
                            </svg>
                            <span className="truncate">
                              Opens: {new Date(q.available_from).toLocaleDateString()}
                            </span>
                          </MetaPill>
                        )}

                        {q.expires_at && (
                          <MetaPill title={new Date(q.expires_at).toLocaleString()}>
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <rect x="3" y="5" width="18" height="16" rx="2" />
                              <path d="M16 3v4M8 3v4M3 11h18" />
                            </svg>
                            <span className="truncate">
                              Closes: {new Date(q.expires_at).toLocaleDateString()}
                            </span>
                          </MetaPill>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
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
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
    >
      {children}
    </span>
  );
}

function EmptyState({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {desc && <p className="mt-1 text-xs text-slate-500">{desc}</p>}
    </div>
  );
}

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 animate-pulse rounded-md bg-slate-200" />
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-28 animate-pulse rounded-full bg-slate-200" />
        <div className="h-6 w-24 animate-pulse rounded-full bg-slate-200" />
      </div>
    </div>
  );
}
