"use client";

import { useState } from "react";
import { XMarkIcon, CheckCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

type Props = {
  submissionId: string;
  defaultGrade: number | null;
  defaultFeedback: string;
  title: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function GradeModal({
  submissionId,
  defaultGrade,
  defaultFeedback,
  title,
  onClose,
  onSaved,
}: Props) {
  const [grade, setGrade] = useState<number | "">(defaultGrade ?? "");
  const [feedback, setFeedback] = useState<string>(defaultFeedback ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setBusy(true);
      setError(null);

      const res = await fetch("/api/teacher/grade-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          grade: grade === "" ? null : Number(grade),
          feedback: feedback || null,
        }),
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to save grade.");
      onSaved();
    } catch (e: any) {
      setError(e.message || "Failed to save grade.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl border border-neutral-200 shadow-2xl">
        <div className="h-14 flex items-center justify-between px-4 border-b bg-white/90">
          <div className="font-medium text-neutral-900">{title}</div>
          <button
            className="rounded-xl p-2 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
            onClick={onClose}
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5 text-neutral-700" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm">
              {error}
            </div>
          )}

          <label className="block">
            <div className="text-sm text-neutral-700 mb-1">Grade</div>
            <input
              inputMode="decimal"
              type="number"
              step="0.01"
              value={grade}
              onChange={(e) => setGrade(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="e.g., 95"
            />
          </label>

          <label className="block">
            <div className="text-sm text-neutral-700 mb-1">Feedback</div>
            <textarea
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Short feedback for the student (optional)"
            />
          </label>
        </div>

        <div className="p-4 sm:p-6 flex items-center justify-end gap-2 border-t bg-white/90">
          <button
            className="rounded-xl px-4 py-2 border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            onClick={submit}
            disabled={busy}
          >
            {busy ? (
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircleIcon className="w-5 h-5" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
