// /src/app/components/UploadFileModal.tsx
"use client";

import { useState, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowUpOnSquareIcon,
  XMarkIcon,
  DocumentIcon,
} from "@heroicons/react/24/outline";

/* ----------------------------- CONFIG ----------------------------- */
const STORAGE_BUCKET = "lms-files"; // <- must match your Supabase bucket
const ALLOWED_EXTS = ["pdf", "doc", "docx", "ppt", "pptx", "png", "jpg", "jpeg"];
const MAX_MB = 25;

/* ----------------------------- HELPERS ---------------------------- */
function fileExt(name: string) {
  const p = name.split(".");
  return (p[p.length - 1] || "").toLowerCase();
}
function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function slugBase(name: string) {
  const base = name.replace(/\.[^/.]+$/, "");
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60); // keep short-ish
}
function newUuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
/** path: resources/<moduleId>/<slug>-<uuid>.<ext> */
function buildResourcePath(moduleId: string, fileName: string) {
  const ext = fileExt(fileName);
  return `resources/${moduleId}/${slugBase(fileName)}-${newUuid()}.${ext}`;
}
/** Upload a File and return ONLY the bucket path (DB-safe). */
async function uploadAndReturnPath(bucket: string, path: string, file: File) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    cacheControl: "3600",
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return data?.path ?? path; // store THIS (path-only) to DB
}
/** Map file extension to your "type" column values */
function mapType(ext: string): "pdf" | "word" | "ppt" | "image" | "file" {
  if (ext === "pdf") return "pdf";
  if (ext === "doc" || ext === "docx") return "word";
  if (ext === "ppt" || ext === "pptx") return "ppt";
  if (["png", "jpg", "jpeg"].includes(ext)) return "image";
  return "file";
}

export default function UploadFileModal({
  moduleId,
  closeModal,
  onUploadSuccess,
}: {
  moduleId: string;
  closeModal: () => void;
  onUploadSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [customFileName, setCustomFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ext = useMemo(() => (file ? fileExt(file.name) : ""), [file]);
  const typeForDb = useMemo(() => (file ? mapType(ext) : "file"), [file, ext]);

  const onSelect = (f: File | null) => {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    const e = fileExt(f.name);
    if (!ALLOWED_EXTS.includes(e)) {
      setError(`Unsupported file type. Allowed: ${ALLOWED_EXTS.join(", ")}`);
      setFile(null);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_MB} MB.`);
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      // 1) Build clean storage path (path-only)
      const path = buildResourcePath(moduleId, file.name);

      // 2) Upload to Storage → get path-only back
      const savedPath = await uploadAndReturnPath(STORAGE_BUCKET, path, file);

      // 3) Insert to DB (store PATH ONLY)
      const { error: insertError } = await supabase.from("resources").insert({
        module_id: moduleId,
        file_url: savedPath, // <- path only (no http)
        type: typeForDb,
        file_name: (customFileName || file.name).trim(),
        created_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;

      onUploadSuccess();
      closeModal();
    } catch (err: any) {
      console.error("🚨 Upload failed:", err);
      setError(err?.message || "Error uploading file");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    onSelect(f ?? null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-lg font-semibold">Upload File</h2>
          <button
            onClick={closeModal}
            className="p-1 rounded hover:bg-slate-100"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center"
          >
            <ArrowUpOnSquareIcon className="w-8 h-8 text-slate-500" />
            <div className="text-slate-700">
              Drag & drop your file here or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-medium text-indigo-600 hover:underline"
              >
                browse
              </button>
            </div>
            <div className="text-xs text-slate-500">
              Allowed: {ALLOWED_EXTS.join(", ")} · up to {MAX_MB} MB
            </div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ALLOWED_EXTS.map((e) => "." + e).join(",")}
              onChange={(e) => onSelect(e.target.files?.[0] || null)}
            />
          </div>

          {/* Selected file summary */}
          {file && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border p-3">
              <DocumentIcon className="h-6 w-6 text-slate-500" />
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-800">
                  {file.name}
                </div>
                <div className="text-xs text-slate-500">
                  {ext.toUpperCase()} · {humanSize(file.size)}
                </div>
              </div>
              <button
                className="ml-auto text-xs text-slate-600 hover:text-red-600"
                onClick={() => setFile(null)}
              >
                Remove
              </button>
            </div>
          )}

          {/* Custom display name */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Optional display name
            </label>
            <input
              type="text"
              placeholder="e.g., Module 1 Handout"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={closeModal} className="rounded border px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
