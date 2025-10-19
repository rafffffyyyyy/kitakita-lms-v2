"use client";

import { useMemo, useState } from "react";
import { addModuleYouTubeLink } from "@/lib/data/youtubeLinks";
import {
  XMarkIcon,
  LinkIcon,
  PlusCircleIcon,
  InformationCircleIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";

interface Props {
  open: boolean;
  onClose: () => void;
  moduleId: string;
  onAdded: () => void; // refresh in parent
}

const isValidYouTubeUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.length > 1;
    if (host === "youtube.com") {
      return (
        u.pathname.startsWith("/watch") && !!u.searchParams.get("v")
      ) || u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/");
    }
    return false;
  } catch {
    return false;
  }
};

export default function AddYouTubeLinkModal({ open, onClose, moduleId, onAdded }: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const urlOk = useMemo(() => isValidYouTubeUrl(url.trim()), [url]);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlOk) return;

    setSaving(true);
    setErr(null);
    setOk(false);

    try {
      await addModuleYouTubeLink({
        moduleId,
        youtubeUrl: url.trim(),
        title: title.trim() || undefined,
      });
      setOk(true);
      onAdded();
      // small delay so users can see the success state
      setTimeout(() => {
        setOk(false);
        onClose();
        setUrl("");
        setTitle("");
      }, 450);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add link.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4
                 bg-slate-900/30 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Add YouTube Link"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 ring-1 ring-indigo-200">
            <PlusCircleIcon className="h-5 w-5 text-indigo-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Add YouTube Link</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto inline-flex items-center rounded-lg px-2 py-1.5
                       text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-5">
          {/* Tips */}
          <div className="flex items-start gap-2 text-sm text-slate-600">
            <InformationCircleIcon className="h-5 w-5 mt-0.5 text-slate-400" />
            <p>
              Paste a YouTube URL like{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">https://youtube.com/watch?v=…</code>{" "}
              or{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">https://youtu.be/…</code>.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., Introduction to Context Clues"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">YouTube URL</label>
            <div className="flex items-center gap-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 border border-slate-200">
                <LinkIcon className="h-5 w-5 text-slate-600" />
              </div>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={`flex-1 rounded-lg border px-3 py-2 focus:outline-none focus:ring-2
                            ${url.length === 0
                              ? "border-slate-300 focus:ring-indigo-500"
                              : urlOk
                                ? "border-emerald-400 focus:ring-emerald-500"
                                : "border-rose-300 focus:ring-rose-500"}`}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
            {url.length > 0 && !urlOk && (
              <p className="mt-1 text-sm text-rose-600">This doesn’t look like a valid YouTube link.</p>
            )}
          </div>

          {err && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          )}

          {ok && !err && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 inline-flex items-center gap-2">
              <CheckBadgeIcon className="h-5 w-5" />
              Saved!
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !urlOk}
              className="rounded-lg px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Add Link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
