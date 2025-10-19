"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  /** Supabase storage path (e.g. "submissions/uid/file.docx") OR a full https URL */
  filePathOrUrl: string | null;
  /** Optional bucket override when you pass a storage path; default "lms-files" */
  bucket?: string;
  /** Optional fixed height for iframe-based viewers */
  frameHeightClass?: string; // e.g. "h-[70vh]"
};

const DEFAULT_BUCKET = "lms-files";
const isHttp = (u: string) => /^https?:\/\//i.test(u);

/** Try to extract bucket & path from a Supabase *public* URL */
function parseSupabasePublicUrl(url: string): { bucket: string; path: string } | null {
  // https://xyz.supabase.co/storage/v1/object/public/<bucket>/<path...>
  const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i);
  if (!m) return null;
  return { bucket: m[1], path: m[2] };
}

/** Best-effort extension from URL or path (strip query/hash first) */
function guessExt(s?: string | null) {
  if (!s) return "";
  const clean = s.split("?")[0].split("#")[0];
  const parts = clean.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export default function AssignmentInlineViewer({
  filePathOrUrl,
  bucket = DEFAULT_BUCKET,
  frameHeightClass = "h-[70vh]",
}: Props) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [ext, setExt] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setErr(null);
      setResolvedUrl(null);
      setExt("");

      if (!filePathOrUrl) return;

      // Public URL cases
      if (isHttp(filePathOrUrl)) {
        setResolvedUrl(filePathOrUrl);
        setExt(guessExt(filePathOrUrl));
        return;
      }

      // Storage path cases: sign it
      try {
        setLoading(true);

        // Allow callers to accidentally pass a *public* URL string here
        const parsed = parseSupabasePublicUrl(filePathOrUrl);
        if (parsed) {
          setResolvedUrl(filePathOrUrl);
          setExt(guessExt(parsed.path));
          return;
        }

        // Otherwise it's a plain storage path within a bucket
        const { data, error } = await supabase
          .storage
          .from(bucket)
          .createSignedUrl(filePathOrUrl, 60 * 60); // 1 hour

        if (cancelled) return;

        if (error || !data?.signedUrl) {
          // Fallback to public URL (works if bucket is public)
          const pub = supabase.storage.from(bucket).getPublicUrl(filePathOrUrl);
          if (pub.data.publicUrl) {
            setResolvedUrl(pub.data.publicUrl);
            setExt(guessExt(filePathOrUrl));
          } else {
            setErr("Unable to generate a public view URL for this file.");
          }
        } else {
          setResolvedUrl(data.signedUrl);
          setExt(guessExt(filePathOrUrl));
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Viewer error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [filePathOrUrl, bucket]);

  if (!filePathOrUrl) {
    return <div className="text-sm text-neutral-600">No file attached.</div>;
  }

  if (loading) {
    return <div className="animate-pulse bg-neutral-100 rounded-xl w-full h-[60vh]" />;
  }

  if (!resolvedUrl) {
    return (
      <div className="bg-neutral-50 p-3 rounded-xl text-sm text-neutral-700">
        {err ? `${err} ` : "Preview not available. "}
        <span className="block">
          <a href="#" onClick={(e) => e.preventDefault()} className="text-blue-600 underline">Download file</a>
        </span>
      </div>
    );
  }

  // Decide renderer
  const isImage = /^(png|jpe?g|gif|webp|bmp|svg)$/.test(ext);
  const isPdf = ext === "pdf";
  const isVideo = /^(mp4|webm|ogg)$/.test(ext);
  const isAudio = /^(mp3|wav|m4a|ogg)$/.test(ext);
  const isOffice = /^(doc|docx|ppt|pptx|xls|xlsx)$/.test(ext);
  const isText = ext === "txt";

  if (isImage) {
    return <img src={resolvedUrl} alt="Submission" className="block w-full h-auto rounded-xl" loading="lazy" />;
  }
  if (isPdf) {
    return <iframe title="PDF" src={resolvedUrl} className={`block w-full ${frameHeightClass}`} />;
  }
  if (isVideo) {
    return (
      <video controls className="block w-full rounded-xl">
        <source src={resolvedUrl} />
        Your browser does not support video playback.
      </video>
    );
  }
  if (isAudio) {
    return (
      <div className="bg-neutral-50 p-3 rounded-xl">
        <audio controls className="w-full">
          <source src={resolvedUrl} />
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }
  if (isOffice) {
    const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(resolvedUrl)}`;
    return <iframe title="Document" src={officeUrl} className={`block w-full ${frameHeightClass}`} allowFullScreen />;
  }
  if (isText) {
    return <iframe title="Text" src={resolvedUrl} className={`block w-full ${frameHeightClass}`} />;
  }

  // Last-resort generic iframe (may render PDFs/images hosted with unknown ext)
  return (
    <div className="bg-neutral-50 rounded-xl">
      <iframe title="Preview" src={resolvedUrl} className={`block w-full ${frameHeightClass}`} />
      <div className="p-2 text-xs text-neutral-600">
        If the preview doesn’t load,{" "}
        <a href={resolvedUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
          open in a new tab
        </a>.
      </div>
    </div>
  );
}
