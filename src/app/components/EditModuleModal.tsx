"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PencilSquareIcon, XMarkIcon } from "@heroicons/react/24/outline";

type ModuleRow = {
  id: string;
  title: string;
  description: string | null;
  quarter_id: string;
  thumbnail_url?: string | null; // include to keep typing consistent
};

const MODULE_IMAGE_BUCKET = "module-images";

export default function EditModuleModal({
  quarterId,
  moduleId,
  initialTitle,
  initialDescription,
  currentImageUrl, // may be null
  onUpdated,
  onDeleteImageInState,
  closeModal,
}: {
  quarterId: string;
  moduleId: string;
  initialTitle: string;
  initialDescription: string | null;
  currentImageUrl: string | null;
  onUpdated: (row: ModuleRow, newImageUrl?: string | null) => void;
  onDeleteImageInState: () => void;
  closeModal: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** Upload new image and save it on modules.thumbnail_url (not resources) */
  const uploadNewImage = async (): Promise<string | null> => {
    if (!file) return null;

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${quarterId}/${moduleId}-${Date.now()}.${ext}`;

    const up = await supabase.storage
      .from(MODULE_IMAGE_BUCKET)
      .upload(path, file, {
        upsert: true,
        cacheControl: "3600",
        contentType: file.type || undefined,
      });

    if (up.error) throw up.error;

    const { data: pub } = supabase.storage.from(MODULE_IMAGE_BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // Persist on the module
    const { data: patched, error: patchErr } = await supabase
      .from("modules")
      .update({ thumbnail_url: publicUrl })
      .eq("id", moduleId)
      .select("id, title, description, quarter_id, thumbnail_url")
      .single();

    if (patchErr) throw patchErr;

    return (patched?.thumbnail_url as string) ?? publicUrl;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setErr(null);
    if (!title.trim()) {
      setErr("Module name is required.");
      return;
    }
    if (file && !file.type.startsWith("image/")) {
      setErr("Please choose an image file.");
      return;
    }

    try {
      setLoading(true);

      // Update text fields
      const { data: mod, error } = await supabase
        .from("modules")
        .update({
          title: title.trim(),
          description: description.trim() || null,
        })
        .eq("id", moduleId)
        .select("id, title, description, quarter_id, thumbnail_url")
        .single();

      if (error) throw error;

      // Replace image if new file provided
      let newImageUrl: string | null = null;
      if (file) {
        newImageUrl = await uploadNewImage();
        if (currentImageUrl) onDeleteImageInState(); // clear local cached value
      }

      onUpdated(mod as ModuleRow, newImageUrl);
      closeModal();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update module.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/10">
              <PencilSquareIcon className="h-5 w-5 text-indigo-600" />
            </span>
            <h3 className="text-base font-semibold text-slate-900">Edit Module</h3>
          </div>
          <button
            onClick={closeModal}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-4">
          <label className="block text-sm font-medium text-slate-700">
            Module name <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
          />

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Description <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
          />

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">
                Replace image <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              {currentImageUrl && (
                <a
                  href={currentImageUrl}
                  target="_blank"
                  className="text-xs text-indigo-600 hover:underline"
                >
                  View current
                </a>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
            />
          </div>

          {err && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {err}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <PencilSquareIcon className="h-4 w-4" />
              {loading ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
