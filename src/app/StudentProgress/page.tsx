// app/studentprogress/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AcademicCapIcon,
  ClipboardDocumentCheckIcon,
  DocumentChartBarIcon,
  ShieldCheckIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import type { RosterStudent } from "@/lib/types/progress";
import StudentList from "@/app/components/progress/StudentList";
import StudentOverviewPane from "@/app/components/progress/StudentOverviewPane";
import ReviewAndGradePane from "@/app/components/progress/ReviewAndGradePane";
import SummaryResult from "@/app/components/progress/SummaryResult";
import { supabase } from "@/lib/supabase";

type ViewMode = "overview" | "grade" | "summary" | "moduleprogress";

/** Extend the roster rows with an optional avatar URL */
type RosterStudentWithAvatar = RosterStudent & {
  profile_picture_url?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  imageUrl?: string | null;
};

export default function StudentProgressPage() {
  const [mode, setMode] = useState<ViewMode>("overview");

  // Roster state (left column)
  const [roster, setRoster] = useState<RosterStudentWithAvatar[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Turn whatever is stored in profile_picture_url into a usable HTTP URL */
  const resolveAvatarUrl = async (raw?: string | null): Promise<string | null> => {
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw; // already a URL

    // Expecting either "student-avatars/<path>" or "<path>" (default to student-avatars)
    let bucket = "student-avatars";
    let path = raw;
    const firstSlash = raw.indexOf("/");
    const firstPart = firstSlash > -1 ? raw.slice(0, firstSlash) : raw;

    if (
      ["student-avatars", "teacher-avatars", "avatars", "module-images"].includes(firstPart)
    ) {
      bucket = firstPart;
      path = firstSlash > -1 ? raw.slice(firstSlash + 1) : "";
    }

    // Try public URL first (works if bucket is public)
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    if (pub?.publicUrl) return pub.publicUrl;

    // Fallback to a signed URL (1 week)
    try {
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      return signed?.signedUrl ?? null;
    } catch {
      return null;
    }
  };

  // Fetch teacher roster (+ attach profile_picture_url per student)
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setRosterLoading(true);
      setRosterError(null);
      try {
        const res = await fetch("/api/progress/roster", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load roster.");
        if (!mounted) return;

        const rows: RosterStudentWithAvatar[] =
          (json?.students ?? []) as RosterStudentWithAvatar[];

        if (rows.length) {
          const ids = rows.map((r) => r.id).filter(Boolean);

          // Pull stored avatar paths from the students table
          const { data: avatars } = await supabase
            .from("students")
            .select("id, profile_picture_url")
            .in("id", ids);

          let merged = rows;
          if (avatars?.length) {
            const map = Object.fromEntries(
              avatars.map(
                (r: { id: string; profile_picture_url: string | null }) => [
                  r.id,
                  r.profile_picture_url,
                ]
              )
            );
            merged = rows.map((r) => ({
              ...r,
              profile_picture_url:
                typeof map[r.id] !== "undefined"
                  ? map[r.id]
                  : (r as any).profile_picture_url ?? null,
            }));
          }

          // Resolve to actual HTTP URLs so the <img> in StudentList renders
          const resolved = await Promise.all(
            merged.map(async (r) => {
              const url = await resolveAvatarUrl(r.profile_picture_url);
              return {
                ...r,
                profile_picture_url: url,
                avatar_url: url,
                avatarUrl: url,
                imageUrl: url,
              } as RosterStudentWithAvatar;
            })
          );

          if (!mounted) return;
          setRoster(resolved);
          // Auto-select first student
          if (!selectedId && resolved.length > 0) setSelectedId(resolved[0].id);
        } else {
          setRoster([]);
        }
      } catch (e: any) {
        if (!mounted) return;
        setRosterError(e?.message ?? "Failed to load roster.");
      } finally {
        if (mounted) setRosterLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStudent = useMemo(
    () => roster.find((r) => r.id === selectedId) ?? null,
    [roster, selectedId]
  );

  const rightTitle =
    mode === "grade"
      ? "Review & Grade"
      : mode === "summary"
      ? "Summary Result"
      : mode === "moduleprogress"
      ? "Module Progress"
      : selectedStudent
      ? `${selectedStudent.last_name ?? ""}, ${selectedStudent.first_name ?? ""}`
      : "Student";

  // Give Overview more width by making the left rail narrower while on Overview
  const gridColsClass =
    mode === "overview" ? "lg:grid-cols-[280px_1fr]" : "lg:grid-cols-[340px_1fr]";

  return (
    <div className="h-[calc(100dvh-64px)] flex flex-col bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
                <AcademicCapIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-semibold text-neutral-900 truncate">
                  Student Progress
                </h1>
                <p className="text-sm text-neutral-500 flex items-center gap-1">
                  <ShieldCheckIcon className="w-4 h-4" /> Teacher-only dashboard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Module Progress (NEW) */}
              <button
                onClick={() => setMode("moduleprogress")}
                aria-pressed={mode === "moduleprogress"}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  mode === "moduleprogress"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-neutral-300 bg-white hover:bg-neutral-50"
                }`}
                title="Per-module student progress"
              >
                <AcademicCapIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Module Progress</span>
              </button>

              {/* Summary Result */}
              <button
                onClick={() => setMode("summary")}
                aria-pressed={mode === "summary"}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  mode === "summary"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-neutral-300 bg-white hover:bg-neutral-50"
                }`}
                title="Summary of test result"
              >
                <DocumentChartBarIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Summary Result</span>
              </button>

              {/* Review & Grade */}
              <button
                onClick={() => setMode("grade")}
                aria-pressed={mode === "grade"}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  mode === "grade"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-neutral-300 bg-white hover:bg-neutral-50"
                }`}
                title="Review & Grade assignments"
              >
                <ClipboardDocumentCheckIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Review & Grade</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-4 flex-1 min-h-0">
        {/* min-h-0 on grid container lets children use overflow scroll correctly */}
        <div className={`grid grid-cols-1 ${gridColsClass} gap-4 min-h-0 items-stretch`}>
          {/* Left: Student List (scrolls inside the card) */}
          <div className="min-h-0 min-w-0">
            <div
              className="
                h-full min-h-[420px] max-h-[calc(100dvh-180px)]
                flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm
              "
            >
              <div className="sticky top-0 z-[1] border-b border-neutral-200 bg-white/90 px-3 py-2 rounded-t-2xl">
                <h2 className="font-semibold text-neutral-900">Student List</h2>
              </div>
              {/* Internal scroll area for roster */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                <StudentList
                  key={rosterLoading ? "loading" : "loaded"}
                  roster={roster}
                  loading={rosterLoading}
                  error={rosterError}
                  value={selectedId}
                  onChange={(s) => {
                    setSelectedId(s.id);
                    // ALWAYS prioritize showing the Overview after selecting a student
                    setMode("overview");
                  }}
                />
              </div>
            </div>
          </div>

          {/* Right: View Pane (also scrolls inside its card) */}
          <div className="min-h-0 min-w-0">
            <div
              className="
                h-full min-h-[420px] max-h-[calc(100dvh-180px)]
                flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm
              "
            >
              <div className="sticky top-0 z-[1] border-b border-neutral-200 bg-white/90 px-4 py-3 rounded-t-2xl">
                <h2 className="font-semibold text-neutral-900 truncate">{rightTitle}</h2>
              </div>

              {/* Internal scroll area for the active view */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 sm:px-3 lg:px-4 py-3">
                {mode === "grade" ? (
                  <ReviewAndGradePane />
                ) : mode === "summary" ? (
                  <SummaryResult />
                ) : mode === "moduleprogress" ? (
                  <ModuleProgressPane roster={roster} />
                ) : (
                  <StudentOverviewPane student={selectedStudent} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Module Progress Pane (Teacher) ---------------- */

type QuarterRow = { id: string; name: string | null };
type ModuleRow = { id: string; title: string | null; quarter_id: string | null };

function statusFor(pct: number) {
  if (pct <= 0) return { label: "Not started", cls: "bg-neutral-100 text-neutral-700" };
  if (pct < 50) return { label: "Getting started", cls: "bg-amber-50 text-amber-700" };
  if (pct < 100) return { label: "In progress", cls: "bg-blue-50 text-blue-700" };
  return { label: "Completed", cls: "bg-emerald-50 text-emerald-700" };
}

/** NEW: map performance % → requested status colors */
function performanceStatus(pct: number) {
  // New bands:
  // 0% → Disengaged (grey)
  // 1–49% → Failed (red)
  // 50–59% → Need Attention (yellow)
  // 60–79% → Passed (blue)
  // 80–100% → Excellent Performance (green)
  if (pct === 0) return { key: "disengaged" as const, label: "Disengaged", cls: "bg-neutral-100 text-neutral-700" };
  if (pct <= 49) return { key: "failed" as const, label: "Failed", cls: "bg-rose-50 text-rose-700" };
  if (pct <= 59) return { key: "attention" as const, label: "Need Attention", cls: "bg-amber-50 text-amber-700" };
  if (pct <= 79) return { key: "passed" as const, label: "Passed", cls: "bg-blue-50 text-blue-700" };
  return { key: "excellent" as const, label: "Excellent Performance", cls: "bg-emerald-50 text-emerald-700" };
}

type PerfBucket = "ALL" | "excellent" | "passed" | "attention" | "failed" | "disengaged";

function ModuleProgressPane({ roster }: { roster: RosterStudentWithAvatar[] }) {
  const [quarters, setQuarters] = useState<QuarterRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [quarterId, setQuarterId] = useState<string | null>(null);
  const [moduleId, setModuleId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null); // RLS note for *_views
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string | "ALL">("ALL");
  const [perfFilter, setPerfFilter] = useState<PerfBucket>("ALL");

  // per-module completion counts (existing)
  const [totals, setTotals] = useState({ res: 0, vid: 0, asg: 0, quiz: 0 });

  // NEW: per-module points totals (quiz + assignment)
  const [pointTotals, setPointTotals] = useState<{ quizPts: number; asgPts: number; grandPts: number }>({
    quizPts: 0,
    asgPts: 0,
    grandPts: 0,
  });

  // completion counts per student (existing)
  const [done, setDone] = useState<Record<string, { res: number; vid: number; asg: number; quiz: number }>>({});

  // NEW: performance points per student
  const [perf, setPerf] = useState<
    Record<string, { earnedQuiz: number; earnedAssign: number; earnedTotal: number; pct: number }>
  >({});

  // load teacher quarters on mount
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from("quarters")
        .select("id, name")
        .eq("teacher_id", userId)
        .order("created_at", { ascending: true });
      if (error) return;

      if (!mounted) return;
      setQuarters(data ?? []);
      setQuarterId(data?.[0]?.id ?? null);
    };
    run();
    return () => {
      mounted = false;
    };
  }, []);

  // load modules for selected quarter
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!quarterId) {
        setModules([]);
        setModuleId(null);
        return;
      }
      const { data, error } = await supabase
        .from("modules")
        .select("id, title, quarter_id")
        .eq("quarter_id", quarterId)
        .order("created_at", { ascending: true });
      if (error) return;
      if (!mounted) return;
      setModules(data ?? []);
      setModuleId(data?.[0]?.id ?? null);
    };
    run();
    return () => {
      mounted = false;
    };
  }, [quarterId]);

  // compute per-student progress + NEW performance for the chosen module
  useEffect(() => {
    const run = async () => {
      if (!moduleId || roster.length === 0) {
        setTotals({ res: 0, vid: 0, asg: 0, quiz: 0 });
        setDone({});
        setPointTotals({ quizPts: 0, asgPts: 0, grandPts: 0 });
        setPerf({});
        return;
      }
      setLoading(true);
      setNote(null);
      try {
        const studentIds = roster.map((r) => r.id);

        // 1) fetch lists per module
        const [resR, vidR, asgR, quizR] = await Promise.all([
          supabase.from("resources").select("id").eq("module_id", moduleId),
          supabase.from("module_youtube_links").select("id").eq("module_id", moduleId),
          // include max_score for assignments
          supabase.from("assignments").select("id, max_score").eq("module_id", moduleId),
          supabase.from("quizzes").select("id, is_published").eq("module_id", moduleId),
        ]);

        const resList = (resR.data as any[]) || [];
        const vidList = (vidR.data as any[]) || [];
        const asgList = ((asgR.data as any[]) || []) as { id: string; max_score: number | null }[];
        const quizList = ((quizR.data as any[]) || []).filter((q) =>
          typeof q.is_published === "boolean" ? q.is_published : true
        );

        const resourceIds = resList.map((r) => r.id);
        const videoIds = vidList.map((v) => v.id);
        const assignmentIds = asgList.map((a) => a.id);
        const quizIds = quizList.map((q) => q.id);

        setTotals({
          res: resourceIds.length,
          vid: videoIds.length,
          asg: assignmentIds.length,
          quiz: quizIds.length,
        });

        // initialize counts per student (completion)
        const init: Record<string, { res: number; vid: number; asg: number; quiz: number }> = {};
        for (const s of studentIds) init[s] = { res: 0, vid: 0, asg: 0, quiz: 0 };

        // 2a) assignment submissions (completion)
        if (assignmentIds.length > 0) {
          const { data } = await supabase
            .from("assignment_submissions")
            .select("assignment_id, student_id")
            .in("assignment_id", assignmentIds)
            .in("student_id", studentIds);
          const seen = new Set<string>();
          for (const row of (data as any[]) ?? []) {
            const key = `${row.student_id}:${row.assignment_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (init[row.student_id]) init[row.student_id].asg += 1;
          }
        }

        // 2b) quiz attempts (completion)
        if (quizIds.length > 0) {
          const { data } = await supabase
            .from("quiz_attempts")
            .select("quiz_id, student_id")
            .in("quiz_id", quizIds)
            .in("student_id", studentIds);
          const seen = new Set<string>();
          for (const row of (data as any[]) ?? []) {
            const key = `${row.student_id}:${row.quiz_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (init[row.student_id]) init[row.student_id].quiz += 1;
          }
        }

        // 2c) resource views (RLS may block for teacher)
        if (resourceIds.length > 0) {
          try {
            const { data } = await supabase
              .from("resource_views")
              .select("resource_id, student_id")
              .in("resource_id", resourceIds)
              .in("student_id", studentIds);
            const seen = new Set<string>();
            for (const row of (data as any[]) ?? []) {
              const key = `${row.student_id}:${row.resource_id}`;
              if (seen.has(key)) continue;
              seen.add(key);
              if (init[row.student_id]) init[row.student_id].res += 1;
            }
          } catch {
            setNote("Note: file/video views are hidden by RLS. See the SQL note below.");
          }
        }

        // 2d) video views (RLS may block for teacher)
        if (videoIds.length > 0) {
          try {
            const { data } = await supabase
              .from("module_video_views")
              .select("youtube_link_id, student_id")
              .in("youtube_link_id", videoIds)
              .in("student_id", studentIds);
            const seen = new Set<string>();
            for (const row of (data as any[]) ?? []) {
              const key = `${row.student_id}:${row.youtube_link_id}`;
              if (seen.has(key)) continue;
              seen.add(key);
              if (init[row.student_id]) init[row.student_id].vid += 1;
            }
          } catch {
            setNote("Note: file/video views are hidden by RLS. See the SQL note below.");
          }
        }

        setDone(init);

        /* ---------------- NEW: Performance (points) ---------------- */

        // Build per-quiz total points
        let quizPtsByQuiz: Record<string, number> = {};
        if (quizIds.length > 0) {
          const { data: qpts } = await supabase
            .from("quiz_questions")
            .select("quiz_id, points")
            .in("quiz_id", quizIds);
          for (const row of (qpts as any[]) ?? []) {
            const qid = row.quiz_id as string;
            const pts = Number(row.points) || 0;
            quizPtsByQuiz[qid] = (quizPtsByQuiz[qid] || 0) + pts;
          }
        }
        const totalQuizPts = Object.values(quizPtsByQuiz).reduce((a, b) => a + b, 0);

        // Per-student best quiz attempt score per quiz
        let bestQuizScore: Record<string, Record<string, number>> = {};
        if (quizIds.length > 0) {
          const { data: attempts } = await supabase
            .from("quiz_attempts")
            .select("quiz_id, student_id, score")
            .in("quiz_id", quizIds)
            .in("student_id", studentIds);

          for (const row of (attempts as any[]) ?? []) {
            const sid = row.student_id as string;
            const qid = row.quiz_id as string;
            const sc = Number(row.score) || 0;
            if (!bestQuizScore[sid]) bestQuizScore[sid] = {};
            bestQuizScore[sid][qid] = Math.max(bestQuizScore[sid][qid] ?? 0, sc);
          }
        }

        // Assignment max points by assignment
        const asgMaxById: Record<string, number> = {};
        for (const a of asgList) {
          asgMaxById[a.id] = Number(a.max_score) || 0;
        }
        const totalAsgPts = Object.values(asgMaxById).reduce((a, b) => a + b, 0);

        // Per-student best graded score per assignment
        let bestAsgGrade: Record<string, Record<string, number>> = {};
        if (assignmentIds.length > 0) {
          const { data: grades } = await supabase
            .from("assignment_submissions")
            .select("assignment_id, student_id, grade")
            .in("assignment_id", assignmentIds)
            .in("student_id", studentIds);

          for (const row of (grades as any[]) ?? []) {
            const sid = row.student_id as string;
            const aid = row.assignment_id as string;
            const g = Number(row.grade);
            if (isNaN(g)) continue; // ignore nulls
            if (!bestAsgGrade[sid]) bestAsgGrade[sid] = {};
            bestAsgGrade[sid][aid] = Math.max(bestAsgGrade[sid][aid] ?? 0, g);
          }
        }

        // Totals
        const grandPts = totalQuizPts + totalAsgPts;
        setPointTotals({ quizPts: totalQuizPts, asgPts: totalAsgPts, grandPts: grandPts });

        // Per-student earned + pct
        const perfMap: Record<
          string,
          { earnedQuiz: number; earnedAssign: number; earnedTotal: number; pct: number }
        > = {};

        for (const sid of studentIds) {
          // Sum of best quiz scores (capped by quiz max)
          let eQuiz = 0;
          for (const qid of quizIds) {
            const best = (bestQuizScore[sid]?.[qid] ?? 0);
            const cap = quizPtsByQuiz[qid] ?? 0;
            eQuiz += Math.min(best, cap);
          }

          // Sum of best assignment grades (capped by assignment max)
          let eAsg = 0;
          for (const aid of assignmentIds) {
            const best = (bestAsgGrade[sid]?.[aid] ?? 0);
            const cap = asgMaxById[aid] ?? 0;
            eAsg += Math.min(best, cap);
          }

          const eTotal = eQuiz + eAsg;
          const pct = grandPts > 0 ? Math.round((eTotal / grandPts) * 100) : 0;
          perfMap[sid] = { earnedQuiz: eQuiz, earnedAssign: eAsg, earnedTotal: eTotal, pct };
        }

        setPerf(perfMap);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [moduleId, roster]);

  // derive sections and filters
  const sections = useMemo(() => {
    const pairs = new Map<string, string>(); // id -> name
    for (const r of roster) {
      const sid = String((r as any).section_id ?? "");
      const sname = (r as any).section_name ?? (r as any).section ?? "Unsectioned";
      if (sid) pairs.set(sid, sname);
    }
    return Array.from(pairs.entries()).map(([id, name]) => ({ id, name }));
  }, [roster]);

  const bucketFromPct = (pct: number): Exclude<PerfBucket, "ALL"> => {
    if (pct === 0) return "disengaged";
    if (pct <= 49) return "failed";
    if (pct <= 59) return "attention";
    if (pct <= 79) return "passed";
    return "excellent";
  };

  const studentsBySection = useMemo(() => {
    const filtered = roster.filter((r) => {
      const matchesSection =
        sectionFilter === "ALL" ? true : String((r as any).section_id ?? "") === sectionFilter;

      const full = `${r.last_name ?? ""} ${r.first_name ?? ""}`.toLowerCase();
      const matchesSearch = full.includes(search.trim().toLowerCase());

      const pct = perf[r.id]?.pct ?? 0;
      const bucket = bucketFromPct(pct);
      const matchesPerf = perfFilter === "ALL" ? true : bucket === perfFilter;

      return matchesSection && matchesSearch && matchesPerf;
    });

    const groups: Record<string, { name: string; rows: RosterStudentWithAvatar[] }> = {};
    for (const r of filtered) {
      const sid = String((r as any).section_id ?? "none");
      const sname = (r as any).section_name ?? (r as any).section ?? "Unsectioned";
      if (!groups[sid]) groups[sid] = { name: sname, rows: [] };
      groups[sid].rows.push(r);
    }
    return groups;
  }, [roster, sectionFilter, search, perf, perfFilter]);

  const totalItems = totals.res + totals.vid + totals.asg + totals.quiz;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {/* Quarter */}
          <div className="flex flex-col">
            <label className="text-xs text-neutral-500 mb-1">Quarter</label>
            <select
              value={quarterId ?? ""}
              onChange={(e) => setQuarterId(e.target.value || null)}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
            >
              {quarters.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name ?? "Untitled"}
                </option>
              ))}
            </select>
          </div>

          {/* Module */}
          <div className="flex flex-col">
            <label className="text-xs text-neutral-500 mb-1">Module</label>
            <select
              value={moduleId ?? ""}
              onChange={(e) => setModuleId(e.target.value || null)}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-2 text-sm min-w-[220px]"
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title ?? "Untitled"}
                </option>
              ))}
            </select>
          </div>

          {/* Section filter */}
          <div className="flex flex-col">
            <label className="text-xs text-neutral-500 mb-1">Section</label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value as any)}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-2 text-sm min-w-[160px]"
            >
              <option value="ALL">All sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* NEW: Performance filter */}
          <div className="flex flex-col">
            <label className="text-xs text-neutral-500 mb-1">Performance</label>
            <select
              value={perfFilter}
              onChange={(e) => setPerfFilter(e.target.value as PerfBucket)}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-2 text-sm min-w-[200px]"
            >
              <option value="ALL">All</option>
              <option value="excellent">Excellent Performance (80–100%)</option>
              <option value="passed">Passed (60–79%)</option>
              <option value="attention">Need Attention (50–59%)</option>
              <option value="failed">Failed (1–49%)</option>
              <option value="disengaged">Disengaged (0%)</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student…"
            className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {/* Totals summary */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700 flex flex-wrap gap-3">
        <span>Trackable items:</span>
        <span className="inline-flex items-center gap-1">
          <span className="rounded-md bg-white px-2 py-0.5 border border-neutral-200">Files: {totals.res}</span>
          <span className="rounded-md bg-white px-2 py-0.5 border border-neutral-200">Videos: {totals.vid}</span>
          <span className="rounded-md bg-white px-2 py-0.5 border border-neutral-200">Assignments: {totals.asg}</span>
          <span className="rounded-md bg-white px-2 py-0.5 border border-neutral-200">Quizzes: {totals.quiz}</span>
          <span className="rounded-md bg-white px-2 py-0.5 border border-neutral-200 font-medium">
            Total: {totalItems}
          </span>
        </span>

        {/* Points summary */}
        <span className="inline-flex items-center gap-1">
          <span className="ml-3">• Points:</span>
          <span className="rounded-md bg-white px-2 py-0.5 border border-neutral-200">Quiz: {pointTotals.quizPts}</span>
          <span className="rounded-md bg-white px-2 py-0.5 border border-neutral-200">Assign: {pointTotals.asgPts}</span>
          <span className="rounded-md bg-white px-2 py-0.5 border border-neutral-200 font-medium">
            Total: {pointTotals.grandPts}
          </span>
        </span>

        {note && <span className="text-amber-700">• {note}</span>}
      </div>

      {/* Groups by section */}
      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="h-4 w-48 bg-neutral-200 animate-pulse rounded mb-3" />
              {Array.from({ length: 4 }).map((__, j) => (
                <div key={j} className="h-8 bg-neutral-100 animate-pulse rounded mb-2" />
              ))}
            </div>
          ))}
        </div>
      ) : totalItems === 0 && pointTotals.grandPts === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-neutral-700">
          This module has no trackable or graded items yet.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(studentsBySection).map(([sid, group]) => (
            <div key={sid} className="rounded-xl border border-neutral-200 bg-white">
              <div className="px-4 py-2 border-b border-neutral-200 bg-neutral-50 rounded-t-xl text-sm font-semibold text-neutral-800">
                {group.name}
              </div>
              <div className="divide-y divide-neutral-100">
                {group.rows.map((s) => {
                  const comp = done[s.id] ?? { res: 0, vid: 0, asg: 0, quiz: 0 };
                  const completed = comp.res + comp.vid + comp.asg + comp.quiz;
                  const pctItems = (totals.res + totals.vid + totals.asg + totals.quiz) > 0
                    ? Math.round((completed / (totals.res + totals.vid + totals.asg + totals.quiz)) * 100)
                    : 0;
                  const st = statusFor(pctItems);

                  const p = perf[s.id] ?? { earnedQuiz: 0, earnedAssign: 0, earnedTotal: 0, pct: 0 };
                  const perfSt = performanceStatus(p.pct);
                  const noGraded = pointTotals.grandPts === 0;

                  return (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-neutral-900 truncate">
                            {(s.last_name ?? "") + ", " + (s.first_name ?? "")}
                          </div>

                          {/* Performance status */}
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-md ${noGraded ? "bg-neutral-100 text-neutral-600" : perfSt.cls}`}
                            title={noGraded ? "No graded items yet" : "Performance status"}
                          >
                            {noGraded ? "No scores yet" : perfSt.label}
                          </span>

                          {/* Existing “items completion” status */}
                          <span className={`text-[11px] px-2 py-0.5 rounded-md ${st.cls}`} title="Items viewed/done">
                            {st.label}
                          </span>
                        </div>

                        {/* Items progress bar */}
                        <div className="mt-2 h-2 w-full rounded-full bg-neutral-100">
                          <div
                            className="h-2 rounded-full bg-blue-600 transition-[width] duration-500"
                            style={{ width: `${pctItems}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {completed} / {totals.res + totals.vid + totals.asg + totals.quiz} items • {pctItems}%
                        </div>

                        {/* Performance line */}
                        <div className="mt-1 text-xs text-neutral-600">
                          Performance:{" "}
                          {pointTotals.grandPts > 0
                            ? `${Math.round(p.earnedTotal)}/${pointTotals.grandPts} pts • ${p.pct}%`
                            : "—"}
                        </div>
                      </div>

                      {/* Compact breakdown */}
                      <div className="hidden sm:flex items-center gap-2 text-[11px] text-neutral-600">
                        <span className="rounded border px-1.5 py-0.5">Files {comp.res}/{totals.res}</span>
                        <span className="rounded border px-1.5 py-0.5">Videos {comp.vid}/{totals.vid}</span>
                        <span className="rounded border px-1.5 py-0.5">Assign {comp.asg}/{totals.asg}</span>
                        <span className="rounded border px-1.5 py-0.5">Quiz {comp.quiz}/{totals.quiz}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
