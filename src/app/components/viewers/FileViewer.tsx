"use client";
import React, { useMemo, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const BUCKET = "lms-files";

const getOfficeEmbedUrl = (url: string) =>
  `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;

const getGDocsEmbedUrl = (url: string) =>
  `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;

/* ---------- small helpers ---------- */
function stripQuery(u: string) {
  return u.split("#")[0].split("?")[0];
}
function extFromPath(u: string) {
  const p = stripQuery(u).toLowerCase();
  const dot = p.lastIndexOf(".");
  return dot >= 0 ? p.slice(dot + 1) : "";
}
function isImageExt(e: string) {
  return ["png", "jpg", "jpeg", "gif", "webp"].includes(e);
}
function isPdfExt(e: string) {
  return e === "pdf";
}
function isDocExt(e: string) {
  return e === "doc" || e === "docx";
}
function isPptExt(e: string) {
  return e === "ppt" || e === "pptx";
}
function isSpreadsheetExt(e: string) {
  return e === "xls" || e === "xlsx";
}

/** Build the object path inside bucket from a possibly-short src. */
function computeObjectPath(src: string, moduleId?: string | null) {
  // Already a URL? return null to signal "use as-is"
  if (/^https?:\/\//i.test(src)) return null;

  // If caller already passed a bucket path like "resources/<moduleId>/file.ext"
  if (/^resources\//i.test(src)) return src.replace(/^\/+/, "");

  // Otherwise assume it’s a plain filename
  if (!moduleId) return src.replace(/^\/+/, ""); // last resort (no moduleId)
  return `resources/${moduleId}/${src.replace(/^\/+/, "")}`;
}

function buildPublicUrl(objectPath: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

/** Detect mobile: user agent OR narrow viewport. */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    const initial =
      /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua) ||
      (typeof window !== "undefined" && window.innerWidth < 768);
    setIsMobile(initial);

    const onResize = () => {
      if (typeof window !== "undefined") {
        setIsMobile(window.innerWidth < 768);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

export default function FileViewer({
  src,
  moduleId,
}: {
  src: string;
  /** Provide the moduleId so short filenames can be resolved to resources/<moduleId>/... */
  moduleId?: string | null;
}) {
  const isMobile = useIsMobile();

  // 1) Decide if src is a URL or an object path we need to resolve
  const objectPath = useMemo(() => computeObjectPath(src, moduleId), [src, moduleId]);

  // 2) Resolve to a fetchable URL (signed URL if private; otherwise public URL)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // case: full URL provided
      if (!objectPath) {
        if (!cancelled) setResolvedUrl(src);
        return;
      }

      // Try signed URL (works even if bucket is private)
      const { data, error } = await supabase
        .storage
        .from(BUCKET)
        .createSignedUrl(objectPath, 60 * 60 * 6); // 6 hours

      if (!cancelled) {
        if (!error && data?.signedUrl) {
          setResolvedUrl(data.signedUrl);
        } else {
          // Fallback to public URL (works when bucket is public)
          setResolvedUrl(buildPublicUrl(objectPath));
        }
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [objectPath, src]);

  // 3) Determine file type from the path WITHOUT query params (important!)
  const typeProbePath = objectPath ?? src;
  const ext = useMemo(() => extFromPath(typeProbePath), [typeProbePath]);

  if (!resolvedUrl) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Loading preview…
      </div>
    );
  }

  /* ---------- Render by type (with mobile-friendly paths) ---------- */

  // Images → native <img>
  if (isImageExt(ext)) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <img
          src={resolvedUrl}
          alt="Preview"
          className="max-h-full max-w-full object-contain rounded"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  // PDFs:
  // - Desktop: show inline PDF
  // - Mobile: use Google Docs Viewer (more reliable on Android/iOS)
  if (isPdfExt(ext)) {
    const srcForFrame = isMobile ? getGDocsEmbedUrl(resolvedUrl) : resolvedUrl;
    return (
      <iframe
        title="PDF preview"
        src={srcForFrame}
        className="w-full h-full rounded border"
        allow="fullscreen"
      />
    );
  }

  // Office docs (Word/PowerPoint/Excel):
  // - Desktop: Office viewer is fine
  // - Mobile: Use Google Docs Viewer (Office viewer often fails on Android)
  if (isDocExt(ext) || isPptExt(ext) || isSpreadsheetExt(ext)) {
    const srcForFrame = isMobile
      ? getGDocsEmbedUrl(resolvedUrl)
      : getOfficeEmbedUrl(resolvedUrl);
    return (
      <iframe
        title="Document preview"
        src={srcForFrame}
        className="w-full h-full rounded border"
        allow="fullscreen"
      />
    );
  }

  // Fallback: offer to open in a new tab
  return (
    <div className="flex flex-col items-center justify-center h-full bg-white p-6 rounded">
      <p className="text-slate-600 mb-3">This file type cannot be previewed inline.</p>
      <a
        href={resolvedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
      >
        Open in New Tab
      </a>
    </div>
  );
}
