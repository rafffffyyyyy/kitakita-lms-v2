// /src/app/components/AddAssignmentModal.tsx
"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  XMarkIcon,
  DocumentArrowUpIcon,
  ClipboardDocumentCheckIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabase"; // used for auth + debug

interface AddAssignmentModalProps {
  closeModal: () => void;
  moduleId: string;
  onAssignmentAdded: () => void;
}

/* ----------------------------- CONFIG ----------------------------- */
const MAX_MB = 20;
const ALLOWED = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];

/* ----------------------------- HELPERS ---------------------------- */
function fileExt(name: string) {
  const parts = name.split(".");
  return (parts[parts.length - 1] || "").toLowerCase();
}
function slugBase(name: string) {
  const base = name.replace(/\.[^/.]+$/, "");
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}
function uuidLike() {
  return typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2);
}
/** lms-files/assignments/<assignmentId>/<slug>-<uuid>.<ext> (display only) */
function buildAssignmentFilePath(assignmentId: string, file: File) {
  return `assignments/${assignmentId}/${slugBase(file.name)}-${uuidLike()}.${fileExt(file.name)}`;
}

/* --------------------------- COMPONENT --------------------------- */
export default function AddAssignmentModal({
  closeModal,
  moduleId,
  onAssignmentAdded,
}: AddAssignmentModalProps) {
  // required
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [maxScore, setMaxScore] = useState<string>("");

  // optional
  const [maxAttempts, setMaxAttempts] = useState<string>("");
  const [availableFrom, setAvailableFrom] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>("");

  // file & ui
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // debug
  const [debugText, setDebugText] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const dropRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // focus the first input when modal opens (accessibility)
    setTimeout(() => firstInputRef.current?.focus(), 0);
  }, []);

  const canSubmit = useMemo(
    () =>
      !loading &&
      name.trim().length > 0 &&
      instruction.trim().length > 0 &&
      maxScore.trim().length > 0,
    [loading, name, instruction, maxScore]
  );

  const openFilePicker = () => fileInputRef.current?.click();

  const validateFile = (f: File): string | null => {
    const ext = `.${(f.name.split(".").pop() || "").toLowerCase()}`;
    if (!ALLOWED.includes(ext)) {
      return `Unsupported file type. Allowed: ${ALLOWED.join(", ")}`;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      return `File too large. Max ${MAX_MB}MB.`;
    }
    return null;
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0] ?? null;
    if (f) {
      const err = validateFile(f);
      if (err) {
        setError(err);
        setFile(null);
      } else {
        setError(null);
        setFile(f);
      }
    }
    // allow re-selecting the same file
    e.currentTarget.value = "";
  };

  const clearFile = () => setFile(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      setError(err);
      setFile(null);
    } else {
      setError(null);
      setFile(f);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Submit to our REST API (/api/assignments) with rich debug capture
  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    // client-side sanity check for dates
    if (availableFrom && dueAt) {
      const from = new Date(availableFrom);
      const to = new Date(dueAt);
      if (to < from) {
        setError("Due date must be after (or equal to) Available From.");
        return;
      }
    }

    setLoading(true);
    setError(null);
    setShowDebug(false);
    setDebugText(null);
    setProgress(20);

    // who is logged in? (helpful for RLS debug)
    let who: { id?: string | null; email?: string | null } = {};
    let accessToken: string | undefined;
    try {
      const [{ data: userData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
      who = { id: userData.user?.id ?? null, email: (userData.user as any)?.email ?? null };
      accessToken = sessionData.session?.access_token;
    } catch {
      // ignore
    }

    try {
      // Build the multipart form manually
      const form = new FormData();
      form.set("module_id", moduleId);
      form.set("name", name);
      form.set("instruction", instruction);
      form.set("max_score", maxScore);
      if (maxAttempts.trim() !== "") form.set("max_attempts", maxAttempts);
      if (availableFrom) form.set("available_from", availableFrom);
      if (dueAt) form.set("due_at", dueAt);
      if (file) form.append("file", file, file.name);

      // 🔐 Add Bearer token so the API can impersonate the caller
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch("/api/assignments", {
        method: "POST",
        body: form,
        headers,
      });

      setProgress(60);

      const rawText = await res.text();
      let json: any = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch {
        // not JSON; keep raw text
      }

      const debugPayload = {
        endpoint: "/api/assignments",
        status: res.status,
        statusText: res.statusText,
        now: new Date().toISOString(),
        user: who,
        moduleId,
        authHeaderPresent: Boolean(accessToken),
        clientPayloadPreview: {
          name,
          instructionLength: instruction.length,
          maxScore: Number(maxScore),
          maxAttempts: maxAttempts ? Number(maxAttempts) : null,
          availableFrom: availableFrom || null,
          dueAt: dueAt || null,
          file: file ? { name: file.name, size: file.size, type: file.type } : null,
        },
        serverBody: json ?? rawText,
      };
      const dbgString = JSON.stringify(debugPayload, null, 2);
      console.debug("[AddAssignment DEBUG]", debugPayload);
      setDebugText(dbgString);

      if (!res.ok || (json && json.ok === false)) {
        const msg =
          (json && (json.error || json.message)) || rawText || "Failed to add assignment.";
        setShowDebug(true);
        throw new Error(msg);
      }

      setProgress(100);
      onAssignmentAdded();
      closeModal();
    } catch (err: any) {
      const msg = String(err?.message || err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="pointer-events-auto w-full sm:max-w-2xl md:max-w-3xl
             overflow-hidden rounded-xl sm:rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200
             max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)]
             flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-assignment-title"
    >
      {/* Center on desktop, full-height sheet on mobile; allow scrolling */}
      <div className="pointer-events-none flex min-h-dvh w-full items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
        <div
          className={[
            "pointer-events-auto w-full sm:max-w-2xl md:max-w-3xl",
            "rounded-none sm:rounded-2xl bg-white shadow-xl ring-1 ring-slate-200",
            "max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)]",
            "flex flex-col", // to enable sticky header/footer + scrollable body
          ].join(" ")}
        >
          {/* Header (sticky, non-overlapping toolbar grid) */}
          <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
              <h2
                id="add-assignment-title"
                className="min-w-0 truncate flex items-center gap-2 text-base sm:text-lg font-semibold text-slate-900"
              >
                <ClipboardDocumentCheckIcon className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600 shrink-0" />
                Add Assignment
              </h2>

              <button
                onClick={closeModal}
                className="justify-self-end rounded-full p-2 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5 text-slate-600" />
              </button>
            </div>
          </div>

          {/* Body (scrollable) */}
          <form
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
            encType="multipart/form-data"
            noValidate
          >
            <div className="space-y-5">
              {error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {/* Debug panel */}
              {error && debugText && (
                <details
                  open={showDebug}
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                >
                  <summary
                    className="cursor-pointer select-none text-[13px] font-semibold"
                    onClick={() => setShowDebug((s) => !s)}
                  >
                    Debug details
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words">
                    {debugText}
                  </pre>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 hover:bg-white"
                      onClick={() => navigator.clipboard.writeText(debugText)}
                    >
                      Copy debug
                    </button>
                    <span className="text-[11px] text-amber-700">
                      If you see an RLS error, confirm you own the module and the
                      <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">
                        assignments_insert_by_owner
                      </code>
                      policy is in place.
                    </span>
                  </div>
                </details>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Assignment Name <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={firstInputRef}
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                  placeholder="e.g., Argumentative Essay"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Instructions <span className="text-rose-500">*</span>
                </label>
                <textarea
                  name="instruction"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={4}
                  required
                  className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                  placeholder="Describe what students need to do…"
                />
              </div>

              {/* Score + Attempts */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Max Score <span className="text-rose-500">*</span>
                  </label>
                  <input
                    name="max_score"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                    placeholder="100"
                  />
                  <p className="mt-1 text-xs text-slate-500">Total points to grade out of.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Max Attempts (optional)
                  </label>
                  <input
                    name="max_attempts"
                    type="number"
                    min={1}
                    step={1}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                    placeholder="Leave empty = unlimited"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    How many times a student may re-submit.
                  </p>
                </div>
              </div>

              {/* Availability window */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Available From (optional)
                  </label>
                  <input
                    name="available_from"
                    type="datetime-local"
                    value={availableFrom}
                    onChange={(e) => setAvailableFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Due At (optional)
                  </label>
                  <input
                    name="due_at"
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Submissions outside this window are blocked by the database.
                  </p>
                </div>
              </div>

              {/* File Upload (optional) */}
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Attach File (optional)
                </label>

                <div
                  ref={dropRef}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onClick={openFilePicker}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openFilePicker();
                  }}
                  role="button"
                  tabIndex={0}
                  className="mt-2 flex cursor-pointer select-none items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-6 transition hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                >
                  <input
                    ref={fileInputRef}
                    id="file-upload"
                    name="file"
                    type="file"
                    accept={ALLOWED.join(",")}
                    className="sr-only"
                    onChange={handleFilePick}
                  />

                  <div className="flex w-full max-w-md flex-col items-center min-w-0">
                    <DocumentArrowUpIcon className="h-8 w-8 text-slate-500" />
                    <span className="mt-2 truncate text-sm text-slate-600">
                      {file ? file.name : "Click to upload or drag & drop"}
                    </span>
                    <span className="mt-1 text-xs text-slate-400">
                      Allowed: {ALLOWED.join(", ")} • up to {MAX_MB}MB
                    </span>

                    {file && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearFile();
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        <TrashIcon className="h-4 w-4" />
                        Remove file
                      </button>
                    )}
                  </div>
                </div>

                {loading && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full bg-indigo-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer (sticky, non-overlapping) */}
            <div className="sticky bottom-0 mt-6 border-t border-slate-200 bg-white px-0 pt-4">
              <div className="grid grid-cols-1 gap-3 sm:auto-cols-max sm:grid-flow-col">
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full sm:w-auto whitespace-nowrap rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full sm:w-auto whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <ClipboardDocumentCheckIcon className="h-5 w-5" />
                      Add Assignment
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
