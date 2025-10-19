// /app/quarters/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/app/UserContext";
import BackButton from "@/app/components/BackButton";
import {
  AcademicCapIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

type Role = "teacher" | "student" | "admin" | null;

interface Quarter {
  id: string;
  name: string;
  teacher_id: string;
}

/* ----------------------- Tiny in-memory cache (TTL) ----------------------- */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const quartersCache = new Map<string, { ts: number; data: Quarter[] }>();

function getCache(key: string) {
  const hit = quartersCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    quartersCache.delete(key);
    return null;
  }
  return hit.data;
}
function setCache(key: string, data: Quarter[]) {
  quartersCache.set(key, { ts: Date.now(), data });
}

export default function QuartersPage() {
  const { role, userId } = useUser() as { role: Role; userId: string | null };

  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [showDebug, setShowDebug] = useState(false);
  const [query, setQuery] = useState("");

  const authUidRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!role) return;

    let cancel = false;

    const resolveAuthUid = async (): Promise<string | null> => {
      // Prefer context (no extra IO)
      if (userId) return userId;
      // Fallback (only if needed)
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user?.id) return null;
      return data.user.id;
    };

    const run = async () => {
      setLoading(true);
      setErrorText(null);

      const authUid = await resolveAuthUid();
      authUidRef.current = authUid;

      if (!authUid && role !== "admin") {
        if (!cancel && mountedRef.current) {
          setErrorText("You are not signed in. Please sign in first.");
          setQuarters([]);
          setLoading(false);
        }
        return;
      }

      const cacheKey = `quarters:${role}:${authUid ?? "admin"}`;

      // Serve from cache if fresh
      const cached = getCache(cacheKey);
      if (cached) {
        if (!cancel && mountedRef.current) {
          setQuarters(cached);
          setLoading(false);
        }
        // Background revalidate
        void revalidate(cacheKey, role, authUid);
        return;
      }

      // No cache → fetch now
      try {
        const rows = await fetchQuarters(role, authUid);
        if (!cancel && mountedRef.current) {
          setQuarters(rows);
          setCache(cacheKey, rows);
        }
      } catch (e: any) {
        console.error("❌ Quarters fetch failed:", e?.message || e);
        if (!cancel && mountedRef.current) {
          setErrorText("Failed to load quarters.");
          setQuarters([]);
        }
      } finally {
        if (!cancel && mountedRef.current) setLoading(false);
      }
    };

    run();
    return () => {
      cancel = true;
    };
  }, [role, userId]);

  // Background revalidation to refresh cache without blocking UI
  async function revalidate(cacheKey: string, role: Role, authUid: string | null) {
    try {
      const rows = await fetchQuarters(role, authUid);
      if (!mountedRef.current) return;
      setCache(cacheKey, rows);
      // If user hasn’t navigated away, also refresh on screen
      setQuarters((prev) => {
        // shallow compare to avoid flicker
        const same =
          prev.length === rows.length &&
          prev.every((p, i) => p.id === rows[i].id && p.name === rows[i].name && p.teacher_id === rows[i].teacher_id);
        return same ? prev : rows;
      });
    } catch {
      // silent revalidate error
    }
  }

  /**
   * Single query for all roles — relies entirely on RLS.
   * - Teacher: RLS returns only their quarters (via quarters_select policy).
   * - Student: RLS returns only quarters of their teacher.
   * - Admin: RLS returns all.
   * No client-side filter needed.
   */
  async function fetchQuarters(_role: Role, _authUid: string | null): Promise<Quarter[]> {
    const { data, error } = await supabase
      .from("quarters")
      .select("id,name,teacher_id")
      .order("name", { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  const total = quarters.length;

  // client-side search (no extra IO)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quarters;
    return quarters.filter((x) => x.name.toLowerCase().includes(q));
  }, [quarters, query]);

  const accents = useMemo(
    () => [
      {
        ring: "ring-indigo-200",
        glow: "shadow-[0_10px_30px_-12px_rgba(79,70,229,0.45)]",
        grad: "from-indigo-500/10 via-indigo-400/10 to-indigo-500/10",
        badge: "bg-indigo-50 text-indigo-700",
        number: "text-indigo-600",
      },
      {
        ring: "ring-fuchsia-200",
        glow: "shadow-[0_10px_30px_-12px_rgba(217,70,239,0.45)]",
        grad: "from-fuchsia-500/10 via-fuchsia-400/10 to-fuchsia-500/10",
        badge: "bg-fuchsia-50 text-fuchsia-700",
        number: "text-fuchsia-600",
      },
      {
        ring: "ring-emerald-200",
        glow: "shadow-[0_10px_30px_-12px_rgba(16,185,129,0.45)]",
        grad: "from-emerald-500/10 via-emerald-400/10 to-emerald-500/10",
        badge: "bg-emerald-50 text-emerald-700",
        number: "text-emerald-600",
      },
      {
        ring: "ring-amber-200",
        glow: "shadow-[0_10px_30px_-12px_rgba(245,158,11,0.45)]",
        grad: "from-amber-500/10 via-amber-400/10 to-amber-500/10",
        badge: "bg-amber-50 text-amber-700",
        number: "text-amber-600",
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Page header sits below global header (h-14) */}
      <header className="sticky top-14 z-20 border-b border-slate-200/60 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50">
        <div className="mx-auto max-w-6xl w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 sm:px-6 h-14">
          <div className="min-w-0">
            <BackButton />
          </div>

          <div className="min-w-0 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10">
              <AcademicCapIcon className="h-5 w-5 text-indigo-600" />
            </span>
            <div className="min-w-0 flex flex-col">
              <h1 className="truncate text-base sm:text-lg font-semibold tracking-tight text-slate-900">
                English 8 Most Essential Learning Competencies
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                  <CalendarDaysIcon className="h-3.5 w-3.5" />
                  {total} {total === 1 ? "Quarter" : "Quarters"}
                </span>
                {!!role && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 whitespace-nowrap capitalize">
                    <SparklesIcon className="h-3.5 w-3.5" />
                    {role}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <label htmlFor="q" className="sr-only">
                Search quarters
              </label>
              <div className="relative min-w-0 w-44 md:w-64">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="q"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search quarters…"
                  className="w-full pl-8 pr-2 h-9 rounded-md border border-slate-200 bg-white/70 outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDebug((s) => !s)}
              className="whitespace-nowrap w-full sm:w-auto rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title="Toggle debug"
            >
              Debug
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 pb-10 min-w-0">
        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5">
                <div className="h-16 w-16 animate-pulse rounded-2xl bg-slate-200" />
                <div className="mt-3 h-5 w-2/3 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 h-9 w-24 animate-pulse rounded-lg bg-slate-200" />
              </div>
            ))}
          </div>
        )}

        {!loading && errorText && (
          <div className="mx-auto mb-4 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div className="text-sm">{errorText}</div>
          </div>
        )}

        {!loading && !errorText && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {filtered.slice(0, 4).map((q, idx) => {
              const accents = [
                {
                  ring: "ring-indigo-200",
                  glow: "shadow-[0_10px_30px_-12px_rgba(79,70,229,0.45)]",
                  grad: "from-indigo-500/10 via-indigo-400/10 to-indigo-500/10",
                  badge: "bg-indigo-50 text-indigo-700",
                  number: "text-indigo-600",
                },
                {
                  ring: "ring-fuchsia-200",
                  glow: "shadow-[0_10px_30px_-12px_rgba(217,70,239,0.45)]",
                  grad: "from-fuchsia-500/10 via-fuchsia-400/10 to-fuchsia-500/10",
                  badge: "bg-fuchsia-50 text-fuchsia-700",
                  number: "text-fuchsia-600",
                },
                {
                  ring: "ring-emerald-200",
                  glow: "shadow-[0_10px_30px_-12px_rgba(16,185,129,0.45)]",
                  grad: "from-emerald-500/10 via-emerald-400/10 to-emerald-500/10",
                  badge: "bg-emerald-50 text-emerald-700",
                  number: "text-emerald-600",
                },
                {
                  ring: "ring-amber-200",
                  glow: "shadow-[0_10px_30px_-12px_rgba(245,158,11,0.45)]",
                  grad: "from-amber-500/10 via-amber-400/10 to-amber-500/10",
                  badge: "bg-amber-50 text-amber-700",
                  number: "text-amber-600",
                },
              ];
              const a = accents[idx % accents.length];
              const match = /(^|\s)(\d+)(st|nd|rd|th)/i.exec(q.name);
              const num = match ? match[2] : String(idx + 1);
              return (
                <QuarterTile
                  key={q.id}
                  href={`/quarters/${q.id}`}
                  title={q.name}
                  number={num}
                  accent={a}
                />
              );
            })}
          </div>
        )}

        {!loading && !errorText && filtered.length === 0 && (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h3 className="text-base font-semibold text-slate-900">No quarters found</h3>
            <p className="mt-1 text-sm text-slate-600">
              {query
                ? "Try a different search term."
                : role === "student"
                ? "Your teacher hasn’t published any quarters yet."
                : role === "teacher"
                ? "Create your first quarter to get started."
                : "There are no quarters to display at the moment."}
            </p>
          </div>
        )}

        {showDebug && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
            <div className="mb-2 font-medium">Debug</div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap">
{JSON.stringify(
  {
    role,
    authUid: authUidRef.current,
    count: quarters.length,
    rows: quarters.map((r) => ({ id: r.id, name: r.name, teacher_id: r.teacher_id })),
  },
  null,
  2
)}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}

function QuarterTile({
  title,
  number,
  href,
  accent,
}: {
  title: string;
  number: string;
  href: string;
  accent: {
    ring: string;
    glow: string;
    grad: string;
    badge: string;
    number: string;
  };
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={[
        "group relative block overflow-hidden rounded-2xl border border-slate-200 bg-white p-5",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30",
      ].join(" ")}
    >
      <div
        aria-hidden
        className={[
          "pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full blur-2xl bg-gradient-to-br",
          accent.grad,
        ].join(" ")}
      />
      <div
        className={[
          "inline-flex h-14 w-14 items-center justify-center rounded-xl bg-white/70 backdrop-blur ring-2",
          accent.ring,
          accent.glow,
        ].join(" ")}
      >
        <span className={["text-2xl font-extrabold", accent.number].join(" ")}>{number}</span>
      </div>
      <div className="mt-3">
        <h3 className="line-clamp-1 text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
          Explore the modules, resources, and activities for this quarter.
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span
          className={[
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium",
            accent.badge,
          ].join(" ")}
        >
          <AcademicCapIcon className="h-4 w-4" />
          English 8
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-700">
          Open
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
