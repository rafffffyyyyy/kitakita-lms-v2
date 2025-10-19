"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AcademicCapIcon,
  ClipboardDocumentCheckIcon,
  DocumentChartBarIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import type { RosterStudent } from "@/lib/types/progress";
import StudentList from "@/app/components/progress/StudentList";
import StudentOverviewPane from "@/app/components/progress/StudentOverviewPane";
import ReviewAndGradePane from "@/app/components/progress/ReviewAndGradePane";
import SummaryResult from "@/app/components/progress/SummaryResult";
import { supabase } from "@/lib/supabase";

type ViewMode = "overview" | "grade" | "summary";

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
        // EXPECTED: /api/progress/roster returns: { students: RosterStudent[] }
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
                {/* Key forces a remount when loading state flips, preventing hook-order mismatch inside StudentList */}
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
