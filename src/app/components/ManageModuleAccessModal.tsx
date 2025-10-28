"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  XMarkIcon,
  UserIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabase";

/* ------------------------------- Types ------------------------------- */
type StudentRow = {
  id: string;
  first_name: string | null;
  middle_name?: string | null;
  last_name: string | null;
  section_id: number | null;
  section_name?: string | null;
};

type SectionRow = { id: number; name: string };

type ModuleStudentRow = { student_id: string };

/* ----------------------------- Component ----------------------------- */
export default function ManageModuleAccessModal({
  open,
  moduleId,
  moduleTitle,
  onClose,
  onSaved,
}: {
  open: boolean;
  moduleId: string;
  moduleTitle: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [sectionFilter, setSectionFilter] = useState<string>(""); // "" = All
  const [onlySelected, setOnlySelected] = useState<boolean>(false);

  const [allowedIds, setAllowedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  /* ---------------------------- Data Load ---------------------------- */
  useEffect(() => {
    if (!open) return;
    let mounted = true;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        // who is the teacher?
        const { data: auth } = await supabase.auth.getUser();
        const teacherId = auth.user?.id;
        if (!teacherId) throw new Error("Not authenticated.");

        // 1) fetch teacher's students (id + names + section_id)
        const { data: studs, error: sErr } = await supabase
          .from("students")
          .select("id, first_name, middle_name, last_name, section_id")
          .eq("teacher_id", teacherId)
          .order("last_name", { ascending: true });

        if (sErr) throw sErr;

        const baseStudents = (studs ?? []) as StudentRow[];

        // 2) resolve section names used by those students
        const sectionIds = Array.from(
          new Set(
            baseStudents
              .map((s) => s.section_id)
              .filter((v): v is number => typeof v === "number")
          )
        );

        let sectionNameById: Record<number, string> = {};
        if (sectionIds.length) {
          const { data: secs, error: secErr } = await supabase
            .from("sections")
            .select("id, name")
            .in("id", sectionIds);

          if (secErr) throw secErr;

          const secList = (secs ?? []) as SectionRow[];
          setSections(secList.sort((a, b) => a.name.localeCompare(b.name)));
          sectionNameById = Object.fromEntries(
            secList.map((r) => [r.id, r.name])
          );
        } else {
          setSections([]);
          sectionNameById = {};
        }

        // attach section_name to each student
        const studentsWithNames: StudentRow[] = baseStudents.map((s) => ({
          ...s,
          section_name:
            s.section_id != null ? sectionNameById[s.section_id] ?? null : null,
        }));

        // 3) current allowed students for this module
        const { data: allowed, error: aErr } = await supabase
          .from("module_students")
          .select("student_id")
          .eq("module_id", moduleId);

        if (aErr) throw aErr;

        const allowedSet: Record<string, boolean> = {};
        (allowed ?? []).forEach((r: ModuleStudentRow) => {
          allowedSet[String(r.student_id)] = true;
        });

        if (!mounted) return;

        setStudents(studentsWithNames);
        setAllowedIds(allowedSet);
      } catch (e: unknown) {
        console.error("ManageModuleAccess load:", e);
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to load students. Please try again.";
        setErr(msg);
        setStudents([]);
        setAllowedIds({});
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [open, moduleId, refreshToken]);

  /* ----------------------------- Filters ----------------------------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sec = sectionFilter.trim();

    const inQuery = (s: StudentRow) => {
      if (!q) return true;
      const name = [s.first_name, s.middle_name, s.last_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const secName = (s.section_name ?? "").toLowerCase();
      return name.includes(q) || secName.includes(q);
    };

    const inSection = (s: StudentRow) => {
      if (!sec) return true;
      return String(s.section_id ?? "") === sec;
    };

    const pool = students.filter((s) => inQuery(s) && inSection(s));
    const selectedFirst = pool.sort((a, b) => {
      const aSel = allowedIds[a.id] ? 1 : 0;
      const bSel = allowedIds[b.id] ? 1 : 0;
      return bSel - aSel; // selected first
    });

    return onlySelected
      ? selectedFirst.filter((s) => allowedIds[s.id])
      : selectedFirst;
  }, [students, allowedIds, query, sectionFilter, onlySelected]);

  const selectedCount = useMemo(
    () => Object.values(allowedIds).filter(Boolean).length,
    [allowedIds]
  );

  /* ----------- NEW: Section pool + “Select all” state/helpers ----------- */
  // Pool is "all students in the currently chosen section"; if no section picked, it's all students.
  const sectionPool = useMemo(() => {
    if (!sectionFilter) return students;
    return students.filter((s) => String(s.section_id ?? "") === sectionFilter);
  }, [students, sectionFilter]);

  const currentSectionName = useMemo(() => {
    if (!sectionFilter) return "";
    return sections.find((s) => String(s.id) === sectionFilter)?.name ?? "";
  }, [sections, sectionFilter]);

  const selectedInSection = useMemo(
    () => sectionPool.filter((s) => allowedIds[s.id]).length,
    [sectionPool, allowedIds]
  );

  const allSectionSelected =
    sectionPool.length > 0 && selectedInSection === sectionPool.length;

  const selectAllRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedInSection > 0 && !allSectionSelected;
  }, [selectedInSection, allSectionSelected]);

  const toggleSelectAllInSection = () => {
    const target = !allSectionSelected; // if not all selected → select all; else unselect all
    setAllowedIds((prev) => {
      const next = { ...prev };
      sectionPool.forEach((s) => {
        next[s.id] = target;
      });
      return next;
    });
  };

  /* ----------------------------- Actions ----------------------------- */
  if (!open) return null;

  const toggle = (id: string) => {
    setAllowedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearSelections = () => {
    setAllowedIds({});
  };

  const handleSave = async () => {
    setSaving(true);
    setErr(null);

    try {
      // read current rows (server source of truth)
      const { data: existingRows, error: e1 } = await supabase
        .from("module_students")
        .select("student_id")
        .eq("module_id", moduleId);

      if (e1) throw e1;

      const existingSet = new Set<string>(
        (existingRows ?? []).map((r: ModuleStudentRow) => String(r.student_id))
      );

      const targetSet = new Set<string>(
        Object.entries(allowedIds)
          .filter(([, v]) => v)
          .map(([k]) => k)
      );

      const toAdd = Array.from(targetSet).filter((id) => !existingSet.has(id));
      const toRemove = Array.from(existingSet).filter((id) => !targetSet.has(id));

      if (toAdd.length) {
        const rows = toAdd.map((sid) => ({
          module_id: moduleId,
          student_id: sid,
        }));
        const { error: insErr } = await supabase.from("module_students").insert(rows);
        if (insErr) {
          if (
            typeof insErr.message === "string" &&
            insErr.message.toLowerCase().includes("row-level security")
          ) {
            throw new Error(
              "Cannot save access list (blocked by database policy). Make sure you own this module and your RLS policies allow teachers to insert into module_students."
            );
          }
          throw insErr;
        }
      }

      if (toRemove.length) {
        const { error: delErr } = await supabase
          .from("module_students")
          .delete()
          .eq("module_id", moduleId)
          .in("student_id", toRemove);
        if (delErr) throw delErr;
      }

      onSaved?.();
      setRefreshToken((n) => n + 1);
      onClose();
    } catch (e: unknown) {
      console.error("ManageModuleAccess save:", e);
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to save changes. Please try again.";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------- UI -------------------------------- */
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Manage access for module ${moduleTitle}`}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
            <UserIcon className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">Manage Access</h3>
            <div className="text-sm text-slate-500 truncate">{moduleTitle}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <div className="mb-3 text-sm text-slate-600">
            Select which of your students can view this module. You can modify this anytime.
          </div>

          {/* Controls row */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Search */}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search students by name or section…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
            />

            {/* Section filter */}
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="w-full sm:w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              aria-label="Filter by section"
            >
              <option value="">All sections</option>
              {sections.map((sec) => (
                <option key={sec.id} value={String(sec.id)}>
                  {sec.name}
                </option>
              ))}
            </select>

            {/* Selected toggle */}
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlySelected}
                onChange={(e) => setOnlySelected(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              Show selected only
            </label>

            {/* NEW: Select-all (per section) */}
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSectionSelected}
                onChange={toggleSelectAllInSection}
                className="h-4 w-4 rounded"
              />
              <span className="whitespace-nowrap">
                Select all {currentSectionName ? `in “${currentSectionName}”` : "students"}
              </span>
              <span className="text-xs text-slate-500">
                ({selectedInSection}/{sectionPool.length || 0})
              </span>
            </label>
          </div>

          {/* Selected chips */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Selected:</span>
            {selectedCount === 0 ? (
              <span className="text-xs text-slate-400">None</span>
            ) : (
              filtered
                .filter((s) => allowedIds[s.id])
                .slice(0, 12)
                .map((s) => (
                  <button
                    key={`chip-${s.id}`}
                    onClick={() => toggle(s.id)}
                    className="group inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
                    title="Click to unselect"
                  >
                    {[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ") || "Unnamed"}
                    <XMarkIcon className="h-3.5 w-3.5 text-indigo-500 group-hover:text-indigo-700" />
                  </button>
                ))
            )}
            {selectedCount > 12 && (
              <span className="text-[11px] text-slate-500">+{selectedCount - 12} more</span>
            )}
            {selectedCount > 0 && (
              <button
                onClick={clearSelections}
                className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                title="Clear all selections"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Errors */}
          {err && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          )}

          {/* List */}
          <div className="max-h>[48vh] overflow-auto rounded-lg border border-slate-100 bg-white">
            {loading ? (
              <div className="p-4">
                <div className="animate-pulse space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-10 rounded bg-slate-100" />
                  ))}
                </div>
              </div>
            ) : students.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
                  No students found under your account.
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">No matches.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((s) => {
                  const checked = Boolean(allowedIds[s.id]);
                  const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
                  return (
                    <li key={s.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {name || "Unnamed student"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {s.section_name ?? "No section"}
                        </div>
                      </div>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(s.id)}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-xs text-slate-600">Allowed</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <div className="mr-auto text-xs text-slate-500">{selectedCount} selected</div>
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : (<><CheckIcon className="h-4 w-4" /> Save</>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
