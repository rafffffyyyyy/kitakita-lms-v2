"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AcademicCapIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  DocumentMagnifyingGlassIcon,
  FunnelIcon,
  ShieldCheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type {
  AssignmentDataset,
  AssignmentOpt,
  ModuleOpt,
  QuarterOpt,
  LatestSubmission,
  RosterStudent,
} from "@/lib/types/progress";
import FilterBar from "@/app/components/FilterBar";
import FilePreview from "@/app/components/FilePreview";
import GradeDialog from "@/app/components/GradeDialog";
import DebugBar from "@/app/components/DebugBar";

type TabKey = "submitted" | "not-submitted";

export default function StudentProgressClient({
  initialQuarters = [],
}: {
  initialQuarters?: QuarterOpt[];
}) {
  // Filters
  const [quarters, setQuarters] = useState<QuarterOpt[]>(initialQuarters);
  const [modules, setModules] = useState<ModuleOpt[]>([]);
  const [assignments, setAssignments] = useState<AssignmentOpt[]>([]);

  const [quarterId, setQuarterId] = useState<string>("");
  const [moduleId, setModuleId] = useState<string>("");
  const [assignmentId, setAssignmentId] = useState<string>("");

  // Data
  const [dataset, setDataset] = useState<AssignmentDataset | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<TabKey>("submitted");
  const [review, setReview] = useState<{
    sub?: LatestSubmission;
    student?: RosterStudent;
  } | null>(null);
  const [clientDebug, setClientDebug] = useState<{
    lastFiltersMs?: number;
    lastDataMs?: number;
    lastError?: string | null;
  }>({});

  // ====== Load Quarters on mount (skip if provided by server) ======
  useEffect(() => {
    if (initialQuarters && initialQuarters.length > 0) return;

    const loadQuarters = async () => {
      setLoadingFilters(true);
      setError(null);
      const t0 = performance.now();
      try {
        const res = await fetch(`/api/progress/filters`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load filters.");
        setQuarters(json.quarters ?? []);
      } catch (e: any) {
        setError(e.message);
        setClientDebug((s) => ({ ...s, lastError: e.message }));
      } finally {
        const dt = Math.round(performance.now() - t0);
        setClientDebug((s) => ({ ...s, lastFiltersMs: dt }));
        setLoadingFilters(false);
      }
    };
    loadQuarters();
  }, [initialQuarters]);

  // ====== Load Modules when quarter changes ======
  useEffect(() => {
    const run = async () => {
      setModules([]);
      setAssignments([]);
      setModuleId("");
      setAssignmentId("");
      setDataset(null);
      if (!quarterId) return;

      setLoadingFilters(true);
      setError(null);
      const t0 = performance.now();
      try {
        const res = await fetch(`/api/progress/filters?quarterId=${quarterId}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load modules.");
        setModules(json.modules ?? []);
      } catch (e: any) {
        setError(e.message);
        setClientDebug((s) => ({ ...s, lastError: e.message }));
      } finally {
        const dt = Math.round(performance.now() - t0);
        setClientDebug((s) => ({ ...s, lastFiltersMs: dt }));
        setLoadingFilters(false);
      }
    };
    run();
  }, [quarterId]);

  // ====== Load Assignments when module changes ======
  useEffect(() => {
    const run = async () => {
      setAssignments([]);
      setAssignmentId("");
      setDataset(null);
      if (!moduleId) return;

      setLoadingFilters(true);
      setError(null);
      const t0 = performance.now();
      try {
        const res = await fetch(`/api/progress/filters?moduleId=${moduleId}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok)
          throw new Error(json?.error || "Failed to load assignments.");
        setAssignments(json.assignments ?? []);
      } catch (e: any) {
        setError(e.message);
        setClientDebug((s) => ({ ...s, lastError: e.message }));
      } finally {
        const dt = Math.round(performance.now() - t0);
        setClientDebug((s) => ({ ...s, lastFiltersMs: dt }));
        setLoadingFilters(false);
      }
    };
    run();
  }, [moduleId]);

  // ====== Load Assignment dataset when assignment changes ======
  useEffect(() => {
    const run = async () => {
      setDataset(null);
      if (!assignmentId) return;

      setLoadingData(true);
      setError(null);
      const t0 = performance.now();
      try {
        const res = await fetch(
          `/api/progress/assignment?assignmentId=${assignmentId}`,
          { cache: "no-store" }
        );
        const json: AssignmentDataset = await res.json();
        if (!res.ok)
          throw new Error((json as any)?.error || "Failed to load assignment dataset.");
        setDataset(json);
      } catch (e: any) {
        setError(e.message);
        setClientDebug((s) => ({ ...s, lastError: e.message }));
      } finally {
        const dt = Math.round(performance.now() - t0);
        setClientDebug((s) => ({ ...s, lastDataMs: dt }));
        setLoadingData(false);
      }
    };
    run();
  }, [assignmentId]);

  const submittedList = useMemo(() => {
    if (!dataset) return [];
    const byStudent = new Map(dataset.roster.map((r) => [r.id, r]));
    const list = dataset.latestSubmissions
      .filter((s) => !!s.submitted_at)
      .map((s) => ({ sub: s, student: byStudent.get(s.student_id)! }))
      .sort((a, b) =>
        a.sub.submitted_at! < b.sub.submitted_at! ? 1 : -1
      );
    return list;
  }, [dataset]);

  const notSubmittedList = useMemo(() => {
    if (!dataset) return [];
    const submittedIds = new Set(
      dataset.latestSubmissions
        .filter((s) => !!s.submitted_at)
        .map((s) => s.student_id)
    );
    return dataset.roster.filter((r) => !submittedIds.has(r.id));
  }, [dataset]);

  // ====== Render ======
  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-white">
      {/* Header */}
      <div className="border-b bg-white/90">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
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

          {/* Top filters (non-overlapping grid) */}
          <div className="mt-4">
            <FilterBar
              quarters={quarters}
              modules={modules}
              assignments={assignments}
              quarterId={quarterId}
              moduleId={moduleId}
              assignmentId={assignmentId}
              onQuarter={setQuarterId}
              onModule={setModuleId}
              onAssignment={setAssignmentId}
              busy={loadingFilters}
            />
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pt-3">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
            <XMarkIcon className="h-5 w-5 inline-block mr-2" />
            {error}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Roster" value={dataset?.roster.length ?? 0} />
          <StatCard label="Submitted" value={dataset?.metrics?.submitted ?? 0} />
          <StatCard label="Graded" value={dataset?.metrics?.graded ?? 0} />
          <StatCard label="Avg Score" value={dataset?.metrics?.avgScore ?? "—"} />
        </div>
      </div>

      {/* Body: Tabs on mobile, split on desktop */}
      <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pb-6 flex-1 min-h-0">
        {/* Tabs (mobile) */}
        <div className="sm:hidden mb-3 flex items-center gap-2">
          <button
            className={`px-3 py-2 rounded-xl text-sm border ${
              activeTab === "submitted"
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 bg-white"
            }`}
            onClick={() => setActiveTab("submitted")}
          >
            Submitted
          </button>
          <button
            className={`px-3 py-2 rounded-xl text-sm border ${
              activeTab === "not-submitted"
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 bg-white"
            }`}
            onClick={() => setActiveTab("not-submitted")}
          >
            Not Submitted
          </button>
        </div>

        {loadingData && (
          <div className="text-sm text-neutral-500 flex items-center gap-2">
            <ArrowPathIcon className="w-5 h-5 animate-spin" /> Loading…
          </div>
        )}

        {!loadingData && assignmentId && dataset && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
            {/* Submitted List */}
            <section
              className={`min-w-0 ${
                activeTab !== "submitted" ? "sm:block hidden" : ""
              }`}
            >
              <ListCard
                title="Submitted"
                icon={<ClipboardDocumentCheckIcon className="w-5 h-5" />}
                count={submittedList.length}
                emptyText="No submissions yet."
              >
                <ul className="divide-y">
                  {submittedList.map(({ sub, student }) => (
                    <li key={sub.id} className="py-3 px-2">
                      <div className="flex items-center justify-between gap-3 min-w-0">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-neutral-900 truncate">
                            {student.last_name}, {student.first_name}
                          </div>
                          <div className="text-xs text-neutral-500 whitespace-nowrap">
                            {sub.submitted_at
                              ? new Date(sub.submitted_at).toLocaleString()
                              : "—"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                              sub.grade === null
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-green-50 border-green-200 text-green-700"
                            }`}
                          >
                            <CheckBadgeIcon className="w-4 h-4" />
                            {sub.grade === null ? "Ungraded" : `Grade: ${sub.grade}`}
                          </span>
                          <button
                            className="whitespace-nowrap rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
                            onClick={() => setReview({ sub, student })}
                          >
                            Review
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </ListCard>
            </section>

            {/* Not Submitted List */}
            <section
              className={`min-w-0 ${
                activeTab !== "not-submitted" ? "sm:block hidden" : ""
              }`}
            >
              <ListCard
                title="Not Submitted"
                icon={<FunnelIcon className="w-5 h-5" />}
                count={notSubmittedList.length}
                emptyText="All students have submitted."
              >
                <div className="flex flex-wrap gap-2">
                  {notSubmittedList.map((s) => (
                    <span
                      key={s.id}
                      title={`${s.last_name}, ${s.first_name}`}
                      className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-800"
                    >
                      {s.last_name}, {s.first_name}
                    </span>
                  ))}
                </div>
              </ListCard>
            </section>
          </div>
        )}

        {!loadingData && !assignmentId && (
          <div className="text-sm text-neutral-500">
            Select an assignment to view submissions.
          </div>
        )}
      </div>

      {/* Grade Dialog */}
      {review?.sub && review?.student && dataset && (
        <GradeDialog
          open={!!review}
          onClose={() => setReview(null)}
          submission={review.sub}
          student={review.student}
          onSaved={(updated) => {
            // Optimistic update: reflect grade immediately
            setDataset((d) => {
              if (!d) return d;
              const next = {
                ...d,
                latestSubmissions: d.latestSubmissions.map((s) =>
                  s.id === updated.id
                    ? { ...s, grade: updated.grade, feedback: updated.feedback }
                    : s
                ),
              };
              return next;
            });
          }}
          findNextUngraded={() => {
            const next = submittedList.find(
              ({ sub }) => sub.grade === null && sub.id !== review.sub!.id
            );
            if (next) setReview({ sub: next.sub, student: next.student });
            else setReview(null);
          }}
        >
          {/* Left pane: student work */}
          <div className="min-h-0 overflow-auto">
            <div className="text-sm text-neutral-500 mb-2">Student Work</div>
            <FilePreview
              file_url={review.sub.file_url}
              answer_text={review.sub.answer_text}
            />
          </div>
        </GradeDialog>
      )}

      {/* Debug panel (non-intrusive, copyable) */}
      <DebugBar
        serverMs={dataset?.debug?.t_ms}
        serverRows={dataset?.debug?.rows}
        clientMs={{ filters: clientDebug.lastFiltersMs, data: clientDebug.lastDataMs }}
        error={clientDebug.lastError}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

function ListCard({
  title,
  icon,
  count,
  emptyText,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-3 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-50">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-neutral-900">{title}</div>
            <div className="text-xs text-neutral-500">{count} item(s)</div>
          </div>
        </div>
        <div className="text-neutral-400 text-xs">
          {/* placeholder for list actions */}
        </div>
      </div>
      {count === 0 ? (
        <div className="text-sm text-neutral-500">{emptyText}</div>
      ) : (
        children
      )}
    </div>
  );
}
