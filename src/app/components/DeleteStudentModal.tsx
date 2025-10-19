"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ExclamationTriangleIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface Student {
  id: string;        // == auth.users.id
  first_name: string;
  last_name: string;
}

interface DeleteStudentModalProps {
  closeModal: () => void;
  student: Student;
  onStudentDeleted: () => void;
}

export default function DeleteStudentModal({
  closeModal,
  student,
  onStudentDeleted,
}: DeleteStudentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // optional: show a softer warning if auth delete fails but DB row is gone
  const [authWarn, setAuthWarn] = useState<string | null>(null);

  const handleDeleteStudent = async () => {
    setLoading(true);
    setError(null);
    setAuthWarn(null);

    try {
      // 1) Delete from your "students" table (as you already do)
      const { error: dbErr } = await supabase
        .from("students")
        .delete()
        .eq("id", student.id);

      if (dbErr) {
        setError(dbErr.message);
        setLoading(false);
        return;
      }

      // 2) ALSO delete the Supabase Auth user (server-side API with service role)
      // We include the access token purely if you want to do auth checks in the API route.
      let accessToken: string | undefined;
      try {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token;
      } catch {
        // ignore; API doesn't require it for minimal setup
      }

      const res = await fetch("/api/admin/delete-auth-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ userId: student.id }),
      });

      if (!res.ok) {
        // Don’t block the flow; inform the user that only Auth removal failed.
        const text = await res.text();
        setAuthWarn(
          "Student row deleted, but removing the Auth user failed. " +
            (text || "Try again or contact an administrator.")
        );
        // We still fire the parent refresh so the student disappears in UI.
      }

      onStudentDeleted();
      closeModal();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error deleting student";
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
      aria-labelledby="delete-student-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-50 p-2 ring-1 ring-red-100">
              <TrashIcon className="h-5 w-5 text-red-600" />
            </div>
            <h2
              id="delete-student-title"
              className="text-lg font-semibold text-gray-900"
            >
              Remove Student
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
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="text-sm">
              This action cannot be undone. The student{" "}
              <strong>
                {student.first_name} {student.last_name}
              </strong>{" "}
              will be permanently removed from the Students table and their
              Auth account will be deleted.
            </p>
          </div>

          {error && (
            <div
              className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}

          {authWarn && !error && (
            <div
              className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              role="status"
              aria-live="polite"
            >
              {authWarn}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={closeModal}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteStudent}
              disabled={loading}
              aria-busy={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
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
              ) : (
                <TrashIcon className="h-4 w-4" />
              )}
              {loading ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
