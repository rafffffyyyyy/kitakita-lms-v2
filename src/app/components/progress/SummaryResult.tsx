"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/app/UserContext";
import {
  ChartBarSquareIcon,
  CheckCircleIcon,
  DocumentChartBarIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  UsersIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

/* ----------------------------- Types ----------------------------- */
type QuarterRow = { id: string; name: string | null; teacher_id: string };
type ModuleRow = { id: string; title: string | null; quarter_id: string };
type SectionRow = { id: number; name: string | null };
type QuizType = "pre_test" | "post_test" | "quiz";

type QuizRow = {
  id: string;
  module_id: string;
  title: string | null;
  type: QuizType;
  reveal_correct_answers: boolean | null;
  expires_at: string | null;
};

type QuestionRow = {
  id: string;
  quiz_id: string;
  order_index: number | null;
  question_text: string | null;
  points: number | null;
};

type ChoiceRow = {
  id: string;
  question_id: string;
  choice_text: string | null;
  is_correct: boolean | null;
};

type AttemptRow = {
  id: string;
  quiz_id: string;
  student_id: string;
  submitted_at: string | null;
  duration_seconds: number | null;
  score: number | string | null;
  attempt_number: number | null;
  meta: any | null; // { answers: Record<qid, string[]> }
};

type StudentRow = {
  id: string; // == auth.users.id
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  section_id: number | null;
  section_name?: string | null; // joined
};

/* ----------------------------- Helpers ----------------------------- */
const fmtName = (s: StudentRow) =>
  [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(", ") || "Student";

const sum = (a: number[]) => a.reduce((t, n) => t + (Number.isFinite(n) ? n : 0), 0);
const toPct = (num: number, den: number) =>
  den <= 0 ? "0%" : `${Math.round((num / den) * 100)}%`;

/* Always use latest attempt */
type AttemptPolicy = "latest" | "best";
const selectAttempt = (rows: AttemptRow[], policy: AttemptPolicy) => {
  if (!rows.length) return undefined;
  const submitted = rows.filter((r) => !!r.submitted_at);
  if (!submitted.length) return undefined;
  if (policy === "latest") {
    return submitted.sort(
      (a, b) => (b.attempt_number ?? 0) - (a.attempt_number ?? 0)
    )[0];
  }
  return submitted.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))[0];
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const pickedLabel = (n: number) => `${n} picked`;

/* ----------------------------- Component ----------------------------- */
export default function SummaryResult() {
  const { userId, role } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [quarters, setQuarters] = useState<QuarterRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);

  const [quarterId, setQuarterId] = useState<string | "">("");
  const [moduleId, setModuleId] = useState<string | "">("");
  const [quizType, setQuizType] = useState<QuizType>("pre_test");
  const [quizId, setQuizId] = useState<string | "">("");

  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [roster, setRoster] = useState<StudentRow[]>([]);
  const [sectionFilter, setSectionFilter] = useState<number | "all">("all");

  // Attempts & Questions
  const [attemptsByStudent, setAttemptsByStudent] = useState<
    Record<string, AttemptRow | undefined>
  >({});
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [choicesByQ, setChoicesByQ] = useState<Record<string, ChoiceRow[]>>({});
  const [totalPoints, setTotalPoints] = useState<number>(0);

  // Other UI state
  const [viewSubset, setViewSubset] = useState<"answered" | "not_answered">("answered");
  const [passingScore, setPassingScore] = useState<number | "">("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  const teacherOnly = (role ?? "").toLowerCase() === "teacher";

  /* -------------------------- Load quarters (teacher) -------------------------- */
  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const { data: teacher } = await supabase
          .from("teachers")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!teacher) {
          setQuarters([]);
          return;
        }

        const { data: q } = await supabase
          .from("quarters")
          .select("id,name,teacher_id")
          .eq("teacher_id", teacher.id)
          .order("created_at", { ascending: true });

        setQuarters((q ?? []) as QuarterRow[]);
        if (q && q.length && !quarterId) setQuarterId(q[0].id);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load quarters.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* -------------------------- Load modules & sections -------------------------- */
  useEffect(() => {
    if (!quarterId) {
      setModules([]);
      setModuleId("");
      return;
    }
    (async () => {
      try {
        const [{ data: m }, { data: sec }] = await Promise.all([
          supabase
            .from("modules")
            .select("id,title,quarter_id")
            .eq("quarter_id", quarterId)
            .order("created_at", { ascending: true }),
          supabase.from("sections").select("id,name").order("id"),
        ]);
        setModules((m ?? []) as ModuleRow[]);
        if (m && m.length && !moduleId) setModuleId(m[0].id);
        setSections((sec ?? []) as SectionRow[]);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load modules/sections.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarterId]);

  /* -------------------------- Load quizzes for module -------------------------- */
  useEffect(() => {
    if (!moduleId) {
      setQuizzes([]);
      setQuizId("");
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from("quizzes")
          .select("id,module_id,title,type,reveal_correct_answers,expires_at")
          .eq("module_id", moduleId)
          .order("created_at", { ascending: true });

        const rows = (data ?? []) as QuizRow[];
        setQuizzes(rows);

        if (quizType === "quiz") {
          const firstQuiz = rows.find((r) => r.type === "quiz");
          setQuizId(firstQuiz?.id ?? "");
        } else if (quizType === "pre_test") {
          const pre = rows.find((r) => r.type === "pre_test");
          setQuizId(pre?.id ?? "");
        } else {
          const post = rows.find((r) => r.type === "post_test");
          setQuizId(post?.id ?? "");
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load quizzes.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, quizType]);

  /* -------------------------- Load roster (teacher’s students) -------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const { data: t } = await supabase
          .from("teachers")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!t) {
          setRoster([]);
          return;
        }

        const { data } = await supabase
          .from("students")
          .select("id,first_name,middle_name,last_name,section_id, sections(name)")
          .eq("teacher_id", t.id)
          .order("last_name", { ascending: true });

        const rows: StudentRow[] = (data ?? []).map((r: any) => ({
          id: r.id,
          first_name: r.first_name,
          middle_name: r.middle_name,
          last_name: r.last_name,
          section_id: r.section_id,
          section_name: r.sections?.name ?? null,
        }));

        setRoster(rows);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load roster.");
      }
    })();
  }, [userId]);

  /* -------------------------- Attempts + Questions for selected quiz -------------------------- */
  const scopedStudentIds = useMemo(() => {
    const base = roster;
    if (sectionFilter === "all") return base.map((s) => s.id);
    return base.filter((s) => s.section_id === sectionFilter).map((s) => s.id);
  }, [roster, sectionFilter]);

  const selectedQuiz = useMemo(
    () => (quizId ? quizzes.find((q) => q.id === quizId) : undefined),
    [quizId, quizzes]
  );

  // Always show correct-highlight for analysis (per request).
  const canRevealAnswers = true;

  useEffect(() => {
    if (!quizId || !scopedStudentIds.length) {
      setAttemptsByStudent({});
      setQuestions([]);
      setChoicesByQ({});
      setTotalPoints(0);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: atts } = await supabase
          .from("quiz_attempts")
          .select(
            "id,quiz_id,student_id,submitted_at,duration_seconds,score,attempt_number,meta"
          )
          .eq("quiz_id", quizId)
          .in("student_id", scopedStudentIds)
          .order("attempt_number", { ascending: false });

        const group: Record<string, AttemptRow[]> = {};
        (atts ?? []).forEach((a: any) => {
          (group[a.student_id] ||= []).push(a as AttemptRow);
        });

        // latest submitted
        const pick: Record<string, AttemptRow | undefined> = {};
        Object.keys(group).forEach((sid) => {
          pick[sid] = selectAttempt(group[sid], "latest");
        });
        setAttemptsByStudent(pick);

        const { data: qs } = await supabase
          .from("quiz_questions")
          .select("id,quiz_id,order_index,question_text,points")
          .eq("quiz_id", quizId)
          .order("order_index", { ascending: true });

        const qrows = (qs ?? []) as QuestionRow[];
        setQuestions(qrows);

        const qids = qrows.map((q) => q.id);
        if (!qids.length) {
          setChoicesByQ({});
          setTotalPoints(0);
          return;
        }

        const { data: ch } = await supabase
          .from("quiz_choices")
          .select("id,question_id,choice_text,is_correct")
          .in("question_id", qids)
          .order("order_index", { ascending: true });

        const byQ: Record<string, ChoiceRow[]> = {};
        (ch ?? []).forEach((c: any) => {
          (byQ[c.question_id] ||= []).push(c as ChoiceRow);
        });
        setChoicesByQ(byQ);

        const totalPts = qrows.map((q) => Number(q.points ?? 1)).reduce((a, b) => a + b, 0);
        setTotalPoints(totalPts);

        // default passing score = 50% of total (set only if empty, also clamp)
        setPassingScore((prev) =>
          prev === "" ? Math.round(totalPts * 0.5) : clamp(Number(prev), 0, totalPts)
        );
      } catch (e: any) {
        setError(e?.message ?? "Failed to load attempts/questions.");
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId, scopedStudentIds, refreshNonce]);

  /* -------------------------- Derived data for UI -------------------------- */
  const answeredSet = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(attemptsByStudent).filter(([, a]) => a && !!a.submitted_at)
      ),
    [attemptsByStudent]
  );

  const tableRows = useMemo(() => {
    const base =
      viewSubset === "answered"
        ? roster.filter((s) => !!answeredSet[s.id])
        : roster.filter((s) => !answeredSet[s.id]);

    const filtered =
      sectionFilter === "all" ? base : base.filter((s) => s.section_id === sectionFilter);

    return filtered.map((s) => {
      const a = attemptsByStudent[s.id];
      return { student: s, attempt: a, score: Number(a?.score ?? 0) };
    });
  }, [roster, attemptsByStudent, answeredSet, viewSubset, sectionFilter]);

  // Counters
  const scopeTotal = useMemo(
    () => (sectionFilter === "all" ? roster.length : roster.filter((s) => s.section_id === sectionFilter).length),
    [roster, sectionFilter]
  );
  const answeredCount = useMemo(
    () =>
      Object.keys(answeredSet).filter((sid) =>
        sectionFilter === "all" ? true : roster.find((s) => s.id === sid)?.section_id === sectionFilter
      ).length,
    [answeredSet, roster, sectionFilter]
  );

  // Stats (answered only)
  const scoreArray = useMemo(
    () =>
      Object.entries(answeredSet)
        .filter(([sid]) =>
          sectionFilter === "all" ? true : roster.find((s) => s.id === sid)?.section_id === sectionFilter
        )
        .map(([, a]) => Number(a?.score ?? 0)),
    [answeredSet, roster, sectionFilter]
  );

  const highest = useMemo(() => (scoreArray.length ? Math.max(...scoreArray) : 0), [scoreArray]);
  const lowest = useMemo(() => (scoreArray.length ? Math.min(...scoreArray) : 0), [scoreArray]);
  const averageFloat = useMemo(() => (scoreArray.length ? sum(scoreArray) / scoreArray.length : 0), [scoreArray]);
  const averageInt = Math.floor(averageFloat);

  const passedCount = useMemo(() => {
    if (passingScore === "") return 0;
    return scoreArray.filter((s) => s >= Number(passingScore)).length;
  }, [scoreArray, passingScore]);

  const failedCount = Math.max(0, answeredCount - passedCount);
  const notAnsweredCount = Math.max(0, scopeTotal - answeredCount);
  const participationRate = toPct(answeredCount, scopeTotal);
  const passPct = toPct(passedCount, answeredCount);
  const failPct = toPct(failedCount, answeredCount);

  const passPercentNum = answeredCount ? Math.round((passedCount / answeredCount) * 100) : 0;
  const failPercentNum = 100 - passPercentNum;

  /* -------------------------- Item analysis -------------------------- */
  const itemAnalysis = useMemo(() => {
    if (!questions.length) return [];
    const res = questions.map((q) => {
      const choices = choicesByQ[q.id] || [];
      const correctIds = new Set(choices.filter((c) => !!c.is_correct).map((c) => c.id));
      let correct = 0;
      let wrong = 0;
      const perChoice: Record<string, number> = {};
      choices.forEach((c) => (perChoice[c.id] = 0));

      Object.values(answeredSet).forEach((a) => {
        const ans: Record<string, string[]> = (a?.meta?.answers ?? {}) as any;
        const picked = new Set((ans[q.id] ?? []) as string[]);
        for (const cid of picked) perChoice[cid] = (perChoice[cid] ?? 0) + 1;

        const isExact = picked.size === correctIds.size && [...picked].every((id) => correctIds.has(id));
        if (isExact) correct += 1;
        else wrong += 1;
      });

      return { q, choices, perChoice, correct, wrong, correctIds };
    });
    return res;
  }, [questions, choicesByQ, answeredSet]);

  /* -------------------------- CSV Export Helpers -------------------------- */

  const csvEscape = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    // Escape quotes and enclose in quotes if needed
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const exportResultsCSV = () => {
    // Build header (includes Section now)
    const headers = ["Student Name", "Section", "Quarter", "Module", "Quiz Title", "Score"];
    const rows: string[] = [];
    rows.push(headers.join(","));

    // Determine names
    const quarterName = quarters.find((q) => q.id === quarterId)?.name ?? "";
    const moduleTitle = modules.find((m) => m.id === moduleId)?.title ?? "";
    const quizTitle = selectedQuiz?.title ?? "";

    // Use same filtering as roster (sectionFilter)
    const filteredRoster = sectionFilter === "all" ? roster : roster.filter((s) => s.section_id === sectionFilter);

    filteredRoster.forEach((s) => {
      const attempt = attemptsByStudent[s.id];
      const score = attempt && attempt.submitted_at ? String(attempt.score ?? "") : "";
      const r = [
        csvEscape(fmtName(s)),
        csvEscape(s.section_name ?? ""),
        csvEscape(quarterName),
        csvEscape(moduleTitle),
        csvEscape(quizTitle),
        csvEscape(score),
      ];
      rows.push(r.join(","));
    });

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${quizTitle || "quiz-results"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportItemAnalysisCSV = () => {
    // Header: QuestionNumber, QuestionText, ChoiceText, IsCorrect, PickedCount, CorrectTotal, WrongTotal
    const headers = ["QuestionNumber", "QuestionText", "ChoiceText", "IsCorrect", "PickedCount", "CorrectTotal", "WrongTotal"];
    const rows: string[] = [];
    rows.push(headers.join(","));

    itemAnalysis.forEach(({ q, choices, perChoice, correct, wrong }, idx) => {
      // If no choices, still emit a row for the question
      if (!choices.length) {
        rows.push([csvEscape(idx + 1), csvEscape(q.question_text ?? ""), "", "", "", csvEscape(correct), csvEscape(wrong)].join(","));
      } else {
        choices.forEach((c) => {
          const picked = perChoice[c.id] ?? 0;
          rows.push([
            csvEscape(idx + 1),
            csvEscape(q.question_text ?? ""),
            csvEscape(c.choice_text ?? ""),
            csvEscape(Boolean(c.is_correct)),
            csvEscape(picked),
            csvEscape(correct),
            csvEscape(wrong),
          ].join(","));
        });
      }
    });

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedQuiz?.title ?? "item-analysis"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /* -------------------------- UI -------------------------- */

  // FilterBar — removed the small "Filters" label and ensured Quarter/Module have similar shape
  const FilterBar = () => (
    <div className="flex flex-wrap items-center gap-2">
      {/* Quarter */}
      <select
        className="min-w-[180px] rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        value={quarterId}
        onChange={(e) => {
          setQuarterId(e.target.value);
          setModuleId("");
          setQuizId("");
        }}
      >
        {quarters.length === 0 && <option value="">No quarters</option>}
        {quarters.map((q) => (
          <option key={q.id} value={q.id}>
            {q.name ?? "Untitled quarter"}
          </option>
        ))}
      </select>

      {/* Module */}
      <select
        className="min-w-[220px] rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        value={moduleId}
        onChange={(e) => {
          setModuleId(e.target.value);
          setQuizId("");
        }}
        disabled={!quarterId || !modules.length}
      >
        {!modules.length && <option value="">No modules</option>}
        {modules.map((m) => (
          <option key={m.id} value={m.id}>
            {m.title ?? "Untitled module"}
          </option>
        ))}
      </select>

      {/* Type */}
      <select
        className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        value={quizType}
        onChange={(e) => setQuizType(e.target.value as QuizType)}
        disabled={!moduleId}
      >
        <option value="pre_test">Pre-Test</option>
        <option value="post_test">Post-Test</option>
        <option value="quiz">Quiz</option>
      </select>

      {/* Quiz title (only when type === quiz) */}
      {quizType === "quiz" && (
        <select
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
          value={quizId}
          onChange={(e) => setQuizId(e.target.value)}
          disabled={!moduleId}
        >
          {quizzes
            .filter((q) => q.type === "quiz")
            .map((q) => (
              <option key={q.id} value={q.id}>
                {q.title ?? "Untitled quiz"}
              </option>
            ))}
        </select>
      )}

      {/* Section (optional) */}
      <select
        className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        value={sectionFilter === "all" ? "all" : String(sectionFilter)}
        onChange={(e) => setSectionFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
      >
        <option value="all">All sections</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name ?? `Section ${s.id}`}
          </option>
        ))}
      </select>
    </div>
  );

  const Counters = () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <button
        type="button"
        onClick={() => setViewSubset("answered")}
        className={`rounded-2xl border p-3 text-left ${
          viewSubset === "answered" ? "border-blue-500 ring-2 ring-blue-200" : "border-neutral-200"
        }`}
      >
        <div className="text-xs text-neutral-500">Answered</div>
        <div className="mt-1 text-xl font-semibold">{answeredCount}</div>
        <div className="text-xs text-neutral-500">{toPct(answeredCount, scopeTotal)}</div>
      </button>

      <button
        type="button"
        onClick={() => setViewSubset("not_answered")}
        className={`rounded-2xl border p-3 text-left ${
          viewSubset === "not_answered" ? "border-blue-500 ring-2 ring-blue-200" : "border-neutral-200"
        }`}
      >
        <div className="text-xs text-neutral-500">Not Answered</div>
        <div className="mt-1 text-xl font-semibold">{notAnsweredCount}</div>
        <div className="text-xs text-neutral-500">{toPct(notAnsweredCount, scopeTotal)}</div>
      </button>

      <div className="rounded-2xl border border-neutral-200 p-3">
        <div className="text-xs text-neutral-500">Total Student</div>
        <div className="mt-1 text-xl font-semibold">{scopeTotal}</div>
        <div className="text-xs text-neutral-500">Section filter applied</div>
      </div>

      <div className="rounded-2xl border border-neutral-200 p-3">
        <div className="text-xs text-neutral-500">Participation rate</div>
        <div className="mt-1 text-xl font-semibold">{participationRate}</div>
        <div className="text-xs text-neutral-500">Answered / Total</div>
      </div>
    </div>
  );

  /* ---------- Mini circular percent badge ---------- */
  const CircularStat = ({
    value,
    color,
    label,
    count,
  }: {
    value: number; // 0 - 100
    color: string; // hex/tailwind color
    label: string;
    count: number;
  }) => {
    const deg = Math.max(0, Math.min(360, Math.round(value * 3.6)));
    const bg = `conic-gradient(${color} ${deg}deg, #e5e7eb 0deg)`; // gray-200 remainder
    return (
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-16 rounded-full" style={{ background: bg }}>
          <div className="absolute inset-[22%] rounded-full bg-white grid place-items-center text-xs font-semibold">
            {value}%
          </div>
        </div>
        <div className="text-sm">
          <div className="text-neutral-600">{label}</div>
          <div className="font-semibold">
            {count} student{count === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    );
  };

  /* ---------- Donut (passed vs failed) using CSS conic-gradient ---------- */
  const PiePassedFailed = () => {
    const total = Math.max(1, passedCount + failedCount);
    const passedAngle = Math.round((passedCount / total) * 360);
    const bg = `conic-gradient(#10b981 ${passedAngle}deg, #ef4444 0)`; // emerald / red
    return (
      <div className="flex items-center gap-6">
        <div
          className="relative h-32 w-32 md:h-40 md:w-40 rounded-full"
          style={{ background: bg }}
          aria-label="Passed vs Failed"
        >
          <div className="absolute inset-[18%] rounded-full bg-white shadow-inner grid place-items-center text-sm font-semibold">
            {passedCount + failedCount > 0 ? `${passPercentNum}%` : "—"}
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            <span className="text-neutral-600">Passed</span>
            <span className="font-semibold">{passedCount}</span>
            <span className="text-neutral-400 text-xs">({passPct})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />
            <span className="text-neutral-600">Failed</span>
            <span className="font-semibold">{failedCount}</span>
            <span className="text-neutral-400 text-xs">({failPct})</span>
          </div>
        </div>
      </div>
    );
  };

  const SummaryPanel = () => (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="sticky top-0 z-[1] flex items-center gap-2 px-4 py-3 border-b bg-white/90">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100">
          <DocumentChartBarIcon className="w-5 h-5 text-neutral-700" />
        </div>
        <div>
          <div className="font-semibold text-neutral-900">Summary of Test Result</div>
          <div className="text-xs text-neutral-500">Based on latest attempt</div>
        </div>
      </header>

      {/* Content unchanged */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {/* Passing score */}
        <div className="rounded-xl border p-3 md:col-span-2 col-span-1 flex flex-col justify-center items-center">
          <div className="text-xs text-neutral-500 mb-1">Passing score</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={totalPoints || 0}
              step={1}
              className="w-24 rounded-lg border px-2 py-1 text-sm"
              value={passingScore}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") return setPassingScore("");
                const num = Math.floor(Number(raw) || 0);
                setPassingScore(clamp(num, 0, totalPoints || 0));
              }}
              onBlur={() => {
                if (passingScore === "") return;
                setPassingScore(clamp(Number(passingScore), 0, totalPoints || 0));
              }}
              disabled={!totalPoints}
            />
            <span className="text-xs text-neutral-500">/ {totalPoints}</span>
          </div>
          <input
            type="range"
            className="mt-2 w-full"
            min={0}
            max={totalPoints || 0}
            step={1}
            value={Number(passingScore || 0)}
            onChange={(e) =>
              setPassingScore(clamp(Math.floor(Number(e.target.value) || 0), 0, totalPoints || 0))
            }
            disabled={!totalPoints}
          />
        </div>

        {/* Pass/Fail – solo row */}
        <div className="rounded-xl border p-3 md:col-span-2 ">
          <div className="text-xs text-neutral-500 mb-2">Pass/Fail</div>
          <PiePassedFailed />
        </div>

        {/* Pass rate + Average */}
        <div className="rounded-xl border p-3 md:col-span-2 col-span-1 flex flex-col justify-center items-center">
          <div className="text-xs text-neutral-500 mb-2">Pass rate</div>
          <CircularStat value={passPercentNum} color="#10b981" label="Passed" count={passedCount} />
        </div>

        <div className="rounded-xl border p-3 md:col-span-2 col-span-1 flex flex-col justify-center items-center">
          <div className="text-xs text-neutral-500">Average</div>
          <div className="mt-1 text-xl font-semibold">{averageInt}</div>
        </div>

        {/* Highest / Lowest – solo row at bottom */}
        <div className="rounded-xl border p-3 md:col-span-2 col-span-1 flex flex-col justify-center items-center">
          <div className="text-xs text-neutral-500">Highest / Lowest</div>
          <div className="mt-1 text-xl font-semibold">
            {highest} <span className="text-neutral-400">/</span> {lowest}
          </div>
        </div>
      </div>
    </section>
  );

  const ItemAnalysisPanel = () =>
    !questions.length ? null : (
      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <header className="sticky top-0 z-[1] flex items-center justify-between gap-2 px-4 py-3 border-b bg-white/90">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100">
              <ChartBarSquareIcon className="w-5 h-5 text-neutral-700" />
            </div>
            <div>
              <div className="font-semibold text-neutral-900">Item Analysis</div>
              <div className="text-xs text-neutral-500">Correct answers are highlighted in green.</div>
            </div>
          </div>

          {/* Small icon-only export button placed in header (no text) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportItemAnalysisCSV}
              title="Export item analysis CSV"
              className="p-1 rounded-md hover:bg-neutral-100"
              aria-label="Export item analysis"
            >
              <ArrowDownTrayIcon className="h-5 w-5 text-neutral-700" />
            </button>
          </div>
        </header>

        <div className="divide-y">
          {itemAnalysis.map(({ q, choices, perChoice, correct, wrong }, idx) => (
            <div key={q.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900">
                    Q{idx + 1}. {q.question_text || "Untitled question"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Correct: <span className="font-medium">{correct}</span> • Wrong:{" "}
                    <span className="font-medium">{wrong}</span>
                  </div>
                </div>
              </div>

              {/* per-choice breakdown */}
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {choices.map((c) => {
                  const cnt = perChoice[c.id] ?? 0;
                  const isCorrect = !!c.is_correct;
                  return (
                    <li
                      key={c.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        isCorrect ? "border-emerald-300 bg-emerald-50/60" : "border-neutral-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate">{c.choice_text}</div>
                          {isCorrect && <div className="text-[11px] text-emerald-700">Correct answer</div>}
                        </div>
                        <div className="shrink-0 text-sm font-medium text-neutral-800">
                          {pickedLabel(cnt)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    );

  /* -------------------------- Render -------------------------- */
  if (!teacherOnly) {
    return (
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-2 text-rose-700">
          <ExclamationTriangleIcon className="h-5 w-5" />
          <div className="font-medium">Teacher access only.</div>
        </div>
      </div>
    );
  }

  return (
    /* Vertically scrollable to avoid overlap */
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm h-full flex flex-col overflow-y-auto">
      <div className="p-4 sm:p-6">
        {/* Header — cleaner: title left, filters center, export right (no refresh) */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-neutral-900">Summary Result</div>
            <div className="text-sm text-neutral-900 flex items-center gap-2 mt-1">
              <UsersIcon className="h-6 w-6 text-neutral-600" />
              <span>Class performance for a specific test</span>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-between gap-3">
            <div className="flex-1">
              <FilterBar />
            </div>

            {/* Styled export results button (prominent filled style), no refresh button */}
            <div className="ml-3 inline-flex items-center gap-2">
              <button
                type="button"
                onClick={exportResultsCSV}
                title="Export results CSV"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white shadow-sm hover:bg-blue-700 focus:outline-none"
                aria-label="Export results CSV"
              >
                <DocumentChartBarIcon className="h-5 w-5" />
                <span className="text-sm">Export CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Empty state guidance */}
        {!moduleId || !quizId ? (
          <div className="mt-6 rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-700">
            <div className="flex items-start gap-2">
              <InformationCircleIcon className="h-5 w-5 text-neutral-600" />
              <p>
                Choose a <b>Quarter</b>, <b>Module</b> and <b>Test</b> using the filters above. For <b>Quiz</b> type,
                also select a specific <b>Quiz Title</b>.
              </p>
            </div>
          </div>
        ) : null}

        {/* Counters */}
        {quizId && (
          <div className="mt-4">
            <Counters />
          </div>
        )}

        {/* Table */}
        {quizId && (
          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <header className="sticky top-0 z-[1] flex items-center gap-2 px-4 py-3 border-b bg-white/90">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100">
                <UsersIcon className="w-5 h-5 text-neutral-700" />
              </div>
              <div className="flex items-center gap-2">
                <div className="font-semibold text-neutral-900">Results</div>
                <span className="text-xs text-neutral-500">
                  {viewSubset === "answered" ? "Showing answered only" : "Showing not answered"}
                </span>
              </div>
            </header>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Student</th>
                    <th className="px-4 py-2 text-left font-medium">Section</th>
                    <th className="px-4 py-2 text-left font-medium">Score</th>
                    <th className="px-4 py-2 text-left font-medium">Attempt</th>
                    <th className="px-4 py-2 text-left font-medium">Submitted At</th>
                    <th className="px-4 py-2 text-left font-medium">Duration (s)</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3"><div className="h-4 w-48 bg-neutral-100 animate-pulse rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-20 bg-neutral-100 animate-pulse rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-16 bg-neutral-100 animate-pulse rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-16 bg-neutral-100 animate-pulse rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-28 bg-neutral-100 animate-pulse rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-16 bg-neutral-100 animate-pulse rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-24 bg-neutral-100 animate-pulse rounded" /></td>
                      </tr>
                    ))
                  ) : tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-neutral-500">
                        No students to show for the current filters.
                      </td>
                    </tr>
                  ) : (
                    tableRows.map(({ student, attempt, score }) => {
                      const hasAttempt = !!attempt?.submitted_at;
                      const passed = hasAttempt && passingScore !== "" && Number(score) >= Number(passingScore);
                      const failed = hasAttempt && passingScore !== "" && Number(score) < Number(passingScore);
                      return (
                        <tr key={student.id} className="hover:bg-neutral-50">
                          <td className="px-4 py-2">{fmtName(student)}</td>
                          <td className="px-4 py-2">{student.section_name ?? "—"}</td>
                          <td className="px-4 py-2 font-semibold">
                            {Number(score)}
                            {totalPoints ? <span className="text-neutral-500"> / {totalPoints}</span> : null}
                          </td>
                          <td className="px-4 py-2">{attempt?.attempt_number ?? "—"}</td>
                          <td className="px-4 py-2">
                            {attempt?.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-2">{attempt?.duration_seconds ?? "—"}</td>
                          <td className="px-4 py-2">
                            {hasAttempt ? (
                              passed ? (
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                  <CheckCircleIcon className="h-4 w-4" />
                                  Passed
                                </span>
                              ) : failed ? (
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">
                                  <ExclamationTriangleIcon className="h-4 w-4" />
                                  Failed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
                                  Answered
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-medium bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 leading-none">
                                Unanswered
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="inline-flex items-center gap-2">
                <label className="text-xs text-neutral-600">Show:</label>
                <select
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs"
                  value={viewSubset}
                  onChange={(e) => setViewSubset(e.target.value as any)}
                >
                  <option value="answered">Answered</option>
                  <option value="not_answered">Not Answered</option>
                </select>
              </div>

              <div className="text-xs text-neutral-500">
                {answeredCount} answered • {notAnsweredCount} not answered • {scopeTotal} total
              </div>
            </div>
          </section>
        )}

        {/* Summary + Item analysis */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {quizId && <SummaryPanel />}
          {quizId && <ItemAnalysisPanel />}
        </div>

        {/* Errors */}
        {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
      </div>
    </div>
  );
}
