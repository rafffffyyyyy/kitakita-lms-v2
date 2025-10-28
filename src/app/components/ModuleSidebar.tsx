// /src/app/components/ModuleSidebar.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  DocumentTextIcon,
  PresentationChartBarIcon,
  QuestionMarkCircleIcon,
  VideoCameraIcon,
  TrashIcon,
  ClipboardDocumentListIcon,
  PlusCircleIcon,
  ArrowUpOnSquareIcon,
  ClipboardDocumentCheckIcon,
  FlagIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useUser } from "@/app/UserContext";
import { supabase } from "@/lib/supabase";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { useRouter } from "next/navigation";

/* ----------------------------- Types ----------------------------- */
interface Resource {
  id: string;
  file_url: string;
  file_name?: string;
  type: string; // "pdf" | "word" | "ppt" | ...
}
interface Assignment {
  id: string;
  name: string;
  instruction: string;
  file_url?: string | null;
}
type YTLink = {
  id: string;
  module_id: string;
  title: string | null;
  youtube_url: string;
  order_index: number;
  created_at: string;
};

interface ModuleSidebarProps {
  isSidebarOpen: boolean;
  onToggle: () => void;
  resources: Resource[];
  selectedFileId: string | null;
  setSelectedView: (url: string | null) => void;
  setSelectedFileId: (id: string | null) => void;
  youtube_url?: string;
  onUploadClick: () => void;
  onAddAssignmentClick: () => void;
  moduleId: string;
  setResources: (res: Resource[]) => void;
  assignments: Assignment[];
  setAssignmentView: (assignment: Assignment | null) => void;
  onAddYouTubeLinkClick: () => void;
}

/* ----------------------------- UI helpers ----------------------------- */
const typeIcon = (type: string) => {
  switch (type) {
    case "pdf":
    case "word":
      return <DocumentTextIcon className="h-4 w-4 text-indigo-600" aria-hidden="true" />;
    case "ppt":
      return <PresentationChartBarIcon className="h-4 w-4 text-orange-600" aria-hidden="true" />;
    case "youtube":
      return <VideoCameraIcon className="h-4 w-4 text-red-600" aria-hidden="true" />;
    default:
      return <QuestionMarkCircleIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />;
  }
};
const shortName = (p: string) => p.split("/").pop() || p;

