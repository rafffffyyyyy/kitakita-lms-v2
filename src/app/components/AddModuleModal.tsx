"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

type ModuleRow = {
  id: string;
  title: string;
  description: string | null;
  quarter_id: string;
  created_at?: string;
  thumbnail_url?: string | null; // <- include cover on the row
};

const MODULE_IMAGE_BUCKET = "module-images"; // keep using your existing bucket

export default function AddModuleModal({
  quarterId,
  onCreated,
  closeModal,
}: {
  quarterId: string;
  onCreated: (row: ModuleRow, imageUrl?: string | null) => void;
  closeModal: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** Upload image and persist its URL directly on modules.thumbnail_url */
  const uploadCoverAndPatchModule = async (moduleId: string): Promise<string | null> => {
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

    const { data: patched, error: patchErr } = await supabase
      .from("modules")
      .update({ thumbnail_url: publicUrl })
      .eq("id", moduleId)
      .select("id, title, description, quarter_id, created_at, thumbnail_url")
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

      const { data: mod, error } = await supabase
        .from("modules")
        .insert({
          quarter_id: quarterId,
          title: title.trim(),
          description: description.trim() || null,
        })
        .select("id, title, description, quarter_id, created_at, thumbnail_url")
        .single();

      if (error) throw error;

      let imageUrl: string | null = null;
      if (mod?.id && file) {
        imageUrl = await uploadCoverAndPatchModule(mod.id);
      }

      onCreated(mod as ModuleRow, imageUrl);
      closeModal();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add module.");
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
              <PlusIcon className="h-5 w-5 text-indigo-600" />
            </span>
            <h3 className="text-base font-semibold text-slate-900">Add Module</h3>
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
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Parts of Speech"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
          />

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Description <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will students learn in this module?"
            className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
          />

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Cover image <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
          />

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
              <PlusIcon className="h-4 w-4" />
              {loading ? "Adding..." : "Add module"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
