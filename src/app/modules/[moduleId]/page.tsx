// /app/modules/[moduleId]/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

import ModuleSidebar from "@/app/components/ModuleSidebar";
import ModuleHeader from "@/app/components/ModuleHeader";
import ModuleViewer from "@/app/components/ModuleViewer";

import UploadFileModal from "@/app/components/UploadFileModal";
import AddYouTubeLinkModal from "@/app/components/AddYouTubeLinkModal";
import AssignmentView from "@/app/components/AssignmentView";
import { useUser } from "@/app/UserContext";

// QUIZ VIEWERS + BUILDER
import PretestViewer from "@/app/components/viewers/PretestViewer";
import PosttestViewer from "@/app/components/viewers/PosttestViewer";
import QuizViewer from "@/app/components/viewers/QuizViewer";
import AddQuiz from "@/app/components/AddQuiz";

// New add-assignment (inline-capable)
import AddAssignmentModal from "@/app/components/AddAssignmentModal";

// Icons used only by legacy inline form
import {
  ClipboardDocumentCheckIcon,
  DocumentArrowUpIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

/* ----------------------------- Types ----------------------------- */
interface Module {
  id: string;
  title: string;
  description: string;
  youtube_url?: string | null;
}

interface Resource {
  id: string;
  file_url: string;
  type: string;
  file_name?: string;
}

interface Assignment {
  id: string;
  name: string;
  instruction: string;
  module_id?: string;
}

interface AssignmentFile {
  assignment_id: string;
  file_url: string;
}

/* --------------------------- Constants --------------------------- */
const ASSIGN_FILE_ALLOWED = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];
const ASSIGN_FILE_MAX_MB = 20;

