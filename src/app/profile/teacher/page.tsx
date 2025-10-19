// File: /src/app/profile/teacher/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import BackButton from "../.././components/BackButton";
import {
  ArrowUpTrayIcon,
  CameraIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  UserCircleIcon,
  XMarkIcon,
  EyeIcon,
  EyeSlashIcon,
  EnvelopeIcon,
  LinkIcon,
  ClipboardIcon,
} from "@heroicons/react/24/outline";

const AVATAR_BUCKET = "teacher-avatars"; // dedicated bucket for teachers

type ProfileRow = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_picture_url: string | null;
};

export default function TeacherProfile() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  // avatar upload state
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loadingUpload, setLoadingUpload] = useState(false);

  // password change state
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });
  const [loadingPass, setLoadingPass] = useState(false);

  // toast
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const flash = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  };

  // ---------- Fetch profile from profiles using auth.uid() ----------
  useEffect(() => {
    (async () => {
      const { data: authRes, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        flash("error", authErr.message);
        return;
      }
      const user = authRes?.user ?? null;
      if (!user) return;
      setUid(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, middle_name, last_name, email, profile_picture_url")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        flash("error", error.message);
        return;
      }
      setProfile((data as ProfileRow) ?? null);
    })();
  }, []);

  // ---------- Helpers ----------
  const displayName = useMemo(() => {
    if (!profile) return "Teacher";
    const name = [profile.first_name, profile.middle_name, profile.last_name]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return name || "Teacher";
  }, [profile]);

  // Shareable “Profile Link” (not stored)
  const profileLink = useMemo(() => {
    if (!uid) return "";
    // change to any route you’ll expose later (kept stable if you implement /teacher/[id])
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return origin ? `${origin}/teacher/${uid}` : `/teacher/${uid}`;
  }, [uid]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      flash("success", "Copied to clipboard.");
    } catch {
      flash("error", "Copy failed. Please copy manually.");
    }
  };

  // ---------- Avatar handling ----------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const clearSelectedImage = () => {
    setImage(null);
    setPreview(null);
  };

  const uploadPhoto = async () => {
    if (!image || !uid) return;
    try {
      setLoadingUpload(true);
      const ext = image.name.split(".").pop() || "png";
      const filePath = `${uid}/avatar_${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(filePath, image, {
        upsert: true, // requires UPDATE policy on storage.objects
      });
      if (upErr) throw upErr;

      // public URL + cache-bust
      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ profile_picture_url: publicUrl })
        .eq("id", uid);
      if (updErr) throw updErr;

      setProfile((p) => (p ? { ...p, profile_picture_url: publicUrl } : p));
      flash("success", "Profile picture updated!");
      setShowUploadModal(false);
      clearSelectedImage();
    } catch (e: any) {
      console.error("uploadPhoto error:", e);
      flash("error", e?.message || "Failed to upload photo. Check bucket & policies.");
    } finally {
      setLoadingUpload(false);
    }
  };

  // ---------- Password change ----------
  const handlePasswordChange = async () => {
    if (!passwords.new || !passwords.confirm) {
      flash("error", "Please enter the new password and confirmation.");
      return;
    }
    if (passwords.new !== passwords.confirm) {
      flash("error", "Passwords do not match.");
      return;
    }
    setLoadingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwords.new });
      if (error) throw error;

      setPasswords({ current: "", new: "", confirm: "" });
      flash("success", "Password changed successfully!");
    } catch (e: any) {
      console.error("updateUser error:", e);
      flash("error", e?.message || "Failed to change password. Please re-login and try again.");
    } finally {
      setLoadingPass(false);
    }
  };

  if (!profile) {
    return (
      <div className="min-h-[70vh] grid place-items-center bg-gradient-to-b from-slate-50 to-white">
        <div className="animate-pulse text-slate-500">Loading profile…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Floating toast (top-right) */}
      {message && (
        <Toast
          type={message.type}
          onClose={() => setMessage(null)}
          ariaLive="polite"
        >
          {message.text}
        </Toast>
      )}

      {/* Page header */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="ml-2 flex items-center gap-2">
            <UserCircleIcon className="h-6 w-6 text-slate-700" />
            <h1 className="text-lg font-semibold text-slate-800">Teacher Profile</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT: avatar + quick facts */}
          <aside className="lg:col-span-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="h-36 w-36 rounded-2xl ring-1 ring-slate-200 overflow-hidden bg-slate-100">
                    {preview || profile.profile_picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={preview || profile.profile_picture_url!}
                        alt="Profile"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-slate-400">
                        <UserCircleIcon className="h-16 w-16" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="group absolute -bottom-2 -right-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
                  >
                    <CameraIcon className="h-4 w-4" />
                    Change
                  </button>
                </div>

                <div className="mt-5 w-full grid grid-cols-1 gap-3 text-sm">
                  {/* Email row */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200 min-w-0">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <EnvelopeIcon className="h-5 w-5" />
                      Email
                    </span>
                    <span className="font-medium text-slate-900 truncate max-w-[55%]">
                      {profile.email ?? "—"}
                    </span>
                  </div>

                  {/* Profile Link row (copyable) */}
                  <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2 text-slate-600">
                        <LinkIcon className="h-5 w-5" />
                        <span>Profile link</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copy(profileLink)}
                        className="whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100"
                        title="Copy link"
                      >
                        <span className="inline-flex items-center gap-1">
                          <ClipboardIcon className="h-4 w-4" />
                          Copy
                        </span>
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 truncate" title={profileLink}>
                      {profileLink || "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* RIGHT: details + password */}
          <section className="lg:col-span-2 space-y-6">
            {/* Read-only details */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-800">Personal Information</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="First Name" value={profile.first_name ?? ""} />
                <Field label="Last Name" value={profile.last_name ?? ""} />
                <Field label="Middle Name" value={profile.middle_name ?? ""} />
                <Field label="Email" value={profile.email ?? ""} />
                <Field label="Role" value="Teacher" />
              </div>
            </div>

            {/* Password */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <KeyIcon className="h-5 w-5 text-slate-600" />
                <h2 className="text-base font-semibold text-slate-800">Change Password</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {(["current", "new", "confirm"] as const).map((field) => (
                  <div key={field} className="relative min-w-0">
                    <input
                      type={showPassword[field] ? "text" : "password"}
                      placeholder={
                        field === "current"
                          ? "Current Password"
                          : field === "new"
                          ? "New Password"
                          : "Confirm Password"
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      value={passwords[field]}
                      onChange={(e) => setPasswords({ ...passwords, [field]: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => ({ ...s, [field]: !s[field] }))}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-700"
                      aria-label={showPassword[field] ? "Hide password" : "Show password"}
                    >
                      {showPassword[field] ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <button
                  onClick={handlePasswordChange}
                  disabled={loadingPass}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                >
                  <KeyIcon className="h-4 w-4" />
                  {loadingPass ? "Updating…" : "Change Password"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Upload Profile Picture</h3>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  clearSelectedImage();
                }}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview || profile.profile_picture_url || "/default-avatar.png"}
                  className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200"
                  alt="Preview"
                />
                <div className="flex-1 min-w-0">
                  <input id="file" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  <label
                    htmlFor="file"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowUpTrayIcon className="h-4 w-4" />
                    Choose image
                  </label>
                  {preview && (
                    <button
                      onClick={clearSelectedImage}
                      className="ml-3 inline-flex items-center rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      <XMarkIcon className="mr-1 h-4 w-4" />
                      Reset
                    </button>
                  )}
                  <p className="mt-2 text-xs text-slate-500">PNG or JPG. Square images look best (≥ 256×256).</p>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    clearSelectedImage();
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={uploadPhoto}
                  disabled={!image || loadingUpload}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  <CameraIcon className="h-4 w-4" />
                  {loadingUpload ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small reusable read-only field */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="text"
        value={value}
        disabled
        readOnly
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-100"
      />
    </label>
  );
}

/** Minimal toast – fixed, non-overlapping, accessible */
function Toast({
  type,
  children,
  onClose,
  ariaLive = "polite",
}: {
  type: "success" | "error";
  children: React.ReactNode;
  onClose: () => void;
  ariaLive?: "polite" | "assertive";
}) {
  return (
    <div
      className="fixed right-4 top-4 z-[60] w-[min(92vw,360px)]"
      role="status"
      aria-live={ariaLive}
    >
      <div
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm
          ${
            type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
      >
        {type === "success" ? (
          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">{children}</div>
        <button
          onClick={onClose}
          className="ml-2 rounded-md p-1 text-slate-500 hover:bg-white/40"
          aria-label="Close"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
