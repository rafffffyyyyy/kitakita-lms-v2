"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";

const MODULE_IMAGE_BUCKET = "module-images"; // <-- change if needed

export default function DeleteModuleModal({
  moduleId,
  moduleTitle,
  imageUrl, // may be null
  onDeleted,
  closeModal,
}: {
  moduleId: string;
  moduleTitle: string;
  imageUrl: string | null;
  onDeleted: () => void;
  closeModal: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const deleteImageIfAny = async () => {
    if (!imageUrl) return;
    // Try to delete resource row(s)
    await supabase.from("resources").delete().eq("module_id", moduleId).eq("type", "image");

    // Optionally delete the file in storage.
    // We don't know the exact path from public URL, so you can leave the file
    // or, if you store path in DB too, delete by path. For now we skip storage delete.
  };

  const onConfirm = async () => {
    if (loading) return;
    setErr(null);

    try {
      setLoading(true);
      await deleteImageIfAny();

      const { error } = await supabase.from("modules").delete().eq("id", moduleId);
      if (error) throw error;

      onDeleted();
      closeModal();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete module.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600/10">
              <TrashIcon className="h-5 w-5 text-rose-600" />
            </span>
            <h3 className="text-base font-semibold text-slate-900">Delete Module</h3>
          </div>
          <button
            onClick={closeModal}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 text-sm text-slate-700">
          <p>
            Are you sure you want to delete <span className="font-semibold">{moduleTitle}</span>?
            This action cannot be undone.
          </p>
          {err && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              {err}
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={closeModal}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
            >
              <TrashIcon className="h-4 w-4" />
              {loading ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
