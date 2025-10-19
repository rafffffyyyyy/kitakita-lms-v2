// File: /src/app/profile/student/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  IdentificationIcon,
  EyeIcon,
  EyeSlashIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

const AVATAR_BUCKET = "student-avatars";

type StudentRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  lrn: string | null;
  username: string | null;
  profile_picture_url: string | null;
};

export default function StudentProfile() {
  // -------- state
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });

  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changingPass, setChangingPass] = useState(false);

  // auto-dismiss toasts, but never before first paint
  const firstPaint = useRef(false);
  useEffect(() => {
    firstPaint.current = true;
  }, []);
  useEffect(() => {
    if (!toast || !firstPaint.current) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const flash = (type: "success" | "error", text: string) => setToast({ type, text });

  // -------- read (single, narrow select to avoid slow queries)
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("students")
        .select("id,first_name,middle_name,last_name,lrn,username,profile_picture_url")
        .eq("id", uid)
        .single();

      if (!error && data) setStudent(data as StudentRow);
      setLoading(false);
    })();
  }, []);

  // -------- avatar upload
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
    if (!image || !student) return;
    try {
      setUploading(true);
      const ext = image.name.split(".").pop() || "png";
      const path = `${student.id}/avatar_${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, image, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`; // cache bust

      const { error: updErr } = await supabase
        .from("students")
        .update({ profile_picture_url: publicUrl })
        .eq("id", student.id);
      if (updErr) throw updErr;

      setStudent((s) => (s ? { ...s, profile_picture_url: publicUrl } : s));
      setUploadOpen(false);
      clearSelectedImage();
      flash("success", "Profile photo updated.");
    } catch (e: any) {
      console.error(e);
      flash("error", e?.message || "Upload failed. Check bucket & policies.");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (!student) return;
    try {
      const { error } = await supabase.from("students").update({ profile_picture_url: null }).eq("id", student.id);
      if (error) throw error;
      setStudent((s) => (s ? { ...s, profile_picture_url: null } : s));
      flash("success", "Profile photo removed.");
    } catch (e: any) {
      flash("error", e?.message || "Failed to remove photo.");
    }
  };

  // -------- change password (reliable success toast)
  const handlePasswordChange = async () => {
    if (!passwords.new || !passwords.confirm) {
      flash("error", "Please enter the new password and confirmation.");
      return;
    }
    if (passwords.new !== passwords.confirm) {
      flash("error", "Passwords do not match.");
      return;
    }
    try {
      setChangingPass(true);
      const { error } = await supabase.auth.updateUser({ password: passwords.new });
      if (error) throw error;
      setPasswords({ current: "", new: "", confirm: "" });
      // Force a paint before clearing (so toast never gets swallowed)
      await Promise.resolve();
      flash("success", "Password changed successfully.");
    } catch (e: any) {
      console.error(e);
      flash("error", e?.message || "Failed to change password. Please re-login and try again.");
    } finally {
      setChangingPass(false);
    }
  };

  // -------- helpers
  const fullName = useMemo(
    () =>
      [student?.first_name, student?.middle_name, student?.last_name].filter(Boolean).join(" ") ||
      "Student",
    [student]
  );

  if (loading) {
    return (
      <div className="min-h-[70vh] grid place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
      </div>
    );
  }
  if (!student) {
    return (
      <div className="min-h-[70vh] grid place-items-center text-slate-600">
        Couldn’t load your profile.
      </div>
    );
  }

  retur