/* ----------------------------------------------------------------- */
/* Legacy Inline Add Assignment (left intact; not used by default)   */
/* ----------------------------------------------------------------- */
function AddAssignmentInline({
  moduleId,
  onDone,
  onCancel,
}: {
  moduleId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [maxScore, setMaxScore] = useState<string>("");

  const [maxAttempts, setMaxAttempts] = useState<string>("");
  const [availableFrom, setAvailableFrom] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const canSubmit = !saving && name.trim() && instruction.trim() && maxScore.trim();

  const validateFile = (f: File) => {
    const ext = `.${(f.name.split(".").pop() || "").toLowerCase()}`;
    if (!ASSIGN_FILE_ALLOWED.includes(ext)) {
      return `Unsupported file type. Allowed: ${ASSIGN_FILE_ALLOWED.join(", ")}`;
    }
    if (f.size > ASSIGN_FILE_MAX_MB * 1024 * 1024) {
      return `File too large. Max ${ASSIGN_FILE_MAX_MB}MB.`;
    }
    return null;
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0] ?? null;
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      setError(err);
      setFile(null);
    } else {
      setError(null);
      setFile(f);
    }
    e.currentTarget.value = "";
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (availableFrom && dueAt) {
      const from = new Date(availableFrom);
      const to = new Date(dueAt);
      if (to < from) {
        setError("Due date must be after (or equal to) Available From.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    setProgress(20);
    try {
      const [{ data: _user }, { data: session }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
      const token = session.session?.access_token;

      const form = new FormData();
      form.set("module_id", moduleId);
      form.set("name", name);
      form.set("instruction", instruction);
      form.set("max_score", maxScore);
      if (maxAttempts) form.set("max_attempts", maxAttempts);
      if (availableFrom) form.set("available_from", availableFrom);
      if (dueAt) form.set("due_at", dueAt);
      if (file) form.append("file", file, file.name);

      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/assignments", { method: "POST", body: form, headers });
      setProgress(70);

      const txt = await res.text();
      let json: any = null;
      try {
        json = txt ? JSON.parse(txt) : null;
      } catch {}

      if (!res.ok || (json && json.ok === false)) {
        throw new Error(json?.error || json?.message || txt || "Failed to add assignment.");
      }

      setProgress(100);
      setSuccess("Assignment created successfully.");
      setTimeout(() => onDone(), 900);
    } catch (err: any) {
      setError(err?.message || "Failed to add assignment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      {success && (
        <div className="fixed inset-x-0 top-4 z-40 flex justify-center px-4" aria-live="polite">
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 shadow">
            <CheckCircleIcon className="h-5 w-5" />
            <span className="text-sm font-medium">{success}</span>
          </div>
        </div>
      )}
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Add Assignment</h1>
        <button onClick={onCancel} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50">
          <ArrowUturnLeftIcon className="h-5 w-5" />
          Back
        </button>
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <InformationCircleIcon className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <form onSubmit={submit} noValidate className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Assignment Name <span className="text-rose-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              placeholder="e.g., Argumentative Essay"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Instructions <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              required
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              placeholder="Describe what students need to do…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Max Score <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                placeholder="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Max Attempts (optional)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                placeholder="Leave empty = unlimited"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Available From (optional)</label>
              <input
                type="datetime-local"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Due At (optional)</label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
              <p className="mt-1 text-xs text-slate-500">Submissions outside this window are blocked by the database.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Attach File (optional)</label>
            <div className="mt-2 rounded-lg border-2 border-dashed border-slate-300 p-6">
              <input
                ref={fileInputRef}
                id="assign-file"
                type="file"
                accept={ASSIGN_FILE_ALLOWED.join(",")}
                className="sr-only"
                onChange={onPick}
              />
              <label
                htmlFor="assign-file"
                className="flex cursor-pointer select-none items-center justify-center gap-2 text-sm"
                title="Click to upload or drag & drop"
              >
                <DocumentArrowUpIcon className="h-6 w-6 text-slate-500" />
                <span className="truncate">{file ? file.name : "Click to upload or drag & drop"}</span>
              </label>
              <p className="mt-1 text-xs text-slate-400">
                Allowed: {ASSIGN_FILE_ALLOWED.join(", ")} • up to {ASSIGN_FILE_MAX_MB}MB
              </p>

              {file && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={clearFile}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Remove file
                  </button>
                </div>
              )}
              {saving && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-100">
                  <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:auto-cols-max sm:grid-flow-col">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto whitespace-nowrap rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full sm:w-auto whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ClipboardDocumentCheckIcon className="h-5 w-5" />
              Add Assignment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------- Page ------------------------------ */
export default function ModulePage() {
  const params = useParams();
  const moduleId = Array.isArray(params?.moduleId)
    ? (params.moduleId[0] as string)
    : ((params?.moduleId as string) || "");

  const [module, setModule] = useState<Module | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentFiles, setAssignmentFiles] = useState<AssignmentFile[]>([]);
  const [loading, setLoading] = useState(true);

  // viewer state
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [assignmentView, setAssignmentView] = useState<Assignment | null>(null);

  // inline add-assignment flag
  const [showAddAssignment, setShowAddAssignment] = useState(false);

  // ✅ Missing states added
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAddYTModalOpen, setIsAddYTModalOpen] = useState(false);

  const { role } = useUser(); // reserved

  // fetchers
  const fetchResources = async () => {
    const { data } = await supabase
      .from("resources")
      .select("id, file_url, type, file_name")
      .eq("module_id", moduleId);
    setResources(data ?? []);
  };

  const fetchModuleData = async () => {
    if (!moduleId) return;

    const { data: mod, error: modError } = await supabase
      .from("modules")
      .select("*")
      .eq("id", moduleId)
      .single();

    const { data: assign, error: assignError } = await supabase
      .from("assignments")
      .select("id, name, instruction, module_id")
      .eq("module_id", moduleId)
      .order("created_at", { ascending: false });

    let files: AssignmentFile[] = [];
    let fileError: any = null;
    try {
      const ids = (assign ?? []).map((a) => a.id);
      if (ids.length) {
        const { data: af, error: afErr } = await supabase
          .from("assignment_files")
          .select("assignment_id, file_url")
          .in("assignment_id", ids);
        if (afErr) fileError = afErr;
        files = (af ?? []) as AssignmentFile[];
      } else {
        files = [];
      }
    } catch (e) {
      fileError = e;
      files = [];
    }

    if (modError) console.error("❌ Error fetching module:", modError);
    if (assignError) {
      console.error("❌ Error fetching assignments:", assignError);
      try { console.error("…details:", JSON.stringify(assignError)); } catch {}
    }
    if (fileError) {
      console.error("❌ Error fetching assignment files:", fileError);
      try { console.error("…details:", JSON.stringify(fileError)); } catch {}
    }

    setModule(mod ?? null);
    setAssignments(assign ?? []);
    setAssignmentFiles(files ?? []);
    await fetchResources();
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    setSelectedView(null);
    setAssignmentView(null);
    setSelectedFileId(null);
    setShowAddAssignment(false);
    fetchModuleData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  /* -------------------------- Skeletons --------------------------- */
  const HeaderSkeleton = () => (
    <div className="animate-pulse">
      <div className="h-5 w-36 rounded bg-slate-200/80" />
      <div className="mt-2 h-8 w-64 rounded bg-slate-200/70" />
    </div>
  );

  const ViewerSkeleton = () => (
    <div className="rounded-2xl border bg-white p-4">
      <div className="h-[60vh] rounded-xl bg-slate-100" />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-24 rounded-xl bg-slate-100" />
        <div className="h-24 rounded-xl bg-slate-100" />
      </div>
    </div>
  );

  /* ----------------------------- UI ------------------------------ */
  return (
    <div className="min-h-screen bg-slate-50 flex md:pb-0 pb-[calc(env(safe-area-inset-bottom,0px)+64px)]">
      {/* LEFT: Sidebar */}
      <ModuleSidebar
        isSidebarOpen
        onToggle={() => {}}
        resources={resources}
        selectedFileId={selectedFileId}
        setSelectedView={(v) => {
          setSelectedView(v);
          setAssignmentView(null);
          setShowAddAssignment(false);
        }}
        setSelectedFileId={setSelectedFileId}
        youtube_url={module?.youtube_url ?? undefined}
        // Open the NEW inline view
        onAddAssignmentClick={() => {
          setShowAddAssignment(true);
          setAssignmentView(null);
          setSelectedView(null);
          setSelectedFileId(null);
        }}
        onUploadClick={() => setIsUploadModalOpen(true)}
        moduleId={moduleId}
        setResources={setResources}
        assignments={assignments}
        setAssignmentView={(a) => {
          setAssignmentView(a);
          setSelectedView(null);
          setShowAddAssignment(false);
          setSelectedFileId(null);
        }}
        onAddYouTubeLinkClick={() => setIsAddYTModalOpen(true)}
      />

      {/* RIGHT: Header + Viewer */}
      <div className="flex-1 min-w-0 px-4 md:px-6 lg:pr-8 py-6 flex flex-col gap-6">
        <div className="min-w-0">
          {loading ? <HeaderSkeleton /> : module && <ModuleHeader title={module.title} />}
        </div>

        {/* Main viewer area */}
        <div className="flex-1 min-h-0 min-w-0 mb-20 md:mb-0 overflow-y-auto px-2 sm:px-4">
          {loading ? (
            <ViewerSkeleton />
          ) : showAddAssignment ? (
            // ✅ Centered canvas + internal scrollbar (matches Add Quiz feel)
            <div className="mx-auto w-full max-w-[1200px]">
              <AddAssignmentModal
                inline
                moduleId={moduleId}
                closeModal={() => setShowAddAssignment(false)}
                onAssignmentAdded={() => {
                  setShowAddAssignment(false);
                  fetchModuleData();
                }}
              />
            </div>
          ) : assignmentView ? (
            <AssignmentView assignmentId={assignmentView.id} moduleId={moduleId} onSubmitted={fetchModuleData} />
          ) : selectedView === "VIEW_PRETEST" ? (
            <PretestViewer moduleId={moduleId} />
          ) : selectedView === "VIEW_POSTTEST" ? (
            <PosttestViewer moduleId={moduleId} />
          ) : selectedView === "VIEW_QUIZZES" ? (
            <QuizViewer moduleId={moduleId} />
          ) : selectedView === "ADD_QUIZ" ? (
            <AddQuiz moduleId={moduleId} />
          ) : selectedView === "ADD_ASSIGNMENT" ? (
            // Fallback for any legacy code paths: show the NEW inline add-assignment centered
            <div className="mx-auto w-full max-w-[1200px]">
              <AddAssignmentModal
                inline
                moduleId={moduleId}
                closeModal={() => setSelectedView(null)}
                onAssignmentAdded={() => {
                  setSelectedView(null);
                  fetchModuleData();
                }}
              />
            </div>
          ) : (
            <ModuleViewer
              src={selectedView}
              assignment={null}
              assignmentFiles={assignmentFiles}
              moduleId={moduleId}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {isUploadModalOpen && (
        <UploadFileModal
          moduleId={moduleId}
          closeModal={() => setIsUploadModalOpen(false)}
          onUploadSuccess={fetchResources}
        />
      )}

      {isAddYTModalOpen && (
        <AddYouTubeLinkModal
          open={isAddYTModalOpen}
          onClose={() => setIsAddYTModalOpen(false)}
          moduleId={moduleId}
          onAdded={fetchModuleData}
        />
      )}
    </div>
  );
}
