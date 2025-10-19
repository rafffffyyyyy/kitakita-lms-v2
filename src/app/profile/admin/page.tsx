// File: /src/app/profile/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import BackButton from "../../components/BackButton";
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
} from "@heroicons/react/24/outline";

const AVATAR_BUCKET = "admin-avatars";

export default function AdminProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [showPassword, setShowPassword] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingPass, setLoadingPass] = useState(false);

  const flash = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // Fetch admin profile via profiles table
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, middle_name, last_name, email, profile_picture_url")
        .eq("id", user.id)
        .single();

      if (!error && data) setProfile(data);
    })();
  }, []);

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
    if (!image || !profile) return;
    try {
      setLoadingUpload(true);
      const uid = profile.id as string;
      const ext = image.name.split(".").pop() || "png";
      const filePath = `${uid}/avatar_${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(filePath, image, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ profile_picture_url: publicUrl })
        .eq("id", uid);
      if (updErr) throw updErr;

      setProfile((p: any) => ({ ...p, profile_picture_url: publicUrl }));
      flash("success", "Profile picture updated!");
      setShowUploadModal(false);
      clearSelectedImage();
    } catch (e: any) {
      console.error("uploadPhoto error:", e);
      flash("error", e?.message || "Failed to upload photo.");
    } finally {
      setLoadingUpload(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwords.new || !passwords.confirm) {
      flash("error", "Please enter a new password and confirmation.");
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
      flash("error", e?.message || "Failed to change password.");
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
      {/* Header */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="ml-2 flex items-center gap-2">
            <UserCircleIcon className="h-6 w-6 text-slate-700" />
            <h1 className="text-lg font-semibold text-slate-800">Admin Profile</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Flash Message */}
        {message && (
          <div
            className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
            role="alert"
          >
            {message.type === "success" ? (
              <CheckCircleIcon className="mt-0.5 h-5 w-5" />
            ) : (
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT: Avatar */}
          <aside className="lg:col-span-1">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col items-center">
                <div className="relative">
                  <img
                    src={preview || profile.profile_picture_url || "/default-avatar.png"}
                    alt="Profile"
                    className="h-36 w-36 rounded-2xl object-cover ring-1 ring-slate-200"
                  />
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="group absolute -bottom-2 -right-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
                  >
                    <CameraIcon className="h-4 w-4" />
                    Change
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* RIGHT: Info + Password */}
          <section className="lg:col-span-2 space-y-6">
            {/* Info */}
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-800">Personal Information</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="First Name" value={profile.first_name} />
                <Field label="Last Name" value={profile.last_name} />
                <Field label="Middle Name" value={profile.middle_name || ""} />
                <Field label="Email" value={profile.email} />
              </div>
            </div>

            {/* Password */}
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <KeyIcon className="h-5 w-5 text-slate-600" />
                <h2 className="text-base font-semibold text-slate-800">Change Password</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {["current", "new", "confirm"].map((field) => (
                  <div key={field} className="relative">
                    <input
                      type={showPassword[field as keyof typeof showPassword] ? "text" : "password"}
                      placeholder={
                        field === "current"
                          ? "Current Password"
                          : field === "new"
                          ? "New Password"
                          : "Confirm Password"
                      }
                      className="w-full rounded-lg border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-slate-300"
                      value={passwords[field as keyof typeof passwords]}
                      onChange={(e) =>
                        setPasswords({ ...passwords, [field]: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((prev) => ({
                          ...prev,
                          [field]: !prev[field as keyof typeof prev],
                        }))
                      }
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-700"
                    >
                      {showPassword[field as keyof typeof showPassword] ? (
                        <EyeSlashIcon className="h-5 w-5" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <button
                  onClick={handlePasswordChange}
                  disabled={loadingPass}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
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
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Upload Profile Picture</h3>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  clearSelectedImage();
                }}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-4">
                <img
                  src={preview || profile.profile_picture_url || "/default-avatar.png"}
                  className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200"
                  alt="Preview"
                />
                <div className="flex-1">
                  <input id="file" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  <label
                    htmlFor="file"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
                  <p className="mt-2 text-xs text-slate-500">
                    PNG or JPG. Square images look best (≥ 256×256).
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    clearSelectedImage();
                  }}
                  className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="text"
        value={value}
        disabled
        readOnly
        className="w-full rounded-lg border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-slate-300 disabled:opacity-100"
      />
    </label>
  );
}