/* ----------------------------- Component ----------------------------- */
export default function ModuleSidebar(props: ModuleSidebarProps) {
  const {
    isSidebarOpen,
    onToggle,
    resources,
    selectedFileId,
    setSelectedView,
    setSelectedFileId,
    youtube_url,
    onUploadClick,
    onAddAssignmentClick,
    moduleId,
    setResources,
    assignments,
    setAssignmentView,
    onAddYouTubeLinkClick,
  } = props;

  const { role } = useUser();
  const router = useRouter();

  // local UI: search + pill filter
  type Tab = "all" | "files" | "videos" | "assignments" | "quizzes";
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  // delete state
  const [pendingDelete, setPendingDelete] = useState<Resource | null>(null);
  const [pendingDeleteAssignment, setPendingDeleteAssignment] = useState<Assignment | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);

  // youtube links
  const [ytLinks, setYtLinks] = useState<YTLink[]>([]);
  const [pendingDeleteYT, setPendingDeleteYT] = useState<YTLink | null>(null);

  // quizzes/tests status for this module
  const [prePublished, setPrePublished] = useState<boolean>(false);
  const [postPublished, setPostPublished] = useState<boolean>(false);
  const [quizCount, setQuizCount] = useState<number>(0);

  /* -------------------- YouTube live fetch -------------------- */
  const fetchYouTubeLinks = useCallback(async () => {
    const { data, error } = await supabase
      .from("module_youtube_links")
      .select("*")
      .eq("module_id", moduleId)
      .order("order_index", { ascending: true });

    if (error) {
      console.error("❌ Error fetching youtube links:", error.message);
      setYtLinks([]);
    } else {
      setYtLinks(data ?? []);
    }
  }, [moduleId]);

  useEffect(() => {
    fetchYouTubeLinks();

    const channel = supabase
      .channel(`yt_links_${moduleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "module_youtube_links", filter: `module_id=eq.${moduleId}` },
        () => fetchYouTubeLinks()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [moduleId, fetchYouTubeLinks]);

  /* -------------------- Quizzes status fetch -------------------- */
  const fetchQuizStatus = useCallback(async () => {
    const { data: pre } = await supabase
      .from("quizzes")
      .select("id,is_published")
      .eq("module_id", moduleId)
      .eq("type", "pre_test")
      .limit(1)
      .maybeSingle();

    const { data: post } = await supabase
      .from("quizzes")
      .select("id,is_published")
      .eq("module_id", moduleId)
      .eq("type", "post_test")
      .limit(1)
      .maybeSingle();

    const { data: quizzesList } = await supabase
      .from("quizzes")
      .select("id")
      .eq("module_id", moduleId)
      .eq("type", "quiz")
      .eq("is_published", true);

    setPrePublished(!!(pre && pre.is_published));
    setPostPublished(!!(post && post.is_published));
    setQuizCount(quizzesList?.length ?? 0);
  }, [moduleId]);

  useEffect(() => {
    fetchQuizStatus();
    const quizChannel = supabase
      .channel(`quizzes_${moduleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quizzes", filter: `module_id=eq.${moduleId}` },
        () => fetchQuizStatus()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(quizChannel);
    };
  }, [moduleId, fetchQuizStatus]);

  /* -------------------- Deletions -------------------- */
  const handleDeleteConfirmed = async () => {
    if (!pendingDelete) return;

    const path = pendingDelete.file_url.includes(`modules/${moduleId}/`)
      ? pendingDelete.file_url
      : `modules/${moduleId}/${pendingDelete.file_url.split("/").pop()}`;

    const { error: storageError } = await supabase.storage.from("melcs-resources").remove([path]);
    if (storageError) {
      console.error("❌ Storage delete error:", storageError.message);
      alert(`Failed to delete file from storage: ${storageError.message}`);
      return;
    }

    const { error: dbError } = await supabase.from("resources").delete().eq("id", pendingDelete.id);
    if (dbError) {
      console.error("❌ DB delete error:", dbError.message);
      alert(`Failed to delete resource row: ${dbError.message}`);
      return;
    }

    setResources(resources.filter((r) => r.id !== pendingDelete.id));
    setPendingDelete(null);
    router.refresh();
  };

  const handleAssignmentDeleteConfirm = async () => {
    if (!pendingDeleteAssignment || deletingAssignment) return;
    setDeletingAssignment(true);
    const assignmentId = pendingDeleteAssignment.id;

    try {
      const folder = `assignments/${assignmentId}`;
      const { data: listing } = await supabase.storage.from("lms-files").list(folder, { limit: 1000 });
      if (listing && listing.length > 0) {
        const paths = listing.map((o) => `${folder}/${o.name}`);
        const { error: rmErr } = await supabase.storage.from("lms-files").remove(paths);
        if (rmErr) {
          console.error("❌ Failed removing storage files:", rmErr.message);
          alert(`Failed removing storage files: ${rmErr.message}`);
          setDeletingAssignment(false);
          return;
        }
      }

      await supabase.from("assignment_submissions").delete().eq("assignment_id", assignmentId);
      await supabase.from("assignment_files").delete().eq("assignment_id", assignmentId);
      const { error: delAssignErr } = await supabase.from("assignments").delete().eq("id", assignmentId);
      if (delAssignErr) {
        console.error("❌ Delete assignment error:", delAssignErr);
        alert(`Failed to delete assignment: ${delAssignErr.message}`);
        setDeletingAssignment(false);
        return;
      }

      setPendingDeleteAssignment(null);
      setAssignmentView(null);
      setDeletingAssignment(false);
      router.refresh();
    } catch (err: any) {
      console.error("❌ delete assignment failed:", err?.message || err);
      alert(err?.message || "Failed to delete assignment. Check RLS and storage path.");
      setDeletingAssignment(false);
    }
  };

  const handleYouTubeDeleteConfirm = async () => {
    if (!pendingDeleteYT) return;
    try {
      const { error } = await supabase.from("module_youtube_links").delete().eq("id", pendingDeleteYT.id);
      if (error) throw error;
      setYtLinks((prev) => prev.filter((l) => l.id !== pendingDeleteYT.id));
      setPendingDeleteYT(null);
      router.refresh();
    } catch (err: any) {
      console.error("❌ Error deleting YouTube link:", err.message);
      alert(`Failed to delete YouTube link: ${err.message}`);
    }
  };

  /* -------------------- Filtering (UI only) -------------------- */
  const qNorm = q.trim().toLowerCase();
  const resFiltered = useMemo(() => {
    if (!qNorm) return resources;
    return resources.filter((r) => {
      const a = (r.file_name || shortName(r.file_url)).toLowerCase();
      return a.includes(qNorm);
    });
  }, [resources, qNorm]);

  const ytFiltered = useMemo(() => {
    if (!qNorm) return ytLinks;
    return ytLinks.filter((v) => {
      const a = (v.title || v.youtube_url).toLowerCase();
      return a.includes(qNorm);
    });
  }, [ytLinks, qNorm]);

  const asgFiltered = useMemo(() => {
    if (!qNorm) return assignments;
    return assignments.filter((a) => {
      const t = (a.name || "").toLowerCase();
      const b = (a.instruction || "").toLowerCase();
      return t.includes(qNorm) || b.includes(qNorm);
    });
  }, [assignments, qNorm]);

  const countFiles = resFiltered.length;
  const countVideos = ytFiltered.length + (youtube_url ? 1 : 0);
  const countAssignments = asgFiltered.length;
  const pills: { key: Tab; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "files", label: "Files", count: countFiles },
    { key: "videos", label: "Videos", count: countVideos },
    { key: "assignments", label: "Assignments", count: countAssignments },
    { key: "quizzes", label: "Quizzes", count: prePublished || postPublished || quizCount ? undefined : undefined },
  ];

  /* -------------------- MOBILE: bottom bar + sheet -------------------- */
  const [mobileOpen, setMobileOpen] = useState(false);
  const openMobileTab = (t: Tab) => {
    setTab(t);
    setMobileOpen(true);
  };

  const closeMobile = () => setMobileOpen(false);

  const MobileToolbarActions = () =>
    role === "teacher" ? (
      <div className="flex items-center gap-1.5">
        {/* Add File */}
        <button
          onClick={onUploadClick}
          className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
          aria-label="Add file"
          type="button"
        >
          <ArrowUpOnSquareIcon className="h-4 w-4" />
        </button>
        {/* Add YouTube */}
        <button
          onClick={onAddYouTubeLinkClick}
          className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
          aria-label="Add YouTube link"
          type="button"
        >
          <PlusCircleIcon className="h-4 w-4" />
        </button>
        {/* Add Assignment */}
        <button
          onClick={onAddAssignmentClick}
          className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
          aria-label="Add assignment"
          type="button"
        >
          <ClipboardDocumentCheckIcon className="h-4 w-4" />
        </button>
        {/* ✅ Add Quiz / Test (new) */}
        <button
          onClick={() => {
            setAssignmentView(null);
            setSelectedFileId(null);
            setSelectedView("ADD_QUIZ");
            closeMobile();
          }}
          className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
          aria-label="Add quiz or test"
          type="button"
        >
          <ClipboardDocumentListIcon className="h-4 w-4" />
        </button>
      </div>
    ) : null;

  const renderMobileSection = () => {
    const showFiles = tab === "all" || tab === "files";
    const showVideos = tab === "all" || tab === "videos";
    const showAssignments = tab === "all" || tab === "assignments";
    const showQuizzes = tab === "all" || tab === "quizzes";

    return (
      <div className="space-y-6">
        {/* FILES */}
        {showFiles && (
          <section aria-labelledby="m-files-head">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="m-files-head" className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Preview Files
              </h3>
              {role === "teacher" && (
                <button
                  onClick={onUploadClick}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 ring-1 ring-sky-700/30"
                  type="button"
                >
                  <ArrowUpOnSquareIcon className="h-4 w-4" />
                  Add
                </button>
              )}
            </div>

            {resFiltered.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500">No files found.</div>
            ) : (
              <ul className="space-y-2">
                {resFiltered.map((res) => {
                  const isActive = selectedFileId === res.id;
                  return (
                    <li key={res.id} className="group flex items-center gap-2">
                      <button
                        className={[
                          "flex-1 min-w-0 text-left px-3 py-2 rounded-xl border transition flex items-center gap-2",
                          isActive ? "bg-slate-100 border-slate-300" : "bg-white hover:bg-slate-50 border-slate-200",
                        ].join(" ")}
                        onClick={() => {
                          setAssignmentView(null);
                          setSelectedView(res.file_url);
                          setSelectedFileId(res.id);
                          closeMobile();
                        }}
                        title={res.file_name || res.file_url}
                        type="button"
                      >
                        <span className="shrink-0">{typeIcon(res.type)}</span>
                        <div className="min-w-0">
                          <div className="truncate text-sm text-slate-800">
                            {res.file_name || shortName(res.file_url)}
                          </div>
                          <div className="text-[11px] text-slate-500">{res.type.toUpperCase()}</div>
                        </div>
                      </button>

                      {role === "teacher" && (
                        <button
                          onClick={() => setPendingDelete(res)}
                          className="p-1 text-rose-600 hover:text-rose-700"
                          title="Delete file"
                          aria-label="Delete file"
                          type="button"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* VIDEOS */}
        {showVideos && (
          <section aria-labelledby="m-videos-head">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="m-videos-head" className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Videos
              </h3>
              {role === "teacher" && (
                <button
                  onClick={onAddYouTubeLinkClick}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 ring-1 ring-indigo-700/30"
                  type="button"
                >
                  <PlusCircleIcon className="h-4 w-4" />
                  Add
                </button>
              )}
            </div>

            {ytFiltered.length > 0 ? (
              <ul className="space-y-2">
                {ytFiltered.map((v) => (
                  <li key={v.id} className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setAssignmentView(null);
                        setSelectedFileId(null);
                        setSelectedView(v.youtube_url);
                        closeMobile();
                      }}
                      className="flex-1 min-w-0 text-left px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 flex items-center gap-2"
                      title={v.youtube_url}
                      type="button"
                    >
                      <VideoCameraIcon className="h-4 w-4 text-red-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-slate-800 truncate">
                          {v.title?.trim() || "YouTube Video"}
                        </div>
                        <div className="text-xs text-slate-500 truncate break-all">{v.youtube_url}</div>
                      </div>
                    </button>

                    {role === "teacher" && (
                      <button
                        onClick={() => setPendingDeleteYT(v)}
                        className="p-1 text-rose-600 hover:text-rose-700"
                        title="Delete YouTube link"
                        aria-label="Delete YouTube link"
                        type="button"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : youtube_url ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAssignmentView(null);
                    setSelectedView(youtube_url);
                    setSelectedFileId(null);
                    closeMobile();
                  }}
                  className="flex-1 min-w-0 text-left px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 flex items-center gap-2"
                  title="Open YouTube Video"
                  type="button"
                >
                  <VideoCameraIcon className="h-4 w-4 text-red-600 shrink-0" />
                  <span className="text-sm text-slate-800 truncate">YouTube Video</span>
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500">No videos yet.</div>
            )}
          </section>
        )}

        {/* ASSIGNMENTS */}
        {showAssignments && (
          <section aria-labelledby="m-assign-head">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="m-assign-head" className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Assignments
              </h3>

              {role === "teacher" && (
                <button
                  onClick={onAddAssignmentClick}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 ring-1 ring-emerald-700/30"
                  title="Add assignment"
                  aria-label="Add assignment"
                  type="button"
                >
                  <ClipboardDocumentCheckIcon className="h-4 w-4" />
                  Add
                </button>
              )}
            </div>

            {asgFiltered.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500">No assignments found.</div>
            ) : (
              <ul className="space-y-2">
                {asgFiltered.map((assignment) => (
                  <li key={assignment.id} className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedView(null);
                        setSelectedFileId(null);
                        setAssignmentView(assignment);
                        closeMobile();
                      }}
                      className="flex-1 min-w-0 text-left text-sm px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 flex items-center gap-2"
                      title="Open assignment"
                      type="button"
                    >
                      <ClipboardDocumentListIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="text-slate-800 truncate">
                        {assignment.name?.trim() ? assignment.name : "(No Title)"}
                      </span>
                    </button>

                    {role === "teacher" && (
                      <button
                        onClick={() => setPendingDeleteAssignment(assignment)}
                        className="p-1 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                        title="Delete assignment"
                        aria-label="Delete assignment"
                        type="button"
                        disabled={deletingAssignment}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* QUIZZES & TESTS */}
        {showQuizzes && (
          <section aria-labelledby="m-quiz-head">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="m-quiz-head" className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Quizzes & Tests
              </h3>
              {role === "teacher" && (
                <button
                  onClick={() => {
                    setAssignmentView(null);
                    setSelectedFileId(null);
                    setSelectedView("ADD_QUIZ");
                    closeMobile();
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-orange-600 text-white hover:bg-orange-700 ring-1 ring-orange-700/30"
                  type="button"
                >
                  <PlusCircleIcon className="h-4 w-4" />
                  Add
                </button>
              )}
            </div>

            <div className="space-y-2">
              {/* Pre-Test */}
              <button
                onClick={() => {
                  setAssignmentView(null);
                  setSelectedFileId(null);
                  setSelectedView("VIEW_PRETEST");
                  closeMobile();
                }}
                className={[
                  "w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm",
                  prePublished ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-slate-50 border-slate-200 opacity-70",
                ].join(" ")}
                type="button"
                title={prePublished ? "Open Pre-Test" : "Pre-Test not published"}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <FlagIcon className="h-4 w-4 text-slate-700 shrink-0" />
                  <span className="truncate text-slate-800">Pre-Test</span>
                </span>
                <span
                  className={[
                    "text-[10px] rounded-full px-2 py-0.5 whitespace-nowrap",
                    prePublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  {prePublished ? "Published" : "Not published"}
                </span>
              </button>

              {/* Quizzes */}
              <button
                onClick={() => {
                  setAssignmentView(null);
                  setSelectedFileId(null);
                  setSelectedView("VIEW_QUIZZES");
                  closeMobile();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 border-slate-200 text-sm"
                type="button"
                title="Open quizzes"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <ClipboardDocumentListIcon className="h-4 w-4 text-slate-700 shrink-0" />
                  <span className="truncate text-slate-800">Quizzes</span>
                </span>
                <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-700 whitespace-nowrap">
                  {quizCount} published
                </span>
              </button>

              {/* Post-Test */}
              <button
                onClick={() => {
                  setAssignmentView(null);
                  setSelectedFileId(null);
                  setSelectedView("VIEW_POSTTEST");
                  closeMobile();
                }}
                className={[
                  "w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm",
                  postPublished ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-slate-50 border-slate-200 opacity-70",
                ].join(" ")}
                type="button"
                title={postPublished ? "Open Post-Test" : "Post-Test not published"}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <FlagIcon className="h-4 w-4 text-slate-700 shrink-0" />
                  <span className="truncate text-slate-800">Post-Test</span>
                </span>
                <span
                  className={[
                    "text-[10px] rounded-full px-2 py-0.5 whitespace-nowrap",
                    postPublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  {postPublished ? "Published" : "Not published"}
                </span>
              </button>
            </div>
          </section>
        )}
      </div>
    );
  };

  /* -------------------- Render -------------------- */
  return (
    <>
      {/* DESKTOP / TABLET: left sidebar */}
      <aside
        className={[
          "hidden md:flex",
          isSidebarOpen ? "w-[320px]" : "w-[72px]",
          "transition-all duration-300 border-r border-slate-200 bg-white",
          "sticky top-0 self-start",
          "h-[100dvh] max-h-[100dvh] min-h-0",
          "flex-col overflow-hidden z-10",
        ].join(" ")}
      >
        {/* Sticky header */}
        <div className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:backdrop-blur px-3 py-3">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
            <button
              className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              onClick={onToggle}
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              type="button"
            >
              {isSidebarOpen ? (
                <ChevronDoubleLeftIcon className="h-5 w-5" />
              ) : (
                <ChevronDoubleRightIcon className="h-5 w-5" />
              )}
            </button>

            {isSidebarOpen && (
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900">Module Sidebar</h2>
                <p className="truncate text-[11px] text-slate-500">• Collapsible • Mobile Drawer • Sticky Header</p>
              </div>
            )}

            {/* spacer */}
            <div />
          </div>

          {/* Toolbar: search + pills (overlap-proof) */}
          {isSidebarOpen && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <label className="min-w-0 relative">
                  <span className="sr-only">Search files, videos, assignments</span>
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search files, videos, assignments…"
                    className="min-w-0 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {pills.map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={[
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ring-1 transition",
                      tab === key
                        ? "bg-slate-900 text-white ring-slate-900"
                        : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
                    ].join(" ")}
                    type="button"
                  >
                    {label}
                    {typeof count === "number" && (
                      <span
                        className={[
                          "rounded-full px-1.5 py-0.5 text-[10px]",
                          tab === key ? "bg-white/20" : "bg-slate-100",
                        ].join(" ")}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 pr-2">
          {/* FILES */}
          {isSidebarOpen && (tab === "all" || tab === "files") && (
            <section aria-labelledby="files-head">
              <div className="mb-2 flex items-center justify-between">
                <h3 id="files-head" className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  Preview Files
                </h3>
                {role === "teacher" && (
                  <button
                    onClick={onUploadClick}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 ring-1 ring-sky-700/30"
                    type="button"
                  >
                    <ArrowUpOnSquareIcon className="h-4 w-4" />
                    Add
                  </button>
                )}
              </div>

              {resFiltered.length === 0 ? (
                <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500">No files found.</div>
              ) : (
                <ul className="space-y-1">
                  {resFiltered.map((res) => {
                    const isActive = selectedFileId === res.id;
                    return (
                      <li key={res.id} className="group flex items-center gap-2">
                        <button
                          className={[
                            "flex-1 min-w-0 text-left px-3 py-2 rounded-xl border transition flex items-center gap-2",
                            isActive ? "bg-slate-100 border-slate-300" : "bg-white hover:bg-slate-50 border-slate-200",
                          ].join(" ")}
                          onClick={() => {
                            setAssignmentView(null);
                            setSelectedView(res.file_url);
                            setSelectedFileId(res.id);
                          }}
                          title={res.file_name || res.file_url}
                          type="button"
                        >
                          <span className="shrink-0">{typeIcon(res.type)}</span>
                          <div className="min-w-0">
                            <div className="truncate text-sm text-slate-800">
                              {res.file_name || shortName(res.file_url)}
                            </div>
                            <div className="text-[11px] text-slate-500">{res.type.toUpperCase()}</div>
                          </div>
                        </button>

                        {role === "teacher" && (
                          <button
                            onClick={() => setPendingDelete(res)}
                            className="p-1 text-rose-600 hover:text-rose-700"
                            title="Delete file"
                            aria-label="Delete file"
                            type="button"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* VIDEOS */}
          {isSidebarOpen && (tab === "all" || tab === "videos") && (
            <section aria-labelledby="videos-head">
              <div className="mb-2 flex items-center justify-between">
                <h3 id="videos-head" className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  Videos
                </h3>
                {role === "teacher" && (
                  <button
                    onClick={onAddYouTubeLinkClick}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 ring-1 ring-indigo-700/30"
                    type="button"
                  >
                    <PlusCircleIcon className="h-4 w-4" />
                    Add
                  </button>
                )}
              </div>

              {ytFiltered.length > 0 ? (
                <ul className="space-y-1">
                  {ytFiltered.map((v) => (
                    <li key={v.id} className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setAssignmentView(null);
                          setSelectedFileId(null);
                          setSelectedView(v.youtube_url);
                        }}
                        className="flex-1 min-w-0 text-left px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 flex items-center gap-2"
                        title={v.youtube_url}
                        type="button"
                      >
                        <VideoCameraIcon className="h-4 w-4 text-red-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm text-slate-800 truncate">
                            {v.title?.trim() || "YouTube Video"}
                          </div>
                          <div className="text-xs text-slate-500 truncate break-all">{v.youtube_url}</div>
                        </div>
                      </button>

                      {role === "teacher" && (
                        <button
                          onClick={() => setPendingDeleteYT(v)}
                          className="p-1 text-rose-600 hover:text-rose-700"
                          title="Delete YouTube link"
                          aria-label="Delete YouTube link"
                          type="button"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : youtube_url ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setAssignmentView(null);
                      setSelectedView(youtube_url);
                      setSelectedFileId(null);
                    }}
                    className="flex-1 min-w-0 text-left px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 flex items-center gap-2"
                    title="Open YouTube Video"
                    type="button"
                  >
                    <VideoCameraIcon className="h-4 w-4 text-red-600 shrink-0" />
                    <span className="text-sm text-slate-800 truncate">YouTube Video</span>
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500">No videos yet.</div>
              )}
            </section>
          )}

          {/* ASSIGNMENTS */}
          {isSidebarOpen && (tab === "all" || tab === "assignments") && (
            <section aria-labelledby="assign-head">
              <div className="mb-2 flex items-center justify-between">
                <h3 id="assign-head" className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  Assignments
                </h3>

                {role === "teacher" && (
                  <button
                    onClick={onAddAssignmentClick}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 ring-1 ring-emerald-700/30"
                    title="Add assignment"
                    aria-label="Add assignment"
                    type="button"
                  >
                    <ClipboardDocumentCheckIcon className="h-4 w-4" />
                    Add
                  </button>
                )}
              </div>

              {asgFiltered.length === 0 ? (
                <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500">No assignments found.</div>
              ) : (
                <ul className="space-y-1">
                  {asgFiltered.map((assignment) => (
                    <li key={assignment.id} className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedView(null);
                          setSelectedFileId(null);
                          setAssignmentView(assignment);
                        }}
                        className="flex-1 min-w-0 text-left text-sm px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 flex items-center gap-2"
                        title="Open assignment"
                        type="button"
                      >
                        <ClipboardDocumentListIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="text-slate-800 truncate">
                          {assignment.name?.trim() ? assignment.name : "(No Title)"}
                        </span>
                      </button>

                      {role === "teacher" && (
                        <button
                          onClick={() => setPendingDeleteAssignment(assignment)}
                          className="p-1 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                          title="Delete assignment"
                          aria-label="Delete assignment"
                          type="button"
                          disabled={deletingAssignment}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* QUIZZES & TESTS (desktop keeps separate Add in Teacher Controls) */}
          {isSidebarOpen && (tab === "all" || tab === "quizzes") && (
            <section aria-labelledby="quiz-head">
              <h3 id="quiz-head" className="mb-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Quizzes & Tests
              </h3>

              <div className="space-y-1">
                {/* Pre-Test */}
                <button
                  onClick={() => {
                    setAssignmentView(null);
                    setSelectedFileId(null);
                    setSelectedView("VIEW_PRETEST");
                  }}
                  className={[
                    "w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm",
                    prePublished ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-slate-50 border-slate-200 opacity-70",
                  ].join(" ")}
                  type="button"
                  title={prePublished ? "Open Pre-Test" : "Pre-Test not published"}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <FlagIcon className="h-4 w-4 text-slate-700 shrink-0" />
                    <span className="truncate text-slate-800">Pre-Test</span>
                  </span>
                  <span
                    className={[
                      "text-[10px] rounded-full px-2 py-0.5 whitespace-nowrap",
                      prePublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                    ].join(" ")}
                  >
                    {prePublished ? "Published" : "Not published"}
                  </span>
                </button>

                {/* Quizzes */}
                <button
                  onClick={() => {
                    setAssignmentView(null);
                    setSelectedFileId(null);
                    setSelectedView("VIEW_QUIZZES");
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 border-slate-200 text-sm"
                  type="button"
                  title="Open quizzes"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <ClipboardDocumentListIcon className="h-4 w-4 text-slate-700 shrink-0" />
                    <span className="truncate text-slate-800">Quizzes</span>
                  </span>
                  <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-700 whitespace-nowrap">
                    {quizCount} published
                  </span>
                </button>

                {/* Post-Test */}
                <button
                  onClick={() => {
                    setAssignmentView(null);
                    setSelectedFileId(null);
                    setSelectedView("VIEW_POSTTEST");
                  }}
                  className={[
                    "w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm",
                    postPublished ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-slate-50 border-slate-200 opacity-70",
                  ].join(" ")}
                  type="button"
                  title={postPublished ? "Open Post-Test" : "Post-Test not published"}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <FlagIcon className="h-4 w-4 text-slate-700 shrink-0" />
                    <span className="truncate text-slate-800">Post-Test</span>
                  </span>
                  <span
                    className={[
                      "text-[10px] rounded-full px-2 py-0.5 whitespace-nowrap",
                      postPublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                    ].join(" ")}
                  >
                    {postPublished ? "Published" : "Not published"}
                  </span>
                </button>
              </div>
            </section>
          )}

          {/* TEACHER CONTROLS */}
          {isSidebarOpen && role === "teacher" && (
            <section className="space-y-2">
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => {
                    setAssignmentView(null);
                    setSelectedFileId(null);
                    setSelectedView("ADD_QUIZ");
                  }}
                  className="w-full bg-orange-600 text-white py-2 rounded-xl text-sm hover:bg-orange-700 flex items-center justify-center"
                  type="button"
                >
                  <PlusCircleIcon className="h-4 w-4 mr-2" />
                  Add Quiz / Test
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Delete modals (desktop still renders here) */}
        {pendingDelete && (
          <DeleteConfirmModal
            fileName={pendingDelete.file_name || "Untitled"}
            onCancel={() => setPendingDelete(null)}
            onConfirm={handleDeleteConfirmed}
          />
        )}
        {pendingDeleteAssignment && (
          <DeleteConfirmModal
            fileName={pendingDeleteAssignment.name || "Assignment"}
            onCancel={() => setPendingDeleteAssignment(null)}
            onConfirm={handleAssignmentDeleteConfirm}
          />
        )}
        {pendingDeleteYT && (
          <DeleteConfirmModal
            fileName={pendingDeleteYT.title || "YouTube Link"}
            onCancel={() => setPendingDeleteYT(null)}
            onConfirm={handleYouTubeDeleteConfirm}
          />
        )}
      </aside>

      {/* MOBILE: fixed bottom navigation bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200"
        role="navigation"
        aria-label="Module shortcuts"
      >
        <div className="grid grid-cols-5 text-xs">
          <button
            type="button"
            onClick={() => openMobileTab("all")}
            className={`flex flex-col items-center gap-1 py-2 ${tab === "all" ? "text-slate-900" : "text-slate-500"}`}
            aria-label="All"
          >
            <SquaresIcon />
            <span>All</span>
          </button>
          <button
            type="button"
            onClick={() => openMobileTab("files")}
            className={`flex flex-col items-center gap-1 py-2 ${tab === "files" ? "text-slate-900" : "text-slate-500"}`}
            aria-label="Files"
          >
            <DocumentTextIcon className="h-5 w-5" />
            <span>Files</span>
          </button>
          <button
            type="button"
            onClick={() => openMobileTab("videos")}
            className={`flex flex-col items-center gap-1 py-2 ${tab === "videos" ? "text-slate-900" : "text-slate-500"}`}
            aria-label="Videos"
          >
            <VideoCameraIcon className="h-5 w-5" />
            <span>Videos</span>
          </button>
          <button
            type="button"
            onClick={() => openMobileTab("assignments")}
            className={`flex flex-col items-center gap-1 py-2 ${
              tab === "assignments" ? "text-slate-900" : "text-slate-500"
            }`}
            aria-label="Assignments"
          >
            <ClipboardDocumentListIcon className="h-5 w-5" />
            <span>Assign</span>
          </button>
          <button
            type="button"
            onClick={() => openMobileTab("quizzes")}
            className={`flex flex-col items-center gap-1 py-2 ${tab === "quizzes" ? "text-slate-900" : "text-slate-500"}`}
            aria-label="Quizzes"
          >
            <FlagIcon className="h-5 w-5" />
            <span>Quizzes</span>
          </button>
        </div>

        {/* safe-area padding */}
        <div className="pb-[calc(env(safe-area-inset-bottom,0px))]" />
      </nav>

      {/* MOBILE: slide-up sheet */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Module navigator"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200"
            role="document"
          >
            {/* Header */}
            <div className="sticky top-0 border-b border-slate-200 bg-white/80 backdrop-blur px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500">Module</div>
                <div className="text-sm font-semibold text-slate-900 capitalize truncate">{tab}</div>
              </div>

              <div className="mx-1 min-w-0 flex-1">
                <label className="relative block">
                  <span className="sr-only">Search</span>
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search…"
                    className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>
              </div>

              <MobileToolbarActions />

              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto p-4 space-y-4">
              {renderMobileSection()}
              <div className="h-2" />
            </div>

            {/* bottom spacer for safe area */}
            <div className="pb-[calc(env(safe-area-inset-bottom,0px)+.5rem)]" />
          </div>

          {/* mobile delete modals */}
          {pendingDelete && (
            <DeleteConfirmModal
              fileName={pendingDelete.file_name || "Untitled"}
              onCancel={() => setPendingDelete(null)}
              onConfirm={handleDeleteConfirmed}
            />
          )}
          {pendingDeleteAssignment && (
            <DeleteConfirmModal
              fileName={pendingDeleteAssignment.name || "Assignment"}
              onCancel={() => setPendingDeleteAssignment(null)}
              onConfirm={handleAssignmentDeleteConfirm}
            />
          )}
          {pendingDeleteYT && (
            <DeleteConfirmModal
              fileName={pendingDeleteYT.title || "YouTube Link"}
              onCancel={() => setPendingDeleteYT(null)}
              onConfirm={handleYouTubeDeleteConfirm}
            />
          )}
        </div>
      )}
    </>
  );
}

/* Small squares icon for "All" */
function SquaresIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}
