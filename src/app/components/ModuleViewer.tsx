"use client";
import React, { useEffect, useRef } from "react";
import {
  FilmIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import YouTubeViewer from "./viewers/YouTubeViewer";
import FileViewer from "./viewers/FileViewer";
import AssignmentViewer, {
  Assignment,
  AssignmentFile,
} from "./viewers/AssignmentViewer";
import AddQuiz from "@/app/components/AddQuiz";
import { supabase } from "@/lib/supabase";

interface Props {
  src: string | null;            // resource url OR "ADD_QUIZ"
  assignment: Assignment | null;
  assignmentFiles: AssignmentFile[];
  moduleId: string;
  resourceId?: string;           // optional optimization
  youtubeLinkId?: string;        // optional optimization
}

const isYouTubeUrl = (url: string) => {
  if (!url) return false;
  const u = url.toLowerCase();
  return (
    u.includes("youtube.com") ||
    u.includes("youtu.be") ||
    u.includes("youtube-nocookie.com")
  );
};

/** Robust extractor that handles:
 * - https://www.youtube.com/watch?v=VIDEOID&...
 * - https://youtu.be/VIDEOID?t=10
 * - https://www.youtube.com/embed/VIDEOID
 * - https://m.youtube.com/watch?v=VIDEOID
 * - https://www.youtube.com/shorts/VIDEOID
 */
const getYouTubeId = (url: string): string | null => {
  try {
    const u = new URL(url);
    // watch?v=ID
    const vParam = u.searchParams.get("v");
    if (vParam && /^[\w-]{10,}$/.test(vParam)) return vParam;

    // youtu.be/ID or /embed/ID or /shorts/ID
    const parts = u.pathname.split("/").filter(Boolean);
    // e.g. ["embed","VIDEOID"] or ["shorts","VIDEOID"] or ["VIDEOID"]
    const maybeId =
      parts[0] === "embed" || parts[0] === "shorts" ? parts[1] : parts[0];

    if (maybeId && /^[\w-]{10,}$/.test(maybeId)) return maybeId;

    return null;
  } catch {
    // fallback regex if URL constructor fails
    const m = url.match(
      /(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([\w-]{10,})/i
    );
    return m ? m[1] : null;
  }
};

export default function ModuleViewer({
  src,
  assignment,
  assignmentFiles,
  moduleId,
  resourceId,
  youtubeLinkId,
}: Props) {
  const Header = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-200">
        {icon}
      </div>
      <h2 className="text-base sm:text-lg font-semibold text-slate-900">
        {title}
      </h2>
    </div>
  );

  // ---- View tracking (files & videos) ----
  const loggedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!src || src === "ADD_QUIZ" || assignment) return;

    const key = `${moduleId}::${src}`;
    if (loggedRef.current.has(key)) return;

    const run = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return;

      const asYouTube = isYouTubeUrl(src);
      const plainUrl = src.split("?")[0];

      try {
        if (asYouTube) {
          // Prefer provided link id
          let linkId = youtubeLinkId ?? null;

          // Resolve by VIDEO ID so stored URL format doesn't matter
          if (!linkId) {
            const vid = getYouTubeId(src);
            if (vid) {
              // Try to find any row in this module whose url contains the ID
              const { data: byId } = await supabase
                .from("module_youtube_links")
                .select("id, youtube_url")
                .eq("module_id", moduleId)
                .ilike("youtube_url", `%${vid}%`)
                .limit(1);
              linkId = byId?.[0]?.id ?? null;

              // Extra fallback: try common canonical forms if still missing
              if (!linkId) {
                const candidates = [
                  plainUrl,
                  `https://www.youtube.com/watch?v=${vid}`,
                  `https://youtube.com/watch?v=${vid}`,
                  `https://m.youtube.com/watch?v=${vid}`,
                  `https://youtu.be/${vid}`,
                  `https://www.youtube.com/embed/${vid}`,
                  `https://www.youtube-nocookie.com/embed/${vid}`,
                ];
                const { data: byEq } = await supabase
                  .from("module_youtube_links")
                  .select("id, youtube_url")
                  .eq("module_id", moduleId)
                  .in("youtube_url", candidates)
                  .limit(1);
                linkId = byEq?.[0]?.id ?? null;
              }
            } else {
              // Very last fallback: exact match on whatever we got
              const { data: byExact } = await supabase
                .from("module_youtube_links")
                .select("id")
                .eq("module_id", moduleId)
                .eq("youtube_url", plainUrl)
                .limit(1);
              linkId = byExact?.[0]?.id ?? null;
            }
          }

          if (!linkId) return; // cannot log without a link row

          await supabase
            .from("module_video_views")
            .upsert(
              { youtube_link_id: linkId, student_id: user.id },
              { onConflict: "youtube_link_id,student_id", ignoreDuplicates: true }
            );
        } else {
          let resId = resourceId ?? null;

          if (!resId) {
            const { data } = await supabase
              .from("resources")
              .select("id, file_url")
              .eq("module_id", moduleId)
              .eq("file_url", plainUrl)
              .limit(1);
            resId = data?.[0]?.id ?? null;

            if (!resId) {
              const basename = plainUrl.split("/").pop();
              if (basename) {
                const { data: d2 } = await supabase
                  .from("resources")
                  .select("id, file_url")
                  .eq("module_id", moduleId)
                  .ilike("file_url", `%${basename}`)
                  .limit(1);
                resId = d2?.[0]?.id ?? null;
              }
            }
          }

          if (!resId) return;

          await supabase
            .from("resource_views")
            .upsert(
              { resource_id: resId, student_id: user.id },
              { onConflict: "resource_id,student_id", ignoreDuplicates: true }
            );
        }

        loggedRef.current.add(key);
      } catch {
        // Silently ignore (e.g., teacher/non-student, RLS mismatch, etc.)
      }
    };

    run();
  }, [src, assignment, moduleId, resourceId, youtubeLinkId]);

  // 1) Assignment
  if (assignment) {
    return (
      <div className="h-full w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Header
          icon={<ClipboardDocumentCheckIcon className="h-5 w-5 text-emerald-600" />}
          title="Assignment"
        />
        <div className="h-[calc(100%-56px)]">
          <AssignmentViewer
            assignment={assignment}
            assignmentFiles={assignmentFiles}
          />
        </div>
      </div>
    );
  }

  // 2) Add Quiz
  if (src === "ADD_QUIZ") {
    return (
      <div className="h-full w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Header
          icon={<ClipboardDocumentCheckIcon className="h-5 w-5 text-orange-600" />}
          title="Add Quiz"
        />
        <div className="h-[calc(100%-56px)] p-4">
          <AddQuiz moduleId={moduleId} />
        </div>
      </div>
    );
  }

  // 3) File / Video
  if (src) {
    const isYT = isYouTubeUrl(src);
    return (
      <div className="h-full w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Header
          icon={
            isYT ? (
              <FilmIcon className="h-5 w-5 text-red-600" />
            ) : (
              <DocumentTextIcon className="h-5 w-5 text-indigo-600" />
            )
          }
          title={isYT ? "Video Preview" : "File Preview"}
        />
        <div className="h-[calc(100%-56px)] p-4">
          <div className="h-full w-full overflow-hidden rounded-xl ring-1 ring-slate-200 bg-white">
            {isYT ? <YouTubeViewer url={src} /> : <FileViewer src={src} />}
          </div>
        </div>
      </div>
    );
  }

  // 4) Empty
  return (
    <div className="h-full w-full rounded-xl border border-dashed border-slate-300 bg-white/70 grid place-items-center">
      <div className="text-center p-10">
        <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200">
          <DocumentTextIcon className="h-6 w-6 text-slate-500" />
        </div>
        <p className="text-slate-600">
          Select a file, video, or assignment from the sidebar to preview.
        </p>
        <p className="text-xs mt-1 text-slate-400">Inline previews are shown here.</p>
      </div>
    </div>
  );
}
