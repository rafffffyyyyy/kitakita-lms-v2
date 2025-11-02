// /src/app/components/ManageAssignmentAccessModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { XMarkIcon, UserIcon, CheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabase";

type SectionRow = { id: number; name: string };
type StudentRow = {
  id: string;
  first_name: string | null;
  middle_name?: string | null;
  last_name: string | null;
  section_id: number | null;
  section_name?: string | null;
};

type Props =
  | {
      open: boolean;
      onClose: () => void;
      /** Use this when editing an existing private assignment */
      assignmentId: string;
      assignmentTitle?: string;
      pickOnly?: false;
    }
  | {
      open: boolean;
      onClose: () => void;
      /** Use this when picking before the assignment exists */
      assignmentId?: undefined;
      assignmentTitle?: string;
      pickOnly: true;
      value: string[]; // currently selected
      onChange: (ids: string[]) => void;
    };

export default function ManageAssignmentAccessModal(props: Props) {
  const { open, onClose, assignmentTitle } = props;

  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isPickOnly = "pickOnly" in props && props.pickOnly === true;

  /* ----------------------------- Load sections ----------------------------- */
  useEffect(() => {
    if (!open) return;

    (async () => {
      setLoading(true);
      try {
        // 1) Resolve teacher.id from current auth user
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id ?? null;

        let teacherId: string | null = null;
        if (userId) {
          const { data: t } = await supabase
            .from("teachers")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();
          teacherId = (t as any)?.id ?? null;
        }

        // 2) Collect distinct section IDs taught by this teacher
        let sectionIds: number[] = [];
        if (teacherId) {
          const { data: rows } = await supabase
            .from("students")
            .select("section_id")
            .eq("teacher_id", teacherId);

          const raw = (rows ?? []).map((r: any) => r.section_id);
          sectionIds = Array.from(
            new Set(raw.filter((v: unknown): v is number => typeof v === "number"))
          );
        }

        // 3) Load sections by IDs
        let secs: SectionRow[] = [];
        if (sectionIds.length) {
          const { data } = await supabase
            .from("sections")
            .select("id, name")
            .in("id", sectionIds)
            .order("name", { ascending: true });
          secs = (data ?? []) as SectionRow[];
        }

        setSections(secs);
        setActiveSectionId(secs[0]?.id ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  /* ------------------------ Load students of section ----------------------- */
  useEffect(() => {
    if (!open || !activeSectionId) return;

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("students")
          .select("id, first_name, middle_name, last_name, section_id")
          .eq("section_id", activeSectionId)
          .order("last_name", { ascending: true });

        if (!error) {
          const withSec: StudentRow[] = (data ?? []).map((s: any) => ({
            ...s,
            section_name: sections.find((x) => x.id === s.section_id)?.name ?? null,
          }));
          setStudents(withSec);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open, activeSectionId, sections]);

  /* ------------------------ Initialize selected set ----------------------- */
  useEffect(() => {
    if (!open) return;

    (async () => {
      if (isPickOnly) {
        setSelected(new Set(props.value));
        return;
      }
      // Editing mode: load existing grants
      if ("assignmentId" in props && props.assignmentId) {
        const { data } = await supabase
          .from("assignment_students")
          .select("student_id")
          .eq("assignment_id", props.assignmentId);
        setSelected(new Set((data ?? []).map((d: any) => d.student_id)));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* --------------------------------- UI ops -------------------------------- */
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const allIdsInSection = useMemo(() => students.map((s) => s.id), [students]);

  const sectionAllChecked = useMemo(
    () => allIdsInSection.length > 0 && allIdsInSection.every((id) => selected.has(id)),
    [allIdsInSection, selected]
  );

  const sectionSomeChecked = useMemo(
    () => allIdsInSection.some((id) => selected.has(id)) && !sectionAllChecked,
    [allIdsInSection, selected, sectionAllChecked]
  );

  const toggleSectionAll = () => {
    const next = new Set(selected);
    if (sectionAllChecked) {
      allIdsInSection.forEach((id) => next.delete(id));
    } else {
      allIdsInSection.forEach((id) => next.add(id));
    }
    setSelected(next);
  };

  /* --------------------------------- Save ---------------------------------- */
  const save = async () => {
    if (isPickOnly) {
      props.onChange(Array.from(selected));
      onClose();
      return;
    }
    if (!("assignmentId" in props) || !props.assignmentId) return;

    setLoading(true);
    try {
      // Diff against existing
      const { data: existing } = await supabase
        .from("assignment_students")
        .select("student_id")
        .eq("assignment_id", props.assignmentId);

      const existingSet = new Set((existing ?? []).map((r: any) => r.student_id));
      const toAdd = Array.from(selected).filter((id) => !existingSet.has(id));
      const toRemove = Array.from(existingSet).filter((id) => !selected.has(id));

      if (toAdd.length) {
        await supabase.from("assignment_students").upsert(
          toAdd.map((student_id) => ({ assignment_id: props.assignmentId!, student_id })),
          { onConflict: "assignment_id,student_id", ignoreDuplicates: true }
        );
      }
      if (toRemove.length) {
        await supabase
          .from("assignment_students")
          .delete()
          .in("student_id", toRemove)
          .eq("assignment_id", props.assignmentId!);
      }
    } finally {
      setLoading(false);
      onClose();
    }
  };

  if (!open) return null;

  /* --------------------------------- View ---------------------------------- */
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[720px] max-h-[85vh] bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-gray-50">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold truncate">
              {isPickOnly ? "Select students for this private assignment" : "Manage private assignment access"}
            </h3>
            {assignmentTitle && <p className="text-xs sm:text-sm text-gray-500 truncate">{assignmentTitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid sm:grid-cols-[220px,1fr] gap-0 sm:gap-4">
          {/* Sections */}
          <div className="border-r max-h-[65vh] overflow-auto">
            <div className="p-3 sm:p-4">
              <p className="text-xs text-gray-500 mb-2">Sections</p>
              <div className="space-y-1">
                {sections.map((sec) => (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSectionId(sec.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border ${
                      activeSectionId === sec.id ? "bg-indigo-50 border-indigo-300" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="font-medium">{sec.name}</span>
                  </button>
                ))}
                {!sections.length && <p className="text-sm text-gray-500">No sections found.</p>}
              </div>
            </div>
          </div>

          {/* Students */}
          <div className="max-h-[65vh] overflow-auto">
            <div className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-gray-500">Students in section</p>
                <button
                  onClick={toggleSectionAll}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-gray-50 whitespace-nowrap"
                  disabled={!students.length}
                >
                  {sectionAllChecked ? "Unselect all" : "Select all"}
                  <CheckIcon className={`w-4 h-4 ${sectionSomeChecked ? "opacity-60" : ""}`} />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {students.map((st) => {
                  const checked = selected.has(st.id);
                  const displayName =
                    [st.last_name, st.first_name].filter(Boolean).join(", ") || "Unnamed";
                  return (
                    <label
                      key={st.id}
                      className={`flex items-center gap-3 p-2 border rounded-xl cursor-pointer ${
                        checked ? "bg-indigo-50 border-indigo-300" : "hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-indigo-600"
                        checked={checked}
                        onChange={() => toggleOne(st.id)}
                      />
                      <UserIcon className="w-5 h-5 text-gray-500" />
                      <span className="truncate">{displayName}</span>
                      <span className="ml-auto text-xs text-gray-400">{st.section_name}</span>
                    </label>
                  );
                })}

                {!students.length && (
                  <div className="col-span-full text-sm text-gray-500 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4" />
                    No students in this section.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 border-t bg-white">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={loading}
            className="px-3 sm:px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPickOnly ? "Use selection" : "Save access"}
          </button>
        </div>
      </div>
    </div>
  );
}
<<<<<<< HEAD

=======
>>>>>>> a949144 (feat: ManageAssignmentAccessModal + assignment/notification UI updates)
