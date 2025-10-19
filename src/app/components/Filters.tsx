"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon, UsersIcon } from "@heroicons/react/24/outline";

type Student = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  lrn: string;
};

export default function Filters({
  students,
  selectedStudentId,
  onStudentChange,
}: {
  students: Student[];
  selectedStudentId: string | "all";
  onStudentChange: (id: string | "all") => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return students;
    const s = q.toLowerCase();
    return students.filter(
      (x) =>
        x.first_name.toLowerCase().includes(s) ||
        (x.middle_name || "").toLowerCase().includes(s) ||
        x.last_name.toLowerCase().includes(s) ||
        x.lrn.toLowerCase().includes(s)
    );
  }, [q, students]);

  const fullName = (s: Student) =>
    [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(", ");

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-3 shadow-sm">
      <div className="flex items-center gap-2 rounded-xl border border-neutral-300 px-3 bg-white focus-within:ring-2 focus-within:ring-blue-200">
        <MagnifyingGlassIcon className="w-5 h-5 text-neutral-600" />
        <input
          className="w-full py-2 bg-transparent outline-none text-sm text-neutral-900 placeholder:text-neutral-400"
          placeholder="Search student by name or LRN…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mt-3 text-xs text-neutral-500 flex items-center gap-1">
        <UsersIcon className="w-4 h-4" />
        Tap a student below or choose “All Students”.
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 max-h-64 overflow-auto">
        <button
          onClick={() => onStudentChange("all")}
          className={`text-left rounded-xl px-3 py-2 border bg-white hover:shadow-sm transition ${
            selectedStudentId === "all" ? "border-blue-500 ring-2 ring-blue-200" : "border-neutral-200"
          }`}
        >
          All Students
        </button>

        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => onStudentChange(s.id)}
            className={`text-left rounded-xl px-3 py-2 border bg-white hover:shadow-sm transition ${
              selectedStudentId === s.id ? "border-blue-500 ring-2 ring-blue-200" : "border-neutral-200"
            }`}
            title={fullName(s)}
          >
            <div className="text-sm font-medium truncate text-neutral-900">{fullName(s)}</div>
            <div className="text-xs text-neutral-500 truncate">LRN: {s.lrn}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
