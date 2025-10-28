"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  FunnelIcon,
  XMarkIcon,
  UserCircleIcon,
  CheckCircleIcon,
  PaperClipIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import type {
  AssignmentDataset,
  AssignmentOpt,
  ModuleOpt,
  QuarterOpt,
  LatestSubmission,
  RosterStudent,
} from "@/lib/types/progress";
import { supabase } from "@/lib/supabase";
import FilterBar from "@/app/components/FilterBar";
import AssignmentInlineViewer from "@/app/components/AssignmentInlineViewer";

type TabKey = "submitted" | "not-submitted";

/* ----------------------------- Tiny Toast ----------------------------- */
function Toast({
  kind = "info",
  message,
  onClose,
}: {
  kind?: "info" | "success" | "error";
  message: string;
  onClose?: () => void;
}) {
  const base =
    "pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-lg";
  const styles =
    kind === "success"
      ? "bg-green-50 border-green-200 text-green-800"
      : kind === "error"
      ? "bg-rose-50 border-rose-200 text-rose-800"
      : "bg-neutral-50 border-neutral-200 text-neutral-800";
  return (
    <div className={`${base} ${styles}`}>
      {kind === "error" ? (
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
      ) : (
        <CheckCircleIcon className="h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0">{message}</div>
      <button onClick={onClose} className="ml-1 text-xs underline">
        Dismiss
      </button>
    </div>
  );
}

/* ------------------------------ Skeleton ------------------------------ */
function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="h-4 w-28 rounded bg-neutral-200" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-neutral-200" />
        <div className="h-3 w-5/6 rounded bg-neutral-200" />
        <div className="h-3 w-4/6 rounded bg-neutral-200" />
      </div>
    </div>
  );
}

