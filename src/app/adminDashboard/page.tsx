"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminAddStudentModal from "@/app/components/admin/AdminAddStudentModal";
import AdminEditTeacherModal, {
  AdminEditTeacher,
} from "@/app/components/admin/AdminEditTeacherModal";
import UpdateStudentModal from "@/app/components/UpdateStudentModal";
import DeleteStudentModal from "@/app/components/DeleteStudentModal";
import {
  UserPlusIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  IdentificationIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
  UserGroupIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

/* ----------------------------- Types ----------------------------- */
type TeacherRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  created_at: string | null;
  profile_picture_url: string | null; // <-- added
};

type SectionRow = { id: number; name: string };

type StudentRow = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  lrn: string | null;
  username: string | null;
  password: string | null;
  teacher_id: string | null;
  section_id: number | null;
  created_at: string | null;
  profile_picture_url: string | null; // <-- added
};

/** Shape expected by UpdateStudentModal */
type ModalStudent = {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  lrn: string;
  section_id: number;
  section_name: string;
  username: string;
  password: string;
};

/* ----------------------------- Helpers ----------------------------- */
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const strongEnough = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
const nameFrom = (a?: string | null, b?: string | null, c?: string | null) =>
  [a, b, c].filter(Boolean).join(" ").trim() || "—";
const initials = (full?: string) => {
  const s = (full || "").trim();
  if (!s) return "??";
  const parts = s.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : (parts[0]?.[1] ?? "");
  return (first + last).toUpperCase();
};

/* ================================ COMPONENT ================================ */

