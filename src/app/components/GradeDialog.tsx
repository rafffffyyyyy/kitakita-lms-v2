"use client";

import { useState } from "react";
import type { LatestSubmission, RosterStudent } from "@/lib/types/progress";
import { XMarkIcon } from "@heroicons/react/24/outline";

export default function GradeDialog({
  open, onClose, submission, student, onSaved, findNextUngraded, children
}: {
  open: boolean;
  onClose: () => void;
  submission: LatestSubmission;
  student: RosterStudent;
  onSaved: (updated: { id: string; grade: number; feedback: string | null }) => void;
  findNextUngraded: () => void;
  children: React.ReactNode;
}) {
  const [grade, setGrade] = useState<number | "">(submission.grade ?? "");
  const [feedback, setFeedback] = useState<string>(submission.feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const save = async (goNext: boolean) => {
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch("/api/progress/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submission.id,
          grade: grade === "" ? null : Number(grade),
          feedback: feedback || null
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed.");
      onSaved({ id: submission.id, grade: Number(grade), feedback: feedback || null });
      if (goNext) findNextUngraded(); else onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-stretch justify-end">
      <div className="w-full max-w-5xl h-full bg-white shadow-2xl border-l grid grid-cols-1 md:grid-cols-2">
        {/* Header */}
        <div className="col-span-full h-14 border-b bg-white/90 px-4 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm text-neutral-500">Checking & Grading</div>
            <div className="font-medium text-neutral-900 truncate">
              {student.last_name}, {student.first_name}
            </div>
          </div>
          <button
            className="rounded-xl p-2 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
            onClick={onClose}
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5 text-neutral-700" />
          </button>
        </div>

        {/* Left: work */}
        <div className="p-4 min-w-0 overflow-auto">{children}</div>

        {/* Right: grading */}
        <div className="p-4 border-l min-w-0">
          <div className="text-sm text-neutral-500 mb-2">Grading</div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-neutral-600 mb-1">Score</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={grade}
                onChange={(e) => setGrade(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">Feedback</label>
              <textarea
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                rows={6}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>

            {err && <div className="text-sm text-red-600">{err}</div>}

            <div className="flex flex-wrap gap-2">
              <button
                className="whitespace-nowrap rounded-xl border border-blue-600 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={saving || grade === ""}
                onClick={() => save(false)}
              >
                Save
              </button>
              <button
                className="whitespace-nowrap rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
                disabled={saving || grade === ""}
                onClick={() => save(true)}
              >
                Save & Next Ungraded
              </button>
              <button
                className="whitespace-nowrap rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={onClose}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
