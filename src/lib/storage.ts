// src/lib/storage.ts
import { supabase } from "@/lib/supabase";
import { STORAGE_BUCKET } from "./constants";

export function fileExt(name: string) {
  const p = name.split(".");
  return (p[p.length - 1] || "").toLowerCase();
}

export function slugBase(name: string) {
  const base = name.replace(/\.[^/.]+$/, "");
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

export function newUuid() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export const buildPaths = {
  // You’ll need the submission one now; the others are for UploadFileModal, etc.
  submission(assignmentId: string, userId: string, fileName: string) {
    // e.g. submissions/<assignmentId>/<userId>/<uuid>.<ext>
    return `submissions/${assignmentId}/${userId}/${newUuid()}.${fileExt(fileName)}`;
  },
  resource(moduleId: string, fileName: string) {
    return `resources/${moduleId}/${slugBase(fileName)}-${newUuid()}.${fileExt(fileName)}`;
  },
  assignmentFile(assignmentId: string, fileName: string) {
    return `assignments/${assignmentId}/${slugBase(fileName)}-${newUuid()}.${fileExt(fileName)}`;
  },
};

export async function uploadAndReturnPath(path: string, file: File) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false, cacheControl: "3600", contentType: file.type || undefined });
  if (error) throw error;
  return data?.path ?? path; // <- save this to DB (path-only)
}

export async function toViewUrl(bucketPath: string, expiresSeconds = 3600) {
  // Private bucket: signed URL. If bucket is public, fallback public URL works.
  const { data, error } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(bucketPath, expiresSeconds);
  if (!error && data?.signedUrl) return data.signedUrl;

  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(bucketPath).data.publicUrl;
}
