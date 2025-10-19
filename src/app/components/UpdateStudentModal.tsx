"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  UserCircleIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

interface Student {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  lrn: string;
  section_id: number;
  section_name: string;
  username: string;
  password: string;
}

interface UpdateStudentModalProps {
  closeModal: () => void;
  student: Student;
  onStudentUpdated: () => void;
}

type SectionRow = { id: number; name: string };

export default function UpdateStudentModal({
  closeModal,
  student,
  onStudentUpdated,
}: UpdateStudentModalProps) {
  const [firstName, setFirstName] = useState(student.first_name);
  const [middleName, setMiddleName] = useState(student.middle_name || "");
  const [lastName, setLastName] = useState(student.last_name);
  const [lrn, setLrn] = useState(student.lrn);
  const [section, setSection] = useState(student.section_name);

  // load sections for visible selection
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [sectionsError, setSectionsError] = useState<string | null>(null);

  // optional password reset
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingSections(true);
      setSectionsError(null);
      const { data, error } = await supabase
        .from("sections")
        .select("id,name")
        .order("name", { ascending: true });
      if (!mounted) return;
      if (error) {
        setSectionsError("Failed to load sections.");
        setSections([]);
      } else {
        setSections(data ?? []);
      }
      setLoadingSections(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdateStudent = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      // Get the current session/access token once for both calls
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();

      if (sessErr || !session?.access_token) {
        setError("Not authenticated.");
        setLoading(false);
        return;
      }

      // 1) If operator typed a new password, call the secure API first
      if (newPassword.trim().length > 0) {
        const resp = await fetch(`/api/students/${student.id}/set-password`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            password: newPassword.trim(),
            storeInStudents: true,
          }),
        });

        const json = await resp.json();
        if (!resp.ok || json?.error) {
          setError(json?.error ?? "Failed to set password.");
          setLoading(false);
          return;
        }
        if (json?.warning) {
          setNotice(json.warning);
        } else {
          setNotice("Password updated successfully.");
        }
      }

      // 2) Update the student's profile fields via server route
      const respUpdate = await fetch(`/api/students/${student.id}/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
          lrn: lrn,
          section_name: section, // server resolves name -> id
        }),
      });

      const jUpdate = await respUpdate.json().catch(() => ({}));
      if (!respUpdate.ok || jUpdate?.error) {
        setError(jUpdate?.error ?? "Failed to update student.");
        setLoading(false);
        return;
      }

      onStudentUpdated();
      closeModal();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error updating student";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-student-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-50 p-2 ring-1 ring-blue-100">
              <UserCircleIcon className="h-5 w-5 text-blue-600" />
            </div>
            <h2 id="edit-student-title" className="text-lg font-semibold text-gray-900">
              Edit Student
            </h2>
          </div>
          <button
            onClick={closeModal}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-4">
          {/* Alerts */}
          {error && (
            <div
              className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700"
              role="alert"
              aria-live="assertive"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          {notice && (
            <div
              className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700"
              role="status"
              aria-live="polite"
            >
              <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{notice}</p>
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col">
              <label htmlFor="firstName" className="mb-1 text-sm font-medium text-gray-700">
                First Name
              </label>
              <input
                id="firstName"
                autoFocus
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="lrn" className="mb-1 text-sm font-medium text-gray-700">
                LRN / Username
              </label>
              <input
                id="lrn"
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={lrn}
                onChange={(e) => setLrn(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="lastName" className="mb-1 text-sm font-medium text-gray-700">
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            {/* Section: visible selection (dropdown) */}
            <div className="flex flex-col">
              <label htmlFor="section" className="mb-1 text-sm font-medium text-gray-700">
                Section
              </label>

              {/* Loading state */}
              {loadingSections ? (
                <div className="h-[38px] w-full animate-pulse rounded-lg bg-gray-100" />
              ) : sectionsError ? (
                <>
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {sectionsError} – please retry later.
                  </div>
                  {/* Fallback: keep current value if list failed */}
                  <input
                    id="section"
                    type="text"
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                  />
                </>
              ) : (
                <select
                  id="section"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                >
                  {/* Keep current section visible even if it isn't in the list */}
                  {!sections.some((s) => s.name === section) && (
                    <option value={section}>{section}</option>
                  )}
                  {sections.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}

              <p className="mt-1 text-xs text-gray-500">
                Choose from existing sections. (Server resolves the name to ID.)
              </p>
            </div>

            <div className="flex flex-col sm:col-span-2">
              <label htmlFor="middleName" className="mb-1 text-sm font-medium text-gray-700">
                Middle Name <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                id="middleName"
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </div>
          </div>

          {/* Divider */}
          <hr className="my-5 border-gray-200" />

          {/* Password reset */}
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 ring-1 ring-blue-100">
              <KeyIcon className="h-4 w-4 text-blue-600" />
            </span>
            <p className="text-sm font-medium text-gray-900">Set New Password (optional)</p>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="newPassword" className="sr-only">
              New Password
            </label>
            <input
              id="newPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Enter new password"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <>
                  <EyeSlashIcon className="h-4 w-4" />
                  Hide
                </>
              ) : (
                <>
                  <EyeIcon className="h-4 w-4" />
                  Show
                </>
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Leave blank if you don’t want to change the password.
          </p>

          {/* Footer actions */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={closeModal}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateStudent}
              disabled={loading}
              aria-busy={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              )}
              {loading ? "Updating..." : "Update"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
