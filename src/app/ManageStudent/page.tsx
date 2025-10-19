"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AddStudentModal from "../components/AddStudentModal";
import UpdateStudentModal from "../components/UpdateStudentModal";
import DeleteStudentModal from "../components/DeleteStudentModal";
import BackButton from "@/app/components/BackButton";
import {
  UserPlusIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  PencilSquareIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

interface Student {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  lrn: string;
  username: string;
  password: string;
  section_id: number | null;
  section_name: string;
  teacher_id: string;
  profile_picture_url?: string | null; // storage key or full URL
}

interface SectionGroup {
  sectionName: string;
  students: Student[];
}

function initials(s: Student) {
  const a = s.first_name?.[0] ?? "";
  const b = s.last_name?.[0] ?? "";
  return (a + b).toUpperCase();
}

function resolveAvatarUrl(key?: string | null) {
  if (!key) return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  const { data } = supabase.storage.from("teacher-avatars").getPublicUrl(key);
  return data?.publicUrl ?? null;
}

export default function ManageStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [groupedStudents, setGroupedStudents] = useState<SectionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);

  // filters / ui
  const [sectionFilter, setSectionFilter] = useState<string>("__ALL__"); // kept for parity
  const [query, setQuery] = useState("");

  // session → teacherId
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setError(error.message);
        return;
      }
      const uid = data?.session?.user?.id ?? null;
      setTeacherId(uid);
    })();
  }, []);

  // fetch
  const fetchStudents = async () => {
    if (!teacherId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("students")
        .select(
          `
          id, first_name, middle_name, last_name, lrn, username, password, section_id, teacher_id, profile_picture_url,
          section:sections(name)
        `
        )
        .eq("teacher_id", teacherId)
        .order("section_id", { ascending: true, nullsFirst: true })
        .order("last_name", { ascending: true });

      if (error) throw error;

      const mapped: Student[] = (data ?? []).map((s: any) => ({
        id: s.id,
        first_name: s.first_name,
        middle_name: s.middle_name ?? null,
        last_name: s.last_name,
        lrn: s.lrn,
        username: s.username,
        password: s.password,
        section_id: s.section_id,
        section_name: s.section?.name ?? "Unknown",
        teacher_id: s.teacher_id,
        profile_picture_url: s.profile_picture_url ?? null,
      }));

      setStudents(mapped);

      const bySection: Record<string, Student[]> = {};
      for (const st of mapped) {
        const key = st.section_name || "Unknown";
        if (!bySection[key]) bySection[key] = [];
        bySection[key].push(st);
      }
      const grouped: SectionGroup[] = Object.entries(bySection).map(
        ([sectionName, students]) => ({ sectionName, students })
      );
      setGroupedStudents(grouped);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch students.");
    } finally {
      setLoading(false);
    }
  };

  // initial + realtime
  useEffect(() => {
    if (!teacherId) return;
    fetchStudents();

    const channel = supabase
      .channel(`students:${teacherId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students", filter: `teacher_id=eq.${teacherId}` },
        () => fetchStudents()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  // section options & filtering
  const sectionOptions = useMemo(() => {
    const s = new Set(groupedStudents.map((g) => g.sectionName));
    return ["__ALL__", ...Array.from(s).sort()];
  }, [groupedStudents]);

  const visibleGroups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const base =
      sectionFilter === "__ALL__"
        ? groupedStudents
        : groupedStudents.filter((g) => g.sectionName === sectionFilter);

    if (!term) return base;

    return base
      .map((g) => ([
        g.sectionName,
        g.students.filter(
          (s) =>
            s.first_name.toLowerCase().includes(term) ||
            s.last_name.toLowerCase().includes(term) ||
            (s.middle_name ?? "").toLowerCase().includes(term) ||
            s.username.toLowerCase().includes(term) ||
            s.lrn.toLowerCase().includes(term)
        ),
      ] as const))
      .filter(([, arr]) => arr.length > 0)
      .map(([sectionName, arr]) => ({ sectionName, students: arr }));
  }, [groupedStudents, sectionFilter, query]);

  // helpers: modals
  const openAddModal = () => setShowAddModal(true);
  const openUpdateModal = (student: Student) => {
    setSelectedStudent(student);
    setShowUpdateModal(true);
  };
  const openDeleteModal = (student: Student) => {
    setSelectedStudent(student);
    setShowDeleteModal(true);
  };
  const closeAllModals = () => {
    setShowAddModal(false);
    setShowUpdateModal(false);
    setShowDeleteModal(false);
    setSelectedStudent(null);
  };

  // CSV export (current filtered set). Columns: lrn,password
  const exportCsv = () => {
    // flatten
    const rows = visibleGroups.flatMap((g) => g.students);
    const header = ["lrn", "password"];
    const lines = [header.join(",")];

    for (const s of rows) {
      const cols = [s.lrn ?? "", s.password ?? ""].map((v) =>
        `"${String(v).replace(/"/g, '""')}"`
      );
      lines.push(cols.join(","));
    }

    const csv = lines.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `students_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // skeleton
  const Skeleton = () => (
    <div className="space-y-6">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-xl border bg-white/60 shadow-sm p-4 animate-pulse"
        >
          <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
          <div className="h-10 w-full bg-gray-200 rounded mb-2" />
          <div className="h-10 w-full bg-gray-200 rounded mb-2" />
          <div className="h-10 w-2/3 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen p-6 md:p-8 overflow-x-hidden">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header / Toolbar */}
        <div className="rounded-xl border bg-white/70 backdrop-blur-md shadow-sm px-4 sm:px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-nowrap">
            {/* Left: title + count */}
            <div className="flex items-center gap-3">
              <BackButton />
              <h1 className="text-xl font-semibold text-gray-800 whitespace-nowrap">
                Manage Students
              </h1>
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                <UsersIcon className="h-4 w-4" />
                {students.length}
              </span>
            </div>

            {/* Right: search + buttons */}
            <div className="sm:ml-auto grid w-full sm:w-auto grid-cols-1 sm:auto-cols-max sm:grid-flow-col items-center gap-2 sm:gap-3">
              {/* Search */}
              <div className="relative w-full sm:w-72 md:w-80 lg:w-96 min-w-0">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-5 w-5 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, LRN, username…"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Refresh */}
              <button
                onClick={fetchStudents}
                className="inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                title="Refresh"
              >
                <ArrowPathIcon className="h-5 w-5" />
                Refresh
              </button>

              {/* Export CSV */}
              <button
                onClick={exportCsv}
                className="inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                title="Export CSV (LRN & Password)"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
                Export CSV
              </button>

              {/* Add */}
              <button
                onClick={openAddModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
              >
                <UserPlusIcon className="h-5 w-5" />
                Add Student
              </button>
            </div>
          </div>
        </div>

        {/* States */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {loading ? (
          <Skeleton />
        ) : visibleGroups.length === 0 ? (
          <div className="rounded-xl border bg-white/60 shadow-sm p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
              <UsersIcon className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">
              No students found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Try a different section or clear the search.
            </p>
            <div className="mt-4">
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <UserPlusIcon className="h-5 w-5" />
                Add your first student
              </button>
            </div>
          </div>
        ) : (
          visibleGroups.map((group) => (
            <section key={group.sectionName} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">
                  {group.sectionName}
                  <span className="ml-2 text-sm text-gray-500 font-normal">
                    ({group.students.length})
                  </span>
                </h2>
              </div>

              {/* Card list on small screens */}
              <div className="grid gap-3 md:hidden">
                {group.students.map((s) => {
                  const avatar = resolveAvatarUrl(s.profile_picture_url);
                  return (
                    <div
                      key={s.id}
                      className={`w-full max-w-full min-w-0 rounded-xl border bg-white/60 shadow-sm p-3 flex items-center gap-3 hover:border-blue-300 ${selectedStudent?.id === s.id ? "ring-2 ring-blue-500 ring-inset" : ""}`}
                      onClick={() => setSelectedStudent(s)}
                    >
                      <div
                        className="h-10 w-10 rounded-full grid place-items-center font-semibold shrink-0 overflow-hidden bg-blue-600/10 text-blue-700"
                        title={`${s.last_name}, ${s.first_name}`}
                      >
                        {avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatar}
                            alt={`${s.first_name} ${s.last_name}`}
                            className="h-10 w-10 object-cover"
                          />
                        ) : (
                          <span>{initials(s)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">
                          {s.last_name}, {s.first_name}{" "}
                          {s.middle_name ? s.middle_name[0] + "." : ""}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          LRN: {s.lrn} · Username: {s.username}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openUpdateModal(s);
                          }}
                          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 py-2 text-gray-700 hover:bg-gray-50"
                          title="Update"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteModal(s);
                          }}
                          className="inline-flex items-center justify-center rounded-md border border-red-300 bg-white px-2.5 py-2 text-red-600 hover:bg-red-50"
                          title="Delete"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table on md+ */}
              <div className="hidden md:block overflow-hidden rounded-xl border bg-white/60 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr className="text-gray-600">
                        <th className="px-4 py-3 font-semibold">Student</th>
                        <th className="px-4 py-3 font-semibold">Middle</th>
                        <th className="px-4 py-3 font-semibold">LRN/USERNAME</th>
                        <th className="px-4 py-3 font-semibold">Section</th>
                        <th className="px-4 py-3 font-semibold">Password</th>
                        <th className="px-4 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {group.students.map((s) => {
                        const avatar = resolveAvatarUrl(s.profile_picture_url);
                        return (
                          <tr
                            key={s.id}
                            className={`hover:bg-blue-50/40 ${selectedStudent?.id === s.id ? "bg-blue-50/60" : ""}`}
                            onClick={() => setSelectedStudent(s)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="h-9 w-9 rounded-full grid place-items-center font-semibold text-sm overflow-hidden bg-blue-600/10 text-blue-700"
                                  title={`${s.last_name}, ${s.first_name}`}
                                >
                                  {avatar ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={avatar}
                                      alt={`${s.first_name} ${s.last_name}`}
                                      className="h-9 w-9 object-cover"
                                    />
                                  ) : (
                                    <span>{initials(s)}</span>
                                  )}
                                </div>
                                <div className="leading-5">
                                  <div className="font-medium text-gray-900">
                                    {s.last_name}, {s.first_name}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-700">{s.middle_name || "-"}</td>
                            <td className="px-4 py-3 text-gray-700">
                              <div className="flex flex-col">
                                <span className="tabular-nums">{s.lrn}</span>
                                <span className="text-xs text-gray-500">{s.username}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
                                {s.section_name}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700">{s.password}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openUpdateModal(s);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                                >
                                  <PencilSquareIcon className="h-5 w-5" />
                                  Edit
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDeleteModal(s);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-red-600 hover:bg-red-50 whitespace-nowrap"
                                >
                                  <TrashIcon className="h-5 w-5" />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ))
        )}

        {/* Modals */}
        {showAddModal && teacherId && (
          <AddStudentModal
            closeModal={closeAllModals}
            teacherId={teacherId}
            onStudentAdded={fetchStudents}
          />
        )}
        {showUpdateModal && selectedStudent && (
          <UpdateStudentModal
            closeModal={closeAllModals}
            student={selectedStudent as any}
            onStudentUpdated={fetchStudents}
          />
        )}
        {showDeleteModal && selectedStudent && (
          <DeleteStudentModal
            closeModal={closeAllModals}
            student={selectedStudent}
            onStudentDeleted={fetchStudents}
          />
        )}
      </div>
    </div>
  );
}
