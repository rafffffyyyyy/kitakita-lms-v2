"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ClipboardDocumentListIcon,
  ChartBarSquareIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import type { RosterStudent } from "@/lib/types/progress";

/* ------------------------------- Types ------------------------------- */
type QuarterRow = { id: string; name: string | null };
type ModuleRow = { id: string; title: string | null; quarter_id: string | null };

type AssignmentRow = {
  id: string;
  name: string | null;
  module_id: string;
  max_score: number | null;
};
type AssignmentSubmissionRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  grade: number | null;
  submitted_at: string | null;
  attempt_number: number | null;
  is_latest: boolean | null;
};

type QuizRow = {
  id: string;
  title: string | null;
  type: "pre_test" | "post_test" | "quiz";
  module_id: string;
};
type QuizAttemptRow = {
  id: string;
  quiz_id: string;
  student_id: string;
  submitted_at: string | null;
  score: number | string | null; // normalize via Number()
  attempt_number: number | null;
};
type QuizQuestionRow = { quiz_id: string; points: number | null };

type Filters = {
  quarterId: "all" | string;
  moduleId: "all" | string;
};

type Props = {
  student: RosterStudent | null;
};

/* ----------------------------- Utilities ---------------------------- */
const Chip = ({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
  >
    {children}
  </span>
);

/** Safe sum for arrays that may contain null/undefined */
function sumLoose(arr: Array<number | null | undefined>): number {
  let total = 0;
  for (const n of arr) total += n ?? 0;
  return total;
}

/* ------------------------------- Component ------------------------------- */
export default function StudentOverviewPane({ student }: Props) {
  const [quarters, setQuarters] = useState<QuarterRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [filters, setFilters] = useState<Filters>({
    quarterId: "all",
    moduleId: "all",
  });

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [submissions, setSubmissions] = useState<
    Record<string, AssignmentSubmissionRow | undefined>
  >({});
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [attempts, setAttempts] = useState<
    Record<string, QuizAttemptRow | undefined>
  >({});
  const [quizTotals, setQuizTotals] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NOTE: should be students.id == auth.users.id
  const rosterStudentId = student?.id ?? null;

  /* ------------------------------ Load filters ----------------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("quarters")
        .select("id,name")
        .order("created_at", { ascending: true });
      if (!mounted) return;
      setQuarters((data ?? []) as QuarterRow[]);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const base = supabase
        .from("modules")
        .select("id,title,quarter_id")
        .order("created_at", { ascending: true });
      const { data } =
        filters.quarterId === "all"
          ? await base
          : await base.eq("quarter_id", filters.quarterId);
      if (!mounted) return;
      const rows = (data ?? []) as ModuleRow[];
      setModules(rows);
      if (
        filters.moduleId !== "all" &&
        !rows.some((m) => m.id === filters.moduleId)
      ) {
        setFilters((f) => ({ ...f, moduleId: "all" }));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [filters.quarterId]);

  /* --------------------- Load Assignments & Quizzes --------------------- */
  useEffect(() => {
    if (!rosterStudentId) return;
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // resolve moduleIds for current filters
        let moduleIds = (modules ?? [])
          .filter((m) => (filters.moduleId === "all" ? true : m.id === filters.moduleId))
          .map((m) => m.id);

        if (filters.quarterId === "all" && moduleIds.length === 0) {
          const { data: allMods } = await supabase.from("modules").select("id");
          moduleIds = (allMods ?? []).map((m: any) => m.id);
        }

        /* ---- Assignments ---- */
        let aRows: AssignmentRow[] = [];
        if (moduleIds.length > 0) {
          const { data, error } = await supabase
            .from("assignments")
            .select("id,name,module_id,max_score")
            .in("module_id", moduleIds)
            .order("created_at", { ascending: true });
          if (error) throw error;
          aRows = (data ?? []) as AssignmentRow[];
        }
        setAssignments(aRows);

        // latest submissions per assignment for this student (students.id)
        const subMap: Record<string, AssignmentSubmissionRow> = {};
        if (aRows.length > 0) {
          const ids = aRows.map((a) => a.id);
          const { data, error } = await supabase
            .from("assignment_submissions")
            .select(
              "id,assignment_id,student_id,grade,submitted_at,attempt_number,is_latest"
            )
            .eq("student_id", rosterStudentId)
            .in("assignment_id", ids)
            .order("submitted_at", { ascending: false });
          if (error) throw error;

          const byAid: Map<string, AssignmentSubmissionRow[]> = new Map();
          (data ?? []).forEach((s) => {
            const arr = byAid.get(s.assignment_id) ?? [];
            arr.push(s as AssignmentSubmissionRow);
            byAid.set(s.assignment_id, arr);
          });

          byAid.forEach((arr, aid) => {
            const latestByFlag = arr.find((x) => x.is_latest);
            if (latestByFlag) subMap[aid] = latestByFlag;
            else
              subMap[aid] = [...arr].sort(
                (a, b) => (b.attempt_number ?? 0) - (a.attempt_number ?? 0)
              )[0];
          });
        }
        setSubmissions(subMap);

        /* ---- Quizzes ---- */
        let qRows: QuizRow[] = [];
        if (moduleIds.length > 0) {
          const { data, error } = await supabase
            .from("quizzes")
            .select("id,title,type,module_id")
            .in("module_id", moduleIds)
            .order("created_at", { ascending: true });
          if (error) throw error;
          qRows = (data ?? []) as QuizRow[];
        }
        setQuizzes(qRows);

        /* ---- Attempts (mirror QuizRunner) ---- */
        const attMap: Record<string, QuizAttemptRow | undefined> = {};
        if (qRows.length > 0) {
          const quizIds = qRows.map((q) => q.id);

          // Bulk query: latest by attempt_number (like QuizRunner)
          const { data: bulk, error: bulkErr } = await supabase
            .from("quiz_attempts")
            .select("id,quiz_id,student_id,submitted_at,score,attempt_number")
            .eq("student_id", rosterStudentId)
            .in("quiz_id", quizIds)
            .order("attempt_number", { ascending: false });

          if (bulkErr) throw bulkErr;

          const byQuiz: Map<string, QuizAttemptRow[]> = new Map();
          (bulk as QuizAttemptRow[] ?? []).forEach((row) => {
            const arr = byQuiz.get(row.quiz_id) ?? [];
            arr.push(row);
            byQuiz.set(row.quiz_id, arr);
          });

          byQuiz.forEach((arr, qid) => {
            attMap[qid] = arr[0];
          });

          // Fallback for any quiz that still has no row (rare edge / RLS quirk):
          const missing = quizIds.filter((id) => !attMap[id]);
          if (missing.length > 0) {
            const perQuiz = await Promise.all(
              missing.map(async (qid) => {
                const { data } = await supabase
                  .from("quiz_attempts")
                  .select("id,quiz_id,student_id,submitted_at,score,attempt_number")
                  .eq("quiz_id", qid)
                  .eq("student_id", rosterStudentId)
                  .order("attempt_number", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                return [qid, data as QuizAttemptRow | null] as const;
              })
            );
            for (const [qid, row] of perQuiz) attMap[qid] = row ?? undefined;
          }
        }
        setAttempts(attMap);

        // quiz totals (sum points)
        const totals: Record<string, number> = {};
        if (qRows.length > 0) {
          const ids = qRows.map((q) => q.id);
          const { data, error } = await supabase
            .from("quiz_questions")
            .select("quiz_id,points")
            .in("quiz_id", ids);
          if (error) throw error;

          const groups: Map<string, number[]> = new Map();
          (data ?? []).forEach((r: any) => {
            const existing: number[] = groups.get(r.quiz_id) ?? [];
            existing.push(Number(r.points ?? 0));
            groups.set(r.quiz_id, existing);
          });

          groups.forEach((arr: number[], quizId: string) => {
            totals[quizId] = sumLoose(arr);
          });
        }
        setQuizTotals(totals);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Failed to load student overview.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterStudentId, filters.quarterId, filters.moduleId, modules]);

  /* --------------------------- Derived / Render --------------------------- */
  const studentLabel = useMemo(() => {
    if (!student) return "No student selected";
    const full = [student.last_name, student.first_name, student.middle_name]
      .filter(Boolean)
      .join(", ");
    return full || "Student";
  }, [student]);

  // section name (support both shapes)
  const sectionLabel: string =
    ((student as any)?.section as string | undefined) ??
    ((student as any)?.section_name as string | undefined) ??
    "—";

  const filteredModulesForSelect = useMemo(() => {
    if (filters.quarterId === "all") return modules;
    return modules.filter((m) => m.quarter_id === filters.quarterId);
  }, [filters.quarterId, modules]);

  const renderAssignmentScore = (a: AssignmentRow) => {
    const s = submissions[a.id];
    if (!s) {
      return (
        <Chip className="bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">
          Not submitted
        </Chip>
      );
    }
    if (s.grade === null || s.grade === undefined) {
      return (
        <Chip className="bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
          Waiting for grading
        </Chip>
      );
    }
    const denom = a.max_score ?? 100;
    return (
      <span className="font-semibold text-neutral-900">
        {s.grade}/{denom}
      </span>
    );
  };

  const renderQuizScore = (q: QuizRow) => {
    const a = attempts[q.id];
    if (!a || !a.submitted_at) {
      return (
        <Chip className="bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">
          Not answered
        </Chip>
      );
    }
    const total = quizTotals[q.id] ?? 0;
    const scr = Number(a.score ?? 0); // normalize numeric/text
    if (total > 0 && !Number.isNaN(scr)) {
      return (
        <span className="font-semibold text-neutral-900">
          {scr}/{total}
        </span>
      );
    }
    return (
      <span className="font-semibold text-neutral-900">
        {Number.isNaN(scr) ? 0 : scr}
      </span>
    );
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm h-full overflow-hidden">
      {/* Header: Student + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xl font-semibold text-neutral-900 truncate">
            {studentLabel}
          </div>
          <div className="text-sm text-neutral-500">Section: {sectionLabel}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
            <AdjustmentsHorizontalIcon className="w-4 h-4 text-neutral-600" />
            <span className="text-xs text-neutral-600">Filters</span>
          </div>

          {/* Quarter */}
          <select
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
            value={filters.quarterId}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                quarterId: e.target.value as Filters["quarterId"],
                moduleId: "all",
              }))
            }
          >
            <option value="all">All quarters</option>
            {quarters.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name ?? "Untitled quarter"}
              </option>
            ))}
          </select>

          {/* Module */}
          <select
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
            value={filters.moduleId}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                moduleId: e.target.value as Filters["moduleId"],
              }))
            }
          >
            <option value="all">All modules</option>
            {filteredModulesForSelect.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title ?? "Untitled module"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Body (scrollable) */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto pr-1">
        {/* Assignments */}
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <header className="sticky top-0 z-[1] flex items-center gap-2 px-4 py-3 border-b bg-white/90">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100">
              <ClipboardDocumentListIcon className="w-5 h-5 text-neutral-700" />
            </div>
            <div>
              <div className="font-semibold text-neutral-900">
                Assignment &amp; Score
              </div>
              <div className="text-xs text-neutral-500">
                By default: shows all quarters
              </div>
            </div>
          </header>

          <div className="divide-y">
            {loading && assignments.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="h-4 w-40 rounded bg-neutral-100 animate-pulse" />
                  <div className="h-4 w-16 rounded bg-neutral-100 animate-pulse" />
                </div>
              ))
            ) : assignments.length === 0 ? (
              <div className="px-4 py-6 text-sm text-neutral-500">
                No assignments.
              </div>
            ) : (
              assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div className="truncate">{a.name ?? "Untitled assignment"}</div>
                  <div className="shrink-0">{renderAssignmentScore(a)}</div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Quizzes */}
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <header className="sticky top-0 z-[1] flex items-center gap-2 px-4 py-3 border-b bg-white/90">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100">
              <ChartBarSquareIcon className="w-5 h-5 text-neutral-700" />
            </div>
            <div>
              <div className="font-semibold text-neutral-900">Quiz Result</div>
              <div className="text-xs text-neutral-500">
                Pre-test, Post-test, and Quizzes
              </div>
            </div>
          </header>

          <div className="divide-y">
            {loading && quizzes.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="h-4 w-40 rounded bg-neutral-100 animate-pulse" />
                  <div className="h-4 w-16 rounded bg-neutral-100 animate-pulse" />
                </div>
              ))
            ) : quizzes.length === 0 ? (
              <div className="px-4 py-6 text-sm text-neutral-500">No quizzes.</div>
            ) : (
              quizzes.map((q) => (
                <div key={q.id} className="flex items-center justify-between px-4 py-3">
                  <div className="truncate">
                    {q.title ??
                      (q.type === "pre_test"
                        ? "Pre-test"
                        : q.type === "post_test"
                        ? "Post-test"
                        : "Quiz")}
                  </div>
                  <div className="shrink-0">{renderQuizScore(q)}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
    </div>
  );
}
