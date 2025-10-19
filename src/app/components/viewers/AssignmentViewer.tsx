// /src/app/components/AssignmentViewer.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import FileViewer from "./FileViewer";
import { useUser } from "@/app/UserContext";
import {
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserCircleIcon,
  UsersIcon,
  ArrowUpTrayIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

/* ----------------------------- TYPES ----------------------------- */
export interface Assignment {
  id: string;
  name: string;
  instruction: string;
}
export interface AssignmentFile {
  assignment_id: string;
  file_url: string; // path inside "lms-files" bucket
}

type Student = {
  id: string;
  first_name: string | null;
  middle_name?: string | null;
  last_name: string | null;
  section_id: number | null;
  section_name?: string | null; // if you expose via view/join
};

type SubmissionRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  file_url: string | null;
  answer_text: string | null;
  submitted_at: string | null;
};

/* -------------------------- COMPONENT ---------------------------- */
export default function AssignmentViewer({
  assignment,
  assignmentFiles,
}: {
  assignment: Assignment;
  assignmentFiles: AssignmentFile[];
}) {
  const { role } = useUser(); // "teacher" | "student" | "admin" | null

  /* ---------------------- FILE URL RESOLUTION --------------------- */
  const filesForAssignment = useMemo(() => {
    const list = assignmentFiles.filter(
      (f) => f.assignment_id === assignment.id
    );
    return list.map((file) => {
      const { data } = supabase.storage.from("lms-files").getPublicUrl(file.file_url);
      return { ...file, publicUrl: data?.publicUrl ?? "" };
    });
  }, [assignment, assignmentFiles]);

  const firstUrl = filesForAssignment[0]?.publicUrl ?? "";
  const hasFile = filesForAssignment.length > 0;

  /* ---------------------- TEACHER: FETCH LIST --------------------- */
  const [students, setStudents] = useState<Student[]>([]);
  const [subsByStudent, setSubsByStudent] = useState<Record<string, SubmissionRow | undefined>>({});
  const [loadingRoster, setLoadingRoster] = useState(false);
  const isTeacher = role === "teacher";

  useEffect(() => {
    if (!isTeacher) return;

    const run = async () => {
      setLoadingRoster(true);
      try {
        // 1) current user (teacher)
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) throw new Error("No authenticated user");

        // 2) get teacher's students
        // You may restrict by section if needed; here we pull all for this teacher.
        const { data: studs, error: sErr } = await supabase
          .from("students")
          .select("id, first_name, middle_name, last_name, section_id")
          .eq("teacher_id", userId)
          .order("last_name", { ascending: true });

        if (sErr) throw sErr;
        setStudents(studs ?? []);

        // 3) get submissions for this assignment from those students
        if (studs && studs.length) {
          const ids = studs.map((s) => s.id);
          const { data: subs, error: subErr } = await supabase
            .from("assignment_submissions")
            .select("id, assignment_id, student_id, file_url, answer_text, submitted_at")
            .eq("assignment_id", assignment.id)
            .in("student_id", ids);

          if (subErr) throw subErr;

          const byId: Record<string, SubmissionRow> = {};
          (subs ?? []).forEach((r) => { byId[r.student_id] = r; });
          setSubsByStudent(byId);
        } else {
          setSubsByStudent({});
        }
      } catch (err) {
        console.error("Roster fetch failed:", err);
        setStudents([]);
        setSubsByStudent({});
      } finally {
        setLoadingRoster(false);
      }
    };

    run();
  }, [isTeacher, assignment.id]);

  /* -------------------------- UI HELPERS -------------------------- */
  const initials = (s: Student) => {
    const f = (s.first_name || "").trim();
    const l = (s.last_name || "").trim();
    return (f[0] || "").toUpperCase() + (l[0] || "").toUpperCase();
  };
  const fullName = (s: Student) =>
    [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");

  /* ----------------------------- UI ------------------------------- */
  return (
    <div className="h-full w-full">
      {/* Top meta bar */}
      <div className="sticky top-0 z-[1] border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-100">
              <ClipboardDocumentCheckIcon className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 leading-tight">
                {assignment.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <DocumentTextIcon className="h-4 w-4" />
                  {hasFile ? `${filesForAssignment.length} file${filesForAssignment.length > 1 ? "s" : ""}` : "No file"}
                </span>
                {isTeacher && (
                  <span className="inline-flex items-center gap-1">
                    <UsersIcon className="h-4 w-4" />
                    {loadingRoster ? "Loading students…" : `${students.length} students`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {assignment.instruction?.trim() && (
            <div className="mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-200/70 p-3 sm:p-4">
              <p className="text-sm text-slate-700 whitespace-pre-line">{assignment.instruction}</p>
            </div>
          )}
        </div>
      </div>

      {/* Main two-column content */}
      <div className="max-w-[1400px] mx-auto px-2 sm:px-6 py-4 sm:py-6">
        <div className="grid grid-cols-12 gap-3 sm:gap-6">
          {/* LEFT: File viewer */}
          <div className="col-span-12 lg:col-span-8 xl:col-span-9">
            <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden bg-white h-[70vh] sm:h-[78vh]">
              {hasFile ? (
                firstUrl ? (
                  <FileViewer src={firstUrl} />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="flex items-center gap-2 text-rose-600">
                      <InformationCircleIcon className="h-5 w-5" />
                      <span className="text-sm">Failed to load file.</span>
                    </div>
                  </div>
                )
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <DocumentTextIcon className="h-10 w-10 mx-auto text-slate-400" />
                    <p className="mt-2 text-sm text-slate-600">No file uploaded for this assignment.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Teacher roster / Student submission panel */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-3">
            {isTeacher ? (
              <div className="rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="h-5 w-5 text-slate-600" />
                    <h3 className="text-sm font-semibold text-slate-900">Submission Status</h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Shows students under you and whether they’ve submitted this assignment.
                  </p>
                </div>

                <div className="max-h-[68vh] overflow-auto divide-y divide-slate-100">
                  {loadingRoster && (
                    <div className="px-4 py-3 text-xs text-slate-500">Loading…</div>
                  )}

                  {!loadingRoster && students.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">
                      No students found for your class.
                    </div>
                  )}

                  {!loadingRoster &&
                    students.map((s) => {
                      const sub = subsByStudent[s.id];
                      const submitted = Boolean(sub?.submitted_at || sub?.file_url || sub?.answer_text);
                      return (
                        <div key={s.id} className="px-3 py-3 flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center ring-1 ring-white/60">
                            {s.first_name || s.last_name ? (
                              <span className="text-xs font-semibold text-slate-700">{initials(s)}</span>
                            ) : (
                              <UserCircleIcon className="h-7 w-7 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-800 truncate">{fullName(s) || "Unnamed Student"}</div>
                            <div className="text-xs text-slate-500">
                              {s.section_id ? `Section #${s.section_id}` : "No section"}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {submitted ? (
                              <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
                                <CheckCircleIcon className="h-4 w-4" />
                                Submitted
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-rose-50 text-rose-700 ring-1 ring-rose-600/20">
                                <XCircleIcon className="h-4 w-4" />
                                Not submitted
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              // Student view: placeholder where we'll mount the "Submit Work" component next
              <div className="rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <ArrowUpTrayIcon className="h-5 w-5 text-slate-600" />
                    <h3 className="text-sm font-semibold text-slate-900">Your Submission</h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    We’ll add the submission form here (upload file / write answer / submit).
                  </p>
                </div>

                <div className="p-4">
                  <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-4 text-sm text-slate-600">
                    Coming up next: submission panel for students.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
