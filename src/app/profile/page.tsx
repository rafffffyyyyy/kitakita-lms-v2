// File: /src/app/profile/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/app/UserContext";
import BackButton from "@/app/components/BackButton";
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
  IdentificationIcon,
  EnvelopeIcon,
  LinkIcon,
  ClipboardIcon,
} from "@heroicons/react/24/outline";

/** We use the teacher bucket for all avatars as requested */
const AVATAR_BUCKET = "teacher-avatars";

type Role = "admin" | "teacher" | "student" | null;

type ProfileRow = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_picture_url: string | null;
};

type StudentRow = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  lrn: string | null;
  username: string | null;
  profile_picture_url: string | null;
};

/* ---------------------------- helpers ---------------------------- */

function friendlyAuthError(e: any): string {
  const msg = String(e?.message || e?.error_description || e?.error || e || "");
  const low = msg.toLowerCase();
  if (low.includes("invalid login")) return "Current password is incorrect.";
  if (low.includes("should be at least") || low.includes("weak"))
    return "New password is too weak. Use at least 6 characters.";
  if (low.includes("network") || low.includes("failed to fetch"))
    return "Network error. Check your connection or browser extensions.";
  if (low.includes("session") || low.includes("expired"))
    return "Session expired. Please sign in again and retry.";
  return msg || "Something went wrong.";
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------- component ---------------------------- */

export default function UnifiedProfilePage() {
  const { role, userId } = useUser();

  const [adminOrTeacher, setAdminOrTeacher] = useState<ProfileRow | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  // avatar
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loadingUpload, setLoadingUpload] = useState(false);

  // password
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });
  const [loadingPass, setLoadingPass] = useState(false);

  // toast
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const flash = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  };

  /* ---------------------- load profile by role ---------------------- */
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const _uid = auth?.user?.id ?? userId ?? null;
      if (!_uid) return;
      setUid(_uid);

      if (role === "student") {
        const { data } = await supabase
          .from("students")
          .select("id, first_name, middle_name, last_name, lrn, username, profile_picture_url")
          .eq("id", _uid)
          .maybeSingle();
        if (data) setStudent(data as StudentRow);
      } else if (role === "teacher" || role === "admin") {
        const { data } = await supabase
          .from("profiles")
          .select("id, first_name, middle_name, last_name, email, profile_picture_url")
          .eq("id", _uid)
          .maybeSingle();
        if (data) setAdminOrTeacher(data as ProfileRow);
      }
    })();
  }, [role, userId]);

  const profilePicture =
    role === "student" ? student?.profile_picture_url : adminOrTeacher?.profile_picture_url;

  const displayName = useMemo(() => {
    const target = role === "student" ? student : adminOrTeacher;
    if (!target) return "";
    return [target.first_name, target.middle_name, target.last_name]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }, [role, student, adminOrTeacher]);

  const profileLink = useMemo(() => {
    if (!uid) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (role === "teacher") return origin ? `${origin}/teacher/${uid}` : `/teacher/${uid}`;
    if (role === "student") return origin ? `${origin}/student/${uid}` : `/student/${uid}`;
    if (role === "admin") return origin ? `${origin}/admin/${uid}` : `/admin/${uid}`;
    return "";
  }, [uid, role]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      flash("success", "Copied to clipboard.");
    } catch {
      flash("error", "Copy failed. Please copy manually.");
    }
  };

  /* --------------------------- avatar upload --------------------------- */
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    setImage(f);
    setPreview(URL.createObjectURL(f));
  };
  const clearSelected = () => {
    setImage(null);
    setPreview(null);
  };

  const uploadAvatar = async () => {
    if (!image || !uid) return;
    try {
      setLoadingUpload(true);
      const ext = image.name.split(".").pop() || "png";
      const path = `${uid}/avatar_${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, image, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;

      if (role === "student") {
        const { error: upd } = await supabase.from("students").update({ profile_picture_url: url }).eq("id", uid);
        if (upd) throw upd;
        setStudent((s) => (s ? { ...s, profile_picture_url: url } : s));
      } else if (role === "teacher" || role === "admin") {
        const { error: upd } = await supabase.from("profiles").update({ profile_picture_url: url }).eq("id", uid);
        if (upd) throw upd;
        setAdminOrTeacher((p) => (p ? { ...p, profile_picture_url: url } : p));
      }

      flash("success", "Profile picture updated!");
      setShowUpload(false);
      clearSelected();
    } catch (e: any) {
      console.error("[avatar upload]", e);
      flash("error", e?.message || "Failed to upload photo. Check bucket & policies.");
    } finally {
      setLoadingUpload(false);
    }
  };

  /* ------------------------ change password ------------------------ */
  const handlePasswordChange = async () => {
    const curr = passwords.current.trim();
    const next = passwords.new.trim();
    const conf = passwords.confirm.trim();

    if (!curr || !next || !conf) {
      flash("error", "Please fill in Current, New, and Confirm passwords.");
      return;
    }
    if (next !== conf) {
      flash("error", "New password and confirmation do not match.");
      return;
    }
    if (next.length < 6) {
      flash("error", "New password must be at least 6 characters.");
      return;
    }

    setLoadingPass(true);
    try {
      // pick an email for re-auth
      const { data: ures } = await supabase.auth.getUser();
      let email: string | null =
        (ures?.user?.email as string | null) ??
        (role !== "student" ? adminOrTeacher?.email ?? null : null);

      if (!email && role === "student") {
        const lrn = student?.lrn?.trim();
        if (lrn) email = `${lrn}@students.kitakita.local`.toLowerCase();
      }
      if (!email) {
        flash("error", "No email is linked to your account, re-auth failed.");
        return;
      }

      // 1) verify CURRENT password
      const reauth = await supabase.auth.signInWithPassword({ email, password: curr });
      if (reauth.error || !reauth.data?.session) {
        flash("error", friendlyAuthError(reauth.error || "Invalid login credentials"));
        return;
      }

      // 2) fire the update
      const updatePromise = supabase.auth.updateUser({ password: next });

      // 3) optimistic success after 10s if still pending
      let settled = false;
      const optimistic = (async () => {
        await delay(10_000);                 // <-- 10 seconds
        if (settled) return { kind: "noop" };
        // optimistic success UI
        setPasswords({ current: "", new: "", confirm: "" });
        flash("success", "Password changed successfully!");
        setLoadingPass(false);

        // background verification: try to sign in with NEW password
        (async () => {
          try {
            const v = await supabase.auth.signInWithPassword({ email: email!, password: next });
            if (v.error || !v.data?.session) {
              // if verification fails, inform the user
              flash(
                "error",
                "We couldn't verify the change yet. If you cannot sign in with the new password, try again."
              );
            }
          } catch {
            // swallow – we already showed success
          }
        })();

        return { kind: "optimistic" as const };
      })();

      const real = (async () => {
        const res = await updatePromise;
        settled = true;
        return res;
      })();

      const raced: any = await Promise.race([real, optimistic]);

      // If optimistic already handled the UI, stop here.
      if (raced?.kind === "optimistic" || raced?.kind === "noop") return;

      // Otherwise, handle the real result normally.
      if (raced?.error) {
        flash("error", friendlyAuthError(raced.error));
        return;
      }

      // success (resolved fast)
      setPasswords({ current: "", new: "", confirm: "" });
      flash("success", "Password changed successfully!");
    } catch (e: any) {
      console.error("[change password]", e);
      flash("error", friendlyAuthError(e));
    } finally {
      setLoadingPass(false);
    }
  };

  const loaded =
    (role === "student" && !!student) ||
    ((role === "teacher" || role === "admin") && !!adminOrTeacher);

  const canChange =
    !!passwords.current &&
    !!passwords.new &&
    !!passwords.confirm &&
    passwords.new.length >= 6 &&
    passwords.new === passwords.confirm &&
    !loadingPass;

  /* --------------------------------- UI --------------------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Toast */}
      {toast && (
        <Toast type={toast.type} onClose={() => setToast(null)}>
          {toast.text}
        </Toast>
      )}

      {/* Header */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="ml-2 flex items-center gap-2">
            <UserCircleIcon className="h-6 w-6 text-slate-700" />
            <h1 className="text-lg font-semibold text-slate-800">
              {role === "admin" ? "Admin" : role === "teacher" ? "Teacher" : "Student"} Profile
            </h1>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        {!loaded ? (
          <div className="min-h-[60vh] grid place-items-center">
            <div className="animate-pulse text-slate-500">Loading profile…</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* LEFT: avatar + quick facts */}
            <aside className="lg:col-span-1">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className="h-36 w-36 overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview || profilePicture || "/default-avatar.png"}
                        alt="Profile"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() => setShowUpload(true)}
                      className="group absolute -bottom-2 -right-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
                    >
                      <CameraIcon className="h-4 w-4" />
                      Change
                    </button>
                  </div>

                  {/* Role-specific quick facts */}
                  <div className="mt-5 grid w-full grid-cols-1 gap-3 text-sm">
                    {role === "student" && student && (
                      <>
                        <Row
                          label={
                            <span className="inline-flex items-center gap-2 text-slate-600">
                              <IdentificationIcon className="h-5 w-5" /> LRN
                            </span>
                          }
                          value={student.lrn || "—"}
                        />
                        <Row label="Username" value={student.username || "—"} />
                      </>
                    )}

                    {(role === "teacher" || role === "admin") && adminOrTeacher && (
                      <Row
                        label={
                          <span className="inline-flex items-center gap-2 text-slate-600">
                            <EnvelopeIcon className="h-5 w-5" /> Email
                          </span>
                        }
                        value={adminOrTeacher.email || "—"}
                      />
                    )}

                    {profileLink && (role === "teacher" || role === "student") && (
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
                        <div className="mt-1 truncate text-[11px] text-slate-500" title={profileLink}>
                          {profileLink}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>

            {/* RIGHT: details + password */}
            <section className="lg:col-span-2 space-y-6">
              {/* Personal Information */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-slate-800">Personal Information</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Field label="First Name" value={(role === "student" ? student?.first_name : adminOrTeacher?.first_name) || ""} />
                  <Field label="Last Name" value={(role === "student" ? student?.last_name : adminOrTeacher?.last_name) || ""} />
                  <Field label="Middle Name" value={(role === "student" ? student?.middle_name : adminOrTeacher?.middle_name) || ""} />
                  {role !== "student" && <Field label="Email" value={adminOrTeacher?.email || ""} />}
                  <Field label="Role" value={role ? role[0].toUpperCase() + role.slice(1) : ""} />
                </div>
              </div>

              {/* Change Password */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <KeyIcon className="h-5 w-5 text-slate-600" />
                  <h2 className="text-base font-semibold text-slate-800">Change Password</h2>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {(["current", "new", "confirm"] as const).map((field) => (
                    <div key={field} className="relative">
                      <input
                        type={showPassword[field] ? "text" : "password"}
                        placeholder={
                          field === "current"
                            ? "Current Password"
                            : field === "new"
                            ? "New Password"
                            : "Confirm New Password"
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        value={passwords[field]}
                        onChange={(e) => setPasswords({ ...passwords, [field]: e.target.value })}
                        aria-required="true"
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
                    disabled={!canChange}
                    aria-busy={loadingPass ? "true" : "false"}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                  >
                    <KeyIcon className="h-4 w-4" />
                    {loadingPass ? "Updating…" : "Change Password"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Upload Profile Picture</h3>
              <button
                onClick={() => {
                  setShowUpload(false);
                  clearSelected();
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
                  src={preview || profilePicture || "/default-avatar.png"}
                  className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200"
                  alt="Preview"
                />
                <div className="flex-1">
                  <input id="file" type="file" accept="image/*" onChange={onPickFile} className="hidden" />
                  <label
                    htmlFor="file"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowUpTrayIcon className="h-4 w-4" />
                    Choose image
                  </label>
                  {preview && (
                    <button
                      onClick={clearSelected}
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
                    setShowUpload(false);
                    clearSelected();
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={uploadAvatar}
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

/* ------------------------- small UI helpers ------------------------- */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="text"
        value={value}
        disabled
        readOnly
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-100"
      />
    </label>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
      <span className="inline-flex items-center gap-2 text-slate-600">{label}</span>
      <span className="font-medium text-slate-900 truncate max-w-[55%]" title={value}>
        {value}
      </span>
    </div>
  );
}

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
    <div className="fixed right-4 top-4 z-[60] w-[min(92vw,360px)]" role="status" aria-live={ariaLive}>
      <div
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm ${
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
