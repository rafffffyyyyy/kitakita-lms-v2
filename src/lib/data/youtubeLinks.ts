// /src/lib/data/youtubeLinks.ts
import { supabase } from "@/lib/supabase";

export interface ModuleYouTubeLink {
  id: string;
  module_id: string;
  title: string | null;
  youtube_url: string;
  order_index: number;
  created_at: string;
}

/**
 * Accept PromiseLike (thenable) so Supabase PostgrestFilterBuilder type works.
 */
function withTimeout<T>(p: PromiseLike<T>, ms = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Request timed out. Please check your connection.")), ms);
    Promise.resolve(p)
      .then(resolve, reject)
      .finally(() => clearTimeout(t));
  });
}

export async function fetchModuleYouTubeLinks(moduleId: string) {
  const { data, error } = await withTimeout(
    supabase
      .from("module_youtube_links")
      .select("*")
      .eq("module_id", moduleId)
      .order("order_index", { ascending: true })
  );

  if (error) throw new Error(`Fetch links failed: ${error.message}`);
  return (data ?? []) as ModuleYouTubeLink[];
}

/**
 * IMPORTANT:
 * We do NOT call .select() after insert to avoid RLS-select issues that can look like a hang.
 */
export async function addModuleYouTubeLink(params: {
  moduleId: string;
  youtubeUrl: string;
  title?: string;
  orderIndex?: number;
}) {
  const { moduleId, youtubeUrl, title, orderIndex } = params;
  if (!moduleId) throw new Error("Missing moduleId.");
  if (!youtubeUrl) throw new Error("YouTube URL is required.");

  const { error } = await withTimeout(
    supabase.from("module_youtube_links").insert([
      {
        module_id: moduleId,
        youtube_url: youtubeUrl,
        title: title ?? null,
        order_index: orderIndex ?? 1,
      },
    ])
  );

  if (error) throw new Error(`Insert failed: ${error.message}`);
  // If you need the row content, call fetchModuleYouTubeLinks(moduleId) after this.
  return true;
}

export async function deleteModuleYouTubeLink(id: string) {
  const { error } = await withTimeout(
    supabase.from("module_youtube_links").delete().eq("id", id)
  );
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

export async function updateModuleYouTubeLinkOrder(id: string, orderIndex: number) {
  const { error } = await withTimeout(
    supabase.from("module_youtube_links").update({ order_index: orderIndex }).eq("id", id)
  );
  if (error) throw new Error(`Reorder failed: ${error.message}`);
}