export default function AdminDashboard() {
  /* ----------------------------- Form state ----------------------------- */
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showTeacherPw, setShowTeacherPw] = useState(false); // <-- added

  /* ----------------------------- UI state ----------------------------- */
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  /* delete teacher modal */
  const [deleting, setDeleting] = useState<TeacherRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteAuth, setDeleteAuth] = useState(true);

  /* ----------------------------- Data state ----------------------------- */
  const [adminId, setAdminId] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [sections, setSections] = useState<SectionRow[]>([]);

  /* Filters */
  const [filterTeacher, setFilterTeacher] = useState<string>("");
  const [filterSection, setFilterSection] = useState<number | "">("");
  const [search, setSearch] = useState("");

  /* Modals */
  const [openAddStudent, setOpenAddStudent] = useState(false);
  const [editingStudent, setEditingStudent] = useState<ModalStudent | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<StudentRow | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<AdminEditTeacher | null>(null);

  /* ----------------------------- Bootstrap ----------------------------- */
  useEffect(() => {
    (async () => {
      setErr(null);

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      const user = auth?.user;

      if (authErr) {
        setErr(authErr.message);
        return;
      }
      if (!user) {
        setErr("Not authenticated.");
        return;
      }

      // Verify admin
      const { data: admin, error: adminErr } = await supabase
        .from("admins")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (adminErr) {
        setErr(adminErr.message);
        return;
      }
      if (!admin) {
        setErr("You are not admin.");
        return;
      }

      setAdminId(user.id);
      await Promise.all([loadTeachers(user.id), loadSections(), loadStudents()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------- Load teachers ----------------------------- */
  const loadTeachers = useCallback(
    async (aid?: string) => {
      const adminKey = aid ?? adminId;
      if (!adminKey) return;

      setLoadingTeachers(true);
      setErr(null);

      const { data, error } = await supabase
        .from("teachers")
        .select(
          "id, created_at, email, first_name, middle_name, last_name, admin_id, profile_picture_url" // <-- added
        )
        .eq("admin_id", adminKey)
        .order("created_at", { ascending: false });

      if (error) {
        setErr(error.message);
        setLoadingTeachers(false);
        return;
      }

      const normalized: TeacherRow[] = (data || []).map((row: any) => ({
        id: row.id,
        created_at: row.created_at,
        email: row.email ?? null,
        first_name: row.first_name ?? null,
        middle_name: row.middle_name ?? null,
        last_name: row.last_name ?? null,
        profile_picture_url: row.profile_picture_url ?? null, // <-- added
      }));

      setTeachers(normalized);
      setLoadingTeachers(false);
    },
    [adminId]
  );

  /* ----------------------------- Load sections ----------------------------- */
  const loadSections = useCallback(async () => {
    const { data, error } = await supabase.from("sections").select("id,name").order("name");
    if (error) {
      setErr(error.message);
      return;
    }
    setSections((data ?? []) as SectionRow[]);
  }, []);

  /* ----------------------------- Load students ----------------------------- */
  const loadStudents = useCallback(async () => {
    setLoadingStudents(true);
    setErr(null);

    let query = supabase
      .from("students")
      .select(
        "id, first_name, middle_name, last_name, lrn, username, password, teacher_id, section_id, created_at, profile_picture_url" // <-- added
      )
      .order("created_at", { ascending: false });

    if (filterTeacher) query = query.eq("teacher_id", filterTeacher);
    if (filterSection) query = query.eq("section_id", filterSection);

    const term = search.trim();
    if (term) {
      const like = `%${term}%`;
      query = query.or(
        `first_name.ilike.${like},last_name.ilike.${like},lrn.ilike.${like},username.ilike.${like}`
      );
    }

    const { data, error } = await query;
    if (error) {
      setErr(error.message);
      setLoadingStudents(false);
      return;
    }
    setStudents((data ?? []) as StudentRow[]);
    setLoadingStudents(false);
  }, [filterTeacher, filterSection, search]);

  /* Debounce search */
  useEffect(() => {
    const id = setTimeout(() => {
      loadStudents();
    }, 300);
    return () => clearTimeout(id);
  }, [search, filterTeacher, filterSection, loadStudents]);

  /* ----------------------------- Create teacher ----------------------------- */
  const createTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminId) {
      setErr("Admin not verified. Please refresh.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!validEmail(normalizedEmail)) {
      setErr("Please enter a valid email address.");
      return;
    }
    if (!strongEnough(password)) {
      setErr("Password should be at least 8 characters and include letters & numbers.");
      return;
    }
    if (!firstName || !lastName) {
      setErr("First name and last name are required.");
      return;
    }

    setBusy(true);
    setMsg(null);
    setErr(null);

    try {
      const res = await fetch("/api/admin/create-teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminId,
          email: normalizedEmail,
          password,
          firstName,
          middleName: middleName || null,
          lastName,
        }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(j?.error || `Failed to create teacher (HTTP ${res.status})`);
      } else {
        setMsg("Teacher account created ✅");
        setEmail("");
        setPassword("");
        setFirstName("");
        setMiddleName("");
        setLastName("");
        await loadTeachers();
      }
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  /* ----------------------------- Delete teacher ----------------------------- */
  const handleDelete = async () => {
    if (!adminId || !deleting) return;
    setDeletingBusy(true);
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch("/api/admin/delete-teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminId,
          teacherId: deleting.id,
          deleteAuth,
        }),
      });
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(j?.error || `Failed to delete teacher (HTTP ${res.status})`);
      } else {
        setMsg(`Deleted ${deleting.first_name ?? ""} ${deleting.last_name ?? ""} successfully.`);
        setDeleting(null);
        await loadTeachers();
        await loadStudents();
      }
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
    } finally {
      setDeletingBusy(false);
    }
  };

  const teacherCount = useMemo(() => teachers.length, [teachers]);
  const studentCount = useMemo(() => students.length, [students]);

  /* Quick maps for display */
  const teacherName = useCallback(
    (id?: string | null) => {
      if (!id) return "—";
      const t = teachers.find((x) => x.id === id);
      if (!t) return id;
      const n = nameFrom(t.first_name, t.middle_name, t.last_name);
      return n || t.email || id;
    },
    [teachers]
  );

  const sectionName = useCallback(
    (id?: number | null) => {
      if (!id) return "—";
      const s = sections.find((x) => x.id === id);
      return s?.name ?? String(id);
    },
    [sections]
  );

  /* Map StudentRow -> ModalStudent for editing */
  const toModalStudent = useCallback(
    (row: StudentRow): ModalStudent => ({
      id: row.id,
      first_name: row.first_name ?? "",
      middle_name: row.middle_name ?? "",
      last_name: row.last_name ?? "",
      lrn: row.lrn ?? "",
      section_id: row.section_id ?? 0,
      section_name: sectionName(row.section_id) || "",
      username: row.username ?? (row.lrn ?? ""),
      password: row.password ?? "",
    }),
    [sectionName]
  );

  /* ----------------------------- Render ----------------------------- */
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        {/* Page Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">Manage teacher and student accounts.</p>
        </header>

        {/* Alerts */}
        <div className="space-y-2" aria-live="polite">
          {err && (
            <div
              className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700"
              role="alert"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm">{err}</p>
            </div>
          )}
          {msg && (
            <div
              className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700"
              role="status"
            >
              <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm">{msg}</p>
            </div>
          )}
        </div>

        {/* Create Teacher */}
        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/60 px-5 py-3">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/10 ring-1 ring-indigo-600/20">
                <UserPlusIcon className="h-5 w-5 text-indigo-700" />
              </span>
              <h2 className="text-lg font-medium text-slate-900">Create Teacher</h2>
            </div>
          </div>

          <form onSubmit={createTeacher} className="space-y-5 px-5 py-5">
            {/* Row 1 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Teacher Email" htmlFor="t-email" icon={<EnvelopeIcon className="h-5 w-5" />}>
                <input
                  id="t-email"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                  placeholder="e.g., teacher@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                />
              </Field>

              <Field label="Temporary Password" htmlFor="t-pass">
                <input
                  id="t-pass"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-16 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                  placeholder="Minimum 8 chars, letters & numbers"
                  type={showTeacherPw ? "text" : "password"}  // <-- toggles
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                {/* Show/Hide button (absolute inside Field's relative wrapper) */}
                <button
                  type="button"
                  onClick={() => setShowTeacherPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100"
                  aria-label={showTeacherPw ? "Hide password" : "Show password"}
                  title={showTeacherPw ? "Hide password" : "Show password"}
                >
                  {showTeacherPw ? "Hide" : "Show"}
                </button>
              </Field>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="First Name" htmlFor="t-first" icon={<IdentificationIcon className="h-5 w-5" />}>
                <input
                  id="t-first"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                />
              </Field>

              <Field label="Middle Name (optional)" htmlFor="t-middle">
                <input
                  id="t-middle"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                  placeholder="Middle name"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  autoComplete="additional-name"
                />
              </Field>

              <Field label="Last Name" htmlFor="t-last">
                <input
                  id="t-last"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                />
              </Field>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 gap-3 sm:auto-cols-max sm:grid-flow-col">
              <button
                disabled={
                  busy || !validEmail(email) || !strongEnough(password) || !firstName || !lastName
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
              >
                {busy ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create Teacher"
                )}
              </button>
              <p className="min-w-0 self-center text-xs text-slate-500 truncate">
                Use a strong temporary password (8+ chars, letters & numbers).
              </p>
            </div>
          </form>
        </section>

        {/* Teachers List */}
        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/60 px-5 py-3">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600/10 ring-1 ring-sky-600/20">
                <ClipboardDocumentListIcon className="h-5 w-5 text-sky-700" />
              </span>
              <h2 className="text-lg font-medium text-slate-900">
                Teachers <span className="text-slate-400">({teacherCount})</span>
              </h2>
            </div>
          </div>

          <div className="px-5 py-4" aria-busy={loadingTeachers}>
            {loadingTeachers ? (
              <div className="space-y-2">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : teachers.length === 0 ? (
              <EmptyState
                title="No teachers yet"
                desc="Create your first teacher account using the form above."
              />
            ) : (
              <ul className="divide-y divide-slate-200">
                {teachers.map((t) => {
                  const display = nameFrom(t.first_name, t.middle_name, t.last_name) || t.email || "—";
                  return (
                    <li
                      key={t.id}
                      className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr,auto] sm:items-center"
                    >
                      {/* TEXT + AVATAR */}
                      <div className="min-w-0 flex items-center gap-3">
                        <Avatar url={t.profile_picture_url ?? undefined} name={display} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{display}</p>
                          <p
                            className="truncate text-sm text-slate-500"
                            title={t.email ?? undefined}
                            aria-label={t.email ?? undefined}
                          >
                            {t.email}
                          </p>
                        </div>
                      </div>

                      {/* ACTIONS */}
                      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                        <button
                          onClick={() =>
                            setEditingTeacher({
                              id: t.id,
                              email: t.email,
                              first_name: t.first_name,
                              middle_name: t.middle_name,
                              last_name: t.last_name,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 whitespace-nowrap"
                          title="Edit teacher (names & password)"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                          Edit
                        </button>

                        <button
                          onClick={() => setDeleting(t)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 whitespace-nowrap"
                          title="Delete teacher"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Students Panel */}
        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          {/* Heading */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/60 px-5 py-3">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10 ring-1 ring-emerald-600/20">
                <UserGroupIcon className="h-5 w-5 text-emerald-700" />
              </span>
              <h2 className="text-lg font-medium text-slate-900">
                Students <span className="text-slate-400">({studentCount})</span>
              </h2>
            </div>
          </div>

          {/* Toolbar */}
          <div className="px-5 py-4">
            <div className="mb-4 grid items-center grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[16rem,16rem,1fr,auto]">
              {/* Teacher filter */}
              <div className="relative">
                <label htmlFor="filter-teacher" className="sr-only">
                  Teacher
                </label>
                <AcademicCapIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                <select
                  id="filter-teacher"
                  value={filterTeacher}
                  onChange={(e) => setFilterTeacher(e.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 focus:border-blue-500 focus:ring-2"
                  title="Filter by Teacher"
                >
                  <option value="">All teachers</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {teacherName(t.id)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section filter */}
              <div className="relative">
                <label htmlFor="filter-section" className="sr-only">
                  Section
                </label>
                <AcademicCapIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                <select
                  id="filter-section"
                  value={filterSection}
                  onChange={(e) => setFilterSection(e.target.value ? Number(e.target.value) : "")}
                  className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 focus:border-blue-500 focus:ring-2"
                  title="Filter by Section"
                >
                  <option value="">All sections</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search (fluid) */}
              <div className="relative min-w-0">
                <label htmlFor="student-search" className="sr-only">
                  Search
                </label>
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                <input
                  id="student-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or LRN…"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                />
              </div>

              {/* Create student */}
              <button
                onClick={() => setOpenAddStudent(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 sm:w-auto whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <UserPlusIcon className="h-4 w-4" />
                Create Student
              </button>
            </div>

            {/* List */}
            {loadingStudents ? (
              <div className="space-y-2" aria-busy="true">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : students.length === 0 ? (
              <EmptyState
                title="No students found"
                desc="Try adjusting filters or add a new student."
              />
            ) : (
              <ul className="divide-y divide-slate-200">
                {students.map((s) => {
                  const display = nameFrom(s.first_name, s.middle_name, s.last_name);
                  return (
                    <li key={s.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0 flex items-center gap-3">
                        <Avatar url={s.profile_picture_url ?? undefined} name={display} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{display}</p>
                          <p className="text-sm text-slate-600">
                            LRN: <span className="font-mono">{s.lrn}</span> · Password:{" "}
                            <span className="font-mono">{s.password ?? "—"}</span>
                          </p>
                          <p className="text-xs text-slate-500">
                            Teacher: {teacherName(s.teacher_id)} · Section: {sectionName(s.section_id)}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => setEditingStudent(toModalStudent(s))}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          title="Edit student"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingStudent(s)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                          title="Delete student"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Delete TEACHER modal */}
      {deleting && (
        <ConfirmDeleteModal
          teacher={deleting}
          deleteAuth={deleteAuth}
          setDeleteAuth={setDeleteAuth}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
          busy={deletingBusy}
        />
      )}

      {/* Add STUDENT modal */}
      {openAddStudent && (
        <AdminAddStudentModal
          closeModal={() => setOpenAddStudent(false)}
          onStudentAdded={() => {
            setOpenAddStudent(false);
            loadStudents();
          }}
        />
      )}

      {/* Edit STUDENT modal */}
      {editingStudent && (
        <UpdateStudentModal
          closeModal={() => setEditingStudent(null)}
          student={editingStudent}
          onStudentUpdated={() => {
            setEditingStudent(null);
            loadStudents();
          }}
        />
      )}

      {/* Delete STUDENT modal */}
      {deletingStudent && (
        <DeleteStudentModal
          closeModal={() => setDeletingStudent(null)}
          student={{
            id: deletingStudent.id,
            first_name: deletingStudent.first_name ?? "",
            last_name: deletingStudent.last_name ?? "",
          }}
          onStudentDeleted={() => {
            setDeletingStudent(null);
            loadStudents();
          }}
        />
      )}

      {/* Edit TEACHER modal */}
      {editingTeacher && (
        <AdminEditTeacherModal
          teacher={editingTeacher}
          onClose={() => setEditingTeacher(null)}
          onUpdated={async () => {
            setEditingTeacher(null);
            await loadTeachers();
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- UI bits --------------------------------- */

function Field({
  label,
  htmlFor,
  icon,
  children,
}: {
  label: string;
  htmlFor: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            {icon}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

function EmptyState({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <ClipboardDocumentListIcon className="mb-2 h-6 w-6 text-slate-400" />
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {desc && <p className="mt-1 max-w-sm text-xs text-slate-500">{desc}</p>}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="w-2/3">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-2 w-24 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-6 w-24 animate-pulse rounded bg-slate-200" />
      </div>
    </div>
  );
}

/** Modal uses: scrollable overlay, panel with max-height & sticky header/footer */
function ConfirmDeleteModal({
  teacher,
  deleteAuth,
  setDeleteAuth,
  onCancel,
  onConfirm,
  busy,
}: {
  teacher: TeacherRow;
  deleteAuth: boolean;
  setDeleteAuth: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-teacher-title"
    >
      <div className="mx-auto my-8 w-full max-w-md">
        <div className="max-h-[85dvh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600/10">
                <ExclamationTriangleIcon className="h-5 w-5 text-rose-600" />
              </span>
              <h3 id="delete-teacher-title" className="text-base font-semibold text-slate-900">
                Delete Teacher
              </h3>
            </div>
            <button
              onClick={onCancel}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="grow overflow-y-auto px-5 py-4 text-sm text-slate-700">
            <p>
              This will remove{" "}
              <span className="font-medium text-slate-900">
                {nameFrom(teacher.first_name, teacher.middle_name, teacher.last_name)}
              </span>{" "}
              ({teacher.email}). Quarters linked to this teacher will be deleted first.
            </p>

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={deleteAuth}
                onChange={(e) => setDeleteAuth(e.target.checked)}
              />
              Also delete the teacher’s Auth user & profile
            </label>
          </div>

          {/* Sticky footer */}
          <div className="sticky bottom-0 z-10 grid grid-cols-1 gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 sm:auto-cols-max sm:grid-flow-col">
            <button
              onClick={onCancel}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-60"
              disabled={busy}
            >
              {busy ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <TrashIcon className="h-4 w-4" />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Simple avatar with initials fallback */
function Avatar({
  url,
  name,
  sizeClass = "h-9 w-9",
}: {
  url?: string;
  name?: string;
  sizeClass?: string;
}) {
  const label = name || "User avatar";
  if (url) {
    return (
      <img
        src={url}
        alt={label}
        loading="lazy"
        className={`${sizeClass} rounded-full object-cover ring-1 ring-slate-200`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} select-none rounded-full bg-slate-200 ring-1 ring-slate-200 grid place-items-center`}
      aria-label={label}
      title={label}
    >
      <span className="text-[11px] font-semibold text-slate-600">{initials(label)}</span>
    </div>
  );
}