/* --------------------------- Local UI bits ---------------------------- */
function SectionAndSearch({
  sections,
  sectionValue,
  onSection,
  searchValue,
  onSearch,
  hideSearchIcon = false,
}: {
  sections: { id: string; name: string }[];
  sectionValue: string;
  onSection: (v: string) => void;
  searchValue: string;
  onSearch: (v: string) => void;
  hideSearchIcon?: boolean;
}) {
  return (
    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2">
        <span className="shrink-0 rounded-md bg-neutral-100 p-1">
          <FunnelIcon className="h-4 w-4 text-neutral-600" />
        </span>
        <select
          value={sectionValue}
          onChange={(e) => onSection(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        >
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2">
        {!hideSearchIcon && (
          <MagnifyingGlassIcon className="h-4 w-4 text-neutral-600" />
        )}
        <input
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name or LRN/username…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
    </div>
  );
}

/* ===================================================================== */

export default function ReviewAndGradePane() {
  const [quarters, setQuarters] = useState<QuarterOpt[]>([]);
  const [modules, setModules] = useState<ModuleOpt[]>([]);
  const [assignments, setAssignments] = useState<AssignmentOpt[]>([]);

  const [quarterId, setQuarterId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");

  const [dataset, setDataset] = useState<AssignmentDataset | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("submitted");

  const [review, setReview] =
    useState<{ sub?: LatestSubmission; student?: RosterStudent } | null>(null);

  const [assignmentMeta, setAssignmentMeta] =
    useState<{ name?: string | null; max_score?: number | null } | null>(null);

  /* per-card filters */
  const [sectionSubmitted, setSectionSubmitted] = useState<string>("");
  const [sectionNot, setSectionNot] = useState<string>("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [searchNot, setSearchNot] = useState(""); // kept, but not used anymore

  /* Section lookups */
  const [studentSectionIdById, setStudentSectionIdById] = useState<
    Record<string, number | null>
  >({});
  const [sectionNameById, setSectionNameById] = useState<
    Record<string, string>
  >({});

  /* Avatar URLs */
  const [studentAvatarUrlById, setStudentAvatarUrlById] = useState<
    Record<string, string | null>
  >({});

  /* ------------------------------ Filters load ------------------------------ */
  useEffect(() => {
    const loadQuarters = async () => {
      setLoadingFilters(true);
      try {
        const res = await fetch(`/api/progress/filters`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load filters.");
        setQuarters(json.quarters ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingFilters(false);
      }
    };
    loadQuarters();
  }, []);

  useEffect(() => {
    const run = async () => {
      setModules([]);
      setAssignments([]);
      setModuleId("");
      setAssignmentId("");
      setDataset(null);
      if (!quarterId) return;
      setLoadingFilters(true);
      try {
        const res = await fetch(`/api/progress/filters?quarterId=${quarterId}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load modules.");
        setModules(json.modules ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingFilters(false);
      }
    };
    run();
  }, [quarterId]);

  useEffect(() => {
    const run = async () => {
      setAssignments([]);
      setAssignmentId("");
      setDataset(null);
      if (!moduleId) return;
      setLoadingFilters(true);
      try {
        const res = await fetch(`/api/progress/filters?moduleId=${moduleId}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok)
          throw new Error(json?.error || "Failed to load assignments.");
        setAssignments(json.assignments ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingFilters(false);
      }
    };
    run();
  }, [moduleId]);

  useEffect(() => {
    const run = async () => {
      setDataset(null);
      if (!assignmentId) return;
      setLoadingData(true);
      try {
        const res = await fetch(
          `/api/progress/assignment?assignmentId=${assignmentId}`,
          { cache: "no-store" }
        );
        const raw = await res.json();
        if (!res.ok)
          throw new Error(raw?.error || "Failed to load assignment dataset.");
        const normalized: AssignmentDataset = {
          ...raw,
          roster: Array.isArray(raw?.roster) ? raw.roster : [],
          latestSubmissions: Array.isArray(raw?.latestSubmissions)
            ? raw.latestSubmissions
            : [],
          metrics: raw?.metrics ?? undefined,
          debug: raw?.debug ?? undefined,
        };
        setDataset(normalized);
        // reset local filters on fresh dataset
        setSectionSubmitted("");
        setSectionNot("");
        setSearchSubmitted("");
        setSearchNot("");
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingData(false);
      }
    };
    run();
  }, [assignmentId]);

  useEffect(() => {
    const loadAssignmentMeta = async () => {
      setAssignmentMeta(null);
      if (!assignmentId) return;
      const { data, error } = await supabase
        .from("assignments")
        .select("name,max_score")
        .eq("id", assignmentId)
        .maybeSingle();
      if (!error)
        setAssignmentMeta({
          name: data?.name ?? null,
          max_score: data?.max_score ?? null,
        });
    };
    loadAssignmentMeta();
  }, [assignmentId]);

  /* === Resolve sections & avatars for the current roster =================== */

  // storage path -> URL
  const resolveAvatarUrl = async (raw?: string | null): Promise<string | null> => {
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;

    let bucket = "student-avatars";
    let path = raw;
    const firstSlash = raw.indexOf("/");
    const firstPart = firstSlash > -1 ? raw.slice(0, firstSlash) : raw;

    if (
      ["student-avatars", "teacher-avatars", "avatars", "module-images"].includes(
        firstPart
      )
    ) {
      bucket = firstPart;
      path = firstSlash > -1 ? raw.slice(firstSlash + 1) : "";
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    if (pub?.publicUrl) return pub.publicUrl;

    try {
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      return signed?.signedUrl ?? null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const roster = dataset?.roster ?? [];
    if (!roster.length) {
      setStudentSectionIdById({});
      setSectionNameById({});
      setStudentAvatarUrlById({});
      return;
    }
    const studentIds = roster.map((r) => r.id);

    (async () => {
      // 1) section_id + profile_picture_url per student
      const { data: stu, error: e1 } = await supabase
        .from("students")
        .select("id, section_id, profile_picture_url")
        .in("id", studentIds);
      if (e1 || !stu) {
        setStudentSectionIdById({});
        setSectionNameById({});
        setStudentAvatarUrlById({});
        return;
      }

      const sidById: Record<string, number | null> = {};
      const sectionIds = new Set<number>();
      for (const row of stu as {
        id: string;
        section_id: number | null;
        profile_picture_url?: string | null;
      }[]) {
        sidById[row.id] = row.section_id ?? null;
        if (row.section_id != null) sectionIds.add(row.section_id);
      }
      setStudentSectionIdById(sidById);

      // resolve avatars
      const avatarPairs = await Promise.all(
        (stu as { id: string; profile_picture_url?: string | null }[]).map(
          async (row) =>
            [row.id, await resolveAvatarUrl(row.profile_picture_url ?? null)] as const
        )
      );
      setStudentAvatarUrlById(Object.fromEntries(avatarPairs));

      // 2) section names
      if (sectionIds.size === 0) {
        setSectionNameById({});
        return;
      }
      const idsArr = Array.from(sectionIds);
      const { data: secs, error: e2 } = await supabase
        .from("sections")
        .select("id,name")
        .in("id", idsArr);
      if (e2 || !secs) {
        setSectionNameById({});
        return;
      }
      const nameById: Record<string, string> = {};
      for (const s of secs as { id: number; name: string }[])
        nameById[String(s.id)] = s.name;
      setSectionNameById(nameById);
    })();
  }, [dataset?.roster]);

  const getSectionIdStr = (row: any): string | null => {
    const sid =
      studentSectionIdById[row?.id] ??
      row?.section_id ??
      row?.sectionId ??
      row?.sectionID ??
      null;
    if (sid == null) return null;
    return String(sid);
  };

  const sectionNameFor = (row: any): string => {
    const sidStr = getSectionIdStr(row);
    if (!sidStr) return "No section";
    return sectionNameById[sidStr] ?? `Section ${sidStr}`;
  };

  const avatarUrlFor = (row: any): string | null =>
    studentAvatarUrlById[row?.id] ?? null;

  /* ✅ initials helper (default avatar text) */
  const initialsFor = (row: any): string => {
    const f = String(row?.first_name ?? "").trim();
    const l = String(row?.last_name ?? "").trim();
    const fi = f.charAt(0);
    const li = l.charAt(0);
    const letters =
      (fi + li).toUpperCase() ||
      String(row?.username ?? "").trim().slice(0, 2).toUpperCase();
    return letters || "??";
  };

  /* ------------------------------ Derived lists ----------------------------- */
  const roster: RosterStudent[] = useMemo(
    () => dataset?.roster ?? [],
    [dataset]
  );

  const sectionOptions = useMemo(() => {
    const ids = Array.from(
      new Set(
        roster
          .map((r: any) => getSectionIdStr(r))
          .filter((v): v is string => !!v)
      )
    );
    return ids.map((id) => ({
      id,
      name: sectionNameById[id] ?? `Section ${id}`,
    }));
  }, [roster, sectionNameById]);

  const submittedRaw = useMemo(() => {
    const latest = dataset?.latestSubmissions ?? [];
    const byStudent = new Map(
      (dataset?.roster ?? []).map((r) => [r.id, r] as const)
    );
    return latest
      .filter((s) => !!s.submitted_at)
      .map((s) => {
        const student = byStudent.get(s.student_id);
        return student ? { sub: s, student } : null;
      })
      .filter(Boolean) as { sub: LatestSubmission; student: RosterStudent }[];
  }, [dataset]);

  const notSubmittedRaw = useMemo(() => {
    const latest = dataset?.latestSubmissions ?? [];
    const submittedIds = new Set(
      latest.filter((s) => !!s.submitted_at).map((s) => s.student_id)
    );
    return (dataset?.roster ?? []).filter((r) => !submittedIds.has(r.id));
  }, [dataset]);

  const normalizeSectionId = (s: any) => getSectionIdStr(s) ?? "";

  const matchesQuery = (s: any, q: string) => {
    if (!q.trim()) return true;
    const hay = `${s.first_name ?? ""} ${s.middle_name ?? ""} ${
      s.last_name ?? ""
    } ${s.lrn ?? ""} ${s.username ?? ""}`
      .toLowerCase()
      .replace(/\s+/g, " ");
    return hay.includes(q.trim().toLowerCase());
  };

  const submittedList = useMemo(() => {
    return submittedRaw
      .filter(({ student }) =>
        sectionSubmitted ? normalizeSectionId(student) === sectionSubmitted : true
      )
      .filter(({ student }) => matchesQuery(student, searchSubmitted));
  }, [submittedRaw, sectionSubmitted, searchSubmitted]);

  const notSubmittedList = useMemo(() => {
    // search removed from Not Submitted; keep section filter only
    return notSubmittedRaw.filter((s) =>
      sectionNot ? normalizeSectionId(s) === sectionNot : true
    );
  }, [notSubmittedRaw, sectionNot]);

  const maxScore: number = useMemo(() => {
    const v = assignmentMeta?.max_score;
    return typeof v === "number" && Number.isFinite(v) ? v : 100;
  }, [assignmentMeta]);

  /* ----------------------------- CSV export ------------------------------ */

  // Safe label lookups (use any to avoid TS errors if shape differs)
  const findQuarterName = (id: string) =>
    quarters.find((q) => String(q.id) === String(id))?.name ?? "";

  const findModuleName = (id: string) => {
    const m = modules.find((m) => String((m as any).id) === String(id));
    if (!m) return "";
    // some codebases use 'title' and others 'name' — try both safely
    return (m as any).title ?? (m as any).name ?? "";
  };

  const findAssignmentName = (id: string) => {
    const a = assignments.find((a) => String((a as any).id) === String(id));
    if (!a) return assignmentMeta?.name ?? "";
    return (a as any).name ?? (a as any).title ?? assignmentMeta?.name ?? "";
  };

  const exportSubmittedCsv = () => {
    // Build CSV rows from submittedList (respect current filters)
    const rows = submittedList.map(({ sub, student }) => {
      const fullName = `${student.last_name ?? ""}, ${student.first_name ?? ""}`;
      const section = sectionNameFor(student);
      const quarterLabel = findQuarterName(quarterId) || "";
      const moduleLabel = findModuleName(moduleId) || "";
      const assignmentLabel = findAssignmentName(assignmentId) || "";
      const score = sub.grade == null ? "" : String(sub.grade);
      const feedback = (sub as any).feedback ?? "";
      return {
        name: fullName,
        section,
        quarter: quarterLabel,
        module: moduleLabel,
        assignment: assignmentLabel,
        score,
        feedback,
      };
    });

    // header
    const header = ["Name", "Section", "Quarter", "Module", "Assignment", "Score", "Feedback"];
    // escape CSV fields
    const escapeCell = (v: string) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv =
      header.join(",") +
      "\n" +
      rows
        .map((r) =>
          [
            escapeCell(r.name),
            escapeCell(r.section),
            escapeCell(r.quarter),
            escapeCell(r.module),
            escapeCell(r.assignment),
            escapeCell(r.score),
            escapeCell(r.feedback),
          ].join(",")
        )
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const filenameBase = (assignmentMeta?.name ?? "assignment")
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]/g, "");
    const filename = `${filenameBase || "assignment"}-submissions.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportNotSubmittedCsv = () => {
    // Build CSV rows from notSubmittedList (respect current filters)
    const rows = notSubmittedList.map((student) => {
      const fullName = `${student.last_name ?? ""}, ${student.first_name ?? ""}`;
      const section = sectionNameFor(student);
      const quarterLabel = findQuarterName(quarterId) || "";
      const moduleLabel = findModuleName(moduleId) || "";
      const assignmentLabel = findAssignmentName(assignmentId) || "";
      return {
        name: fullName,
        section,
        quarter: quarterLabel,
        module: moduleLabel,
        assignment: assignmentLabel,
        status: "Not submitted",
      };
    });

    const header = ["Name", "Section", "Quarter", "Module", "Assignment", "Status"];
    const escapeCell = (v: string) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv =
      header.join(",") +
      "\n" +
      rows
        .map((r) =>
          [
            escapeCell(r.name),
            escapeCell(r.section),
            escapeCell(r.quarter),
            escapeCell(r.module),
            escapeCell(r.assignment),
            escapeCell(r.status),
          ].join(",")
        )
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const filenameBase = (assignmentMeta?.name ?? "assignment")
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]/g, "");
    const filename = `${filenameBase || "assignment"}-not-submitted.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /* ---------------------------------- UI ----------------------------------- */
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm min-h-[480px]">
      {/* Controls */}
      <div className="mb-3">
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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2 sm:mb-3">
        <Stat label="Total Students" value={(dataset?.roster ?? []).length} />
        <Stat label="Submitted" value={dataset?.metrics?.submitted ?? 0} />
        <Stat label="Graded" value={dataset?.metrics?.graded ?? 0} />
        <Stat label="Avg Score" value={dataset?.metrics?.avgScore ?? "—"} />
      </div>

      {/* Tabs (mobile) */}
      <div className="sm:hidden sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70 mb-2">
        <div className="flex items-center gap-2 py-1">
          <button
            className={`flex-1 px-3 py-2 rounded-xl text-sm border ${
              activeTab === "submitted"
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 bg-white"
            }`}
            onClick={() => setActiveTab("submitted")}
          >
            Submitted
          </button>
          <button
            className={`flex-1 px-3 py-2 rounded-xl text-sm border ${
              activeTab === "not-submitted"
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 bg-white"
            }`}
            onClick={() => setActiveTab("not-submitted")}
          >
            Not Submitted
          </button>
        </div>
      </div>

      {loadingData ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : assignmentId && dataset ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4 min-w-0">
          {/* Submitted */}
          <section
            className={`min-w-0 ${activeTab !== "submitted" ? "sm:block hidden" : ""}`}
          >
            <ListCard
              title="Submitted"
              icon={<ClipboardDocumentCheckIcon className="w-5 h-5" />}
              count={submittedList.length}
              emptyText="No submissions yet."
              /* keep filters/search visible even when empty */
              showChildrenWhenEmpty
              headerAction={
                <button
                  onClick={exportSubmittedCsv}
                  className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
                  title="Export CSV"
                  aria-label="Export submitted list to CSV"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              }
            >
              <SectionAndSearch
                sections={sectionOptions}
                sectionValue={sectionSubmitted}
                onSection={setSectionSubmitted}
                searchValue={searchSubmitted}
                onSearch={setSearchSubmitted}
                hideSearchIcon={false}
              />

              <ul className="divide-y">
                {submittedList.map(({ sub, student }) => {
                  const avatarUrl = avatarUrlFor(student);
                  const initials = initialsFor(student);
                  return (
                    <li key={sub.id} className="py-3 px-2">
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] items-start md:items-center gap-2 md:gap-3 min-w-0">
                        {/* Left: avatar + name + section */}
                        <div className="min-w-0 pr-1 flex items-start gap-3">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={`${student.first_name ?? ""} ${student.last_name ?? ""}`}
                              className="h-9 w-9 rounded-full object-cover ring-1 ring-neutral-200"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-neutral-100 grid place-items-center ring-1 ring-neutral-200">
                              <span className="text-xs font-semibold text-neutral-700">
                                {initials}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-neutral-900 leading-5 whitespace-normal break-words">
                              {student.last_name}, {student.first_name}
                            </div>
                            <div className="mt-0.5 text-xs text-neutral-500">
                              {sectionNameFor(student)}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] shrink-0 ${
                              sub.grade === null
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-green-50 border-green-200 text-green-700"
                            }`}
                          >
                            <CheckBadgeIcon className="w-4 h-4" />
                            {sub.grade === null ? "Ungraded" : `Grade: ${sub.grade}`}
                          </span>
                          <button
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-2.5 py-1.5 text-sm hover:bg-neutral-50 w-full md:w-auto shrink-0 whitespace-nowrap"
                            onClick={() => setReview({ sub, student })}
                            aria-label="Review & Grade"
                            title="Review & Grade"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                            <span className="hidden lg:inline">Review &amp; Grade</span>
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ListCard>
          </section>

          {/* Not Submitted */}
          <section
            className={`min-w-0 ${activeTab !== "not-submitted" ? "sm:block hidden" : ""}`}
          >
            <ListCard
              title="Not Submitted"
              icon={<FunnelIcon className="w-5 h-5" />}
              count={notSubmittedList.length}
              emptyText="All students have submitted."
              /* ✅ keep filters visible even when count is 0 */
              showChildrenWhenEmpty
              headerAction={
                <button
                  onClick={exportNotSubmittedCsv}
                  className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
                  title="Export CSV"
                  aria-label="Export not-submitted list to CSV"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              }
            >
              {/* Only section filter (search removed) */}
              <div className="mb-3 grid grid-cols-1">
                <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2">
                  <span className="shrink-0 rounded-md bg-neutral-100 p-1">
                    <FunnelIcon className="h-4 w-4 text-neutral-600" />
                  </span>
                  <select
                    value={sectionNot}
                    onChange={(e) => setSectionNot(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  >
                    <option value="">All sections</option>
                    {sectionOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <ul className="divide-y">
                {notSubmittedList.map((s) => {
                  const avatarUrl = avatarUrlFor(s);
                  const initials = initialsFor(s);
                  return (
                    <li key={s.id} className="px-2 py-3">
                      <div className="flex items-center gap-3">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={`${s.first_name ?? ""} ${s.last_name ?? ""}`}
                            className="h-9 w-9 rounded-full object-cover ring-1 ring-neutral-200"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-neutral-100 grid place-items-center ring-1 ring-neutral-200">
                            <span className="text-xs font-semibold text-neutral-700">
                              {initials}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-neutral-900">
                            {s.last_name}, {s.first_name}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {sectionNameFor(s)}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ListCard>
          </section>
        </div>
      ) : (
        <div className="text-sm text-neutral-500">
          Select an assignment to view submissions.
        </div>
      )}

      {/* Review & Grade Modal */}
      {review?.sub && review?.student && dataset && (
        <ReviewModal
          open
          sub={review.sub}
          student={review.student}
          maxScore={maxScore}
          avatarUrl={avatarUrlFor(review.student)}
          onClose={() => setReview(null)}
          onSaved={(updated) => {
            setDataset((d) => {
              if (!d) return d;
              return {
                ...d,
                latestSubmissions: (d.latestSubmissions ?? []).map((s) =>
                  s.id === updated.id
                    ? {
                        ...s,
                        grade: updated.grade,
                        feedback: updated.feedback ?? null,
                      }
                    : s
                ),
              };
            });
          }}
          findNextUngraded={() => {
            const next = submittedRaw.find(
              ({ sub }) => sub.grade === null && sub.id !== review.sub!.id
            );
            if (next) setReview({ sub: next.sub, student: next.student });
            else setReview(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------- Modal Component ---------------------------- */

function ReviewModal({
  open,
  sub,
  student,
  maxScore,
  avatarUrl,
  onClose,
  onSaved,
  findNextUngraded,
}: {
  open: boolean;
  sub: LatestSubmission;
  student: RosterStudent;
  maxScore: number;
  avatarUrl?: string | null;
  onClose: () => void;
  onSaved: (u: { id: string; grade: number | null; feedback?: string | null }) => void;
  findNextUngraded: () => void;
}) {
  const [grade, setGrade] = useState<string>(
    sub.grade == null ? "" : String(sub.grade)
  );
  const [feedback, setFeedback] = useState<string>((sub as any).feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    setGrade(sub.grade == null ? "" : String(sub.grade));
    setFeedback((sub as any).feedback ?? "");
  }, [sub.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") {
        e.preventDefault();
        void doSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, grade, feedback]);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  };

  const handleGradeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "") {
      setGrade("");
      return;
    }
    let n = Number(val);
    if (Number.isNaN(n)) return;
    if (n < 0) n = 0;
    if (n > maxScore) n = maxScore;
    setGrade(String(n));
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const trimmed = grade.trim();
      const parsed = trimmed === "" ? null : Number(trimmed);

      if (parsed != null) {
        if (Number.isNaN(parsed)) {
          showToast("error", "Enter a valid number.");
          return;
        }
        if (parsed < 0) {
          showToast("error", "Score cannot be less than 0.");
          return;
        }
        if (parsed > maxScore) {
          showToast("error", `Score cannot exceed assignment max (${maxScore}).`);
          return;
        }
      }

      const payload: any = { grade: parsed, feedback: feedback.trim() || null };
      const { error } = await supabase
        .from("assignment_submissions")
        .update(payload)
        .eq("id", sub.id);
      if (error) {
        showToast("error", error.message || "Failed to save.");
        return;
      }

      onSaved({ id: sub.id, grade: parsed, feedback: payload.feedback });
      showToast("success", "Saved.");
      onClose();
    } catch (e: any) {
      showToast("error", e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-[70] bg-black/50 p-4 sm:p-6 flex items-center justify-center"
    >
      {/* toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center sm:justify-end px-4">
        {toast ? (
          <Toast kind={toast.kind} message={toast.msg} onClose={() => setToast(null)} />
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-6xl bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b bg-white/85 backdrop-blur px-5 py-4">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0 flex items-center gap-2">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${student.first_name ?? ""} ${student.last_name ?? ""}`}
                  className="h-9 w-9 rounded-full object-cover ring-1 ring-neutral-200"
                  loading="lazy"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-neutral-100 grid place-items-center">
                  <UserCircleIcon className="h-5 w-5 text-neutral-500" />
                </div>
              )}
              <div className="min-w-0">
                <div className="font-medium text-neutral-900 truncate">
                  {student.last_name}, {student.first_name}
                </div>
                <div className="text-xs text-neutral-500">
                  {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : "—"}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-neutral-600 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* Left */}
          <div className="min-h-0 min-w-0 overflow-y-auto p-4 sm:p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <PaperClipIcon className="h-5 w-5" />
              Student Work
            </div>

            {(sub as any).answer_text ? (
              <div className="mb-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="mb-1 text-xs text-neutral-500">Answer Text</div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-900">
                  {(sub as any).answer_text}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl ring-1 ring-slate-200 bg-white p-3 min-h-[260px]">
              <AssignmentInlineViewer
                filePathOrUrl={(sub as any).file_url}
                frameHeightClass="h-[70vh]"
              />
            </div>
          </div>

          {/* Right: Grading + Feedback */}
          <aside className="min-h-0 overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-200 p-4 sm:p-5">
            <div className="mb-3 text-sm font-semibold text-slate-800">
              Review &amp; Grade
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Score <span className="font-semibold">({maxScore})</span>
              <input
                key={`score-${maxScore}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={maxScore}
                step={1}
                placeholder={`0–${maxScore}`}
                value={grade}
                onChange={handleGradeChange}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
            </label>

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700">
                Personalized Feedback
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Write feedback for the student…"
                rows={6}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Tip: <kbd className="rounded bg-slate-100 px-1">Ctrl/⌘ + Enter</kbd> to Save.
              </p>
            </div>

            <div className="mt-5 grid gap-2 sm:auto-cols-max sm:grid-flow-col">
              <button
                onClick={() => void doSave()}
                disabled={saving}
                className="w-full sm:w-auto whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                <CheckCircleIcon className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={findNextUngraded}
                disabled={saving}
                className="w-full sm:w-auto whitespace-nowrap rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-60"
              >
                Skip
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Bits -------------------------------- */

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

function ListCard({
  title,
  icon,
  count,
  emptyText,
  children,
  showChildrenWhenEmpty = false,
  headerAction,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  emptyText: string;
  children: React.ReactNode;
  showChildrenWhenEmpty?: boolean;
  headerAction?: React.ReactNode;
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
        <div>{headerAction ?? null}</div>
      </div>
      {count === 0 ? (
        <>
          {showChildrenWhenEmpty ? children : null}
          <div className="text-sm text-neutral-500">{emptyText}</div>
        </>
      ) : (
        children
      )}
    </div>
  );
}
