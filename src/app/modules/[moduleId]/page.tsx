// /app/modules/[moduleId]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// Icons for inline Add Assignment
import {
  ClipboardDocumentCheckIcon,
  DocumentArrowUpIcon,
  XMarkIcon,
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
/* Inline Add Assignment (same payload & endpoint as your modal)     */
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

  const canSubmit =
    !saving && name.trim() && instruction.trim() && maxScore.trim();

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
    // allow re-pick same file
    e.currentTarget.value = "";
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    // date sanity
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
      const [{ data: user }, { data: session }] = await Promise.all([
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
      } catch {
        /* noop */
      }
      if (!res.ok || (json && json.ok === false)) {
        throw new Error(json?.error || json?.message || txt || "Failed to add assignment.");
      }

      setProgress(100);
      setSuccess("Assignment created successfully.");
      // small delay so teacher can see the toast
      setTimeout(() => {
        onDone();
      }, 900);
    } catch (err: any) {
      setError(err?.message || "Failed to add assignment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* success toast */}
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
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
        >
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
              <p className="mt-1 text-xs text-slate-500">
                Submissions outside this window are blocked by the database.
              </p>
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
                <span className="truncate">
                  {file ? file.name : "Click to upload or drag & drop"}
                </span>
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
  // Resolve dynamic route
  const params = useParams();
  const moduleId = Array.isArray(params?.moduleId)
    ? (params.moduleId[0] as string)
    : ((params?.moduleId as string) || "");

  // Data
  const [module, setModule] = useState<Module | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentFiles, setAssignmentFiles] = useState<AssignmentFile[]>([]);
  const [loading, setLoading] = useState(true);

  // Viewer state
  // "VIEW_PRETEST" | "VIEW_POSTTEST" | "VIEW_QUIZZES" | "ADD_QUIZ" | "ADD_ASSIGNMENT" | (file url)
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [assignmentView, setAssignmentView] = useState<Assignment | null>(null);

  // UI
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAddYTModalOpen, setIsAddYTModalOpen] = useState(false);

  const { role } = useUser(); // reserved

  // Fetchers
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
      .eq("module_id", moduleId);

    const { data: files, error: fileError } = await supabase
      .from("assignment_files")
      .select("assignment_id, file_url");

    if (modError) console.error("❌ Error fetching module:", modError);
    if (assignError) console.error("❌ Error fetching assignments:", assignError);
    if (fileError) console.error("❌ Error fetching assignment files:", fileError);

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
    <div className="min-h-screen bg-slate-50 flex">
      {/* LEFT: Sidebar */}
      <ModuleSidebar
        isSidebarOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        resources={resources}
        selectedFileId={selectedFileId}
        setSelectedView={(v) => {
          setSelectedView(v);
          setAssignmentView(null);
        }}
        setSelectedFileId={setSelectedFileId}
        youtube_url={module?.youtube_url ?? undefined}
        // ⬇️ now opens inline builder instead of modal
        onAddAssignmentClick={() => {
          setSelectedView("ADD_ASSIGNMENT");
          setAssignmentView(null);
          setSelectedFileId(null);
        }}
        onUploadClick={() => setIsUploadModalOpen(true)}
        moduleId={moduleId}
        setResources={setResources}
        assignments={assignments}
        setAssignmentView={(a) => {
          setAssignmentView(a);
          setSelectedView(null);
          setSelectedFileId(null);
        }}
        onAddYouTubeLinkClick={() => setIsAddYTModalOpen(true)}
      />

      {/* RIGHT: Header + Inline Viewer */}
      <div className="flex-1 p-6 pr-8 flex flex-col gap-6 min-w-0">
        {/* Header */}
        <div className="min-w-0">
          {loading ? <HeaderSkeleton /> : module && <ModuleHeader title={module.title} />}
        </div>

        {/* Viewer */}
        <div className="flex-1 min-h-[480px] min-w-0">
          {loading ? (
            <ViewerSkeleton />
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
            <AddAssignmentInline
              moduleId={moduleId}
              onDone={() => {
                setSelectedView(null);
                fetchModuleData();
              }}
              onCancel={() => setSelectedView(null)}
            />
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

      {/* ======= ACTION MODALS (kept) ======= */}
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
