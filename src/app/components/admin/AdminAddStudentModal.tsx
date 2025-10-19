"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  XMarkIcon,
  UserPlusIcon,
  AcademicCapIcon,
  IdentificationIcon,
  AtSymbolIcon,
  ClipboardIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

/* ----------------------------- Types ----------------------------- */
type SectionRow = { id: number; name: string };

type TeacherRow = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
};

interface Props {
  closeModal: () => void;
  onStudentAdded: () => void; // refresh parent list
}

const CREATE_STUDENT_URL = "/api/admin/create-student";

/* ----------------------------- Helpers ----------------------------- */
function genTempPassword(length = 10) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  const buf = new Uint32Array(length);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 1e9);
  }
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join("");
}

function csvSplitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const headerMap: Record<string, string> = {
  "first name": "first_name",
  firstname: "first_name",
  first_name: "first_name",
  "last name": "last_name",
  lastname: "last_name",
  last_name: "last_name",
  "middle name": "middle_name",
  middlename: "middle_name",
  middle_name: "middle_name",
  lrn: "lrn",
  "section name": "section",
  section: "section",
  section_id: "section_id",
};

function normalizeHeader(h: string) {
  const k = h.trim().toLowerCase().replace(/\s+/g, " ");
  return headerMap[k] ?? k;
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = csvSplitLine(lines[0]).map(normalizeHeader);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = csvSplitLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================ Component ============================ */
export default function AdminAddStudentModal({ closeModal, onStudentAdded }: Props) {
  /* -------------------------- Shared state -------------------------- */
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // tabs
  const [mode, setMode] = useState<"single" | "bulk">("single");

  // selections
  const [teacherId, setTeacherId] = useState<string>("");

  // single form
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [lrn, setLrn] = useState("");
  const [sectionId, setSectionId] = useState<number | "">("");

  const [loading, setLoading] = useState(false);
  const [createdLRN, setCreatedLRN] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // bulk form
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [bulkDefaultSectionId, setBulkDefaultSectionId] = useState<number | "">("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkSuccess, setBulkSuccess] = useState(0);
  const [bulkFailed, setBulkFailed] = useState(0);
  const [bulkResults, setBulkResults] = useState<
    { lrn: string; password?: string; status: "created" | "failed"; error?: string }[]
  >([]);
  const [bulkJustFinished, setBulkJustFinished] = useState(false);

  /* -------------------------- fetch dropdowns -------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const [{ data: teacherRows, error: tErr }, { data: sectionRows, error: sErr }] =
          await Promise.all([
            supabase
              .from("teachers")
              .select("id, first_name, middle_name, last_name, email")
              .order("last_name", { ascending: true }),
            supabase.from("sections").select("id,name").order("name", { ascending: true }),
          ]);

        if (tErr) setError(tErr.message);
        else setTeachers((teacherRows ?? []) as TeacherRow[]);

        if (sErr) setError(sErr.message);
        else setSections((sectionRows ?? []) as SectionRow[]);
      } catch (e: any) {
        setError(e?.message || "Failed to load lists.");
      } finally {
        setListsLoading(false);
      }
    })();
  }, []);

  const teacherLabel = (t: TeacherRow) => {
    const name = [t.first_name, t.middle_name, t.last_name].filter(Boolean).join(" ");
    return name || t.email || t.id;
  };

  /* ------------------------------ Single add ------------------------------ */
  const handleAddStudent = async () => {
    setLoading(true);
    setError(null);

    const clean = {
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      lrn: lrn.trim(),
    };

    if (!teacherId) {
      setError("Please select a teacher.");
      setLoading(false);
      return;
    }
    if (!clean.firstName || !clean.lastName || !clean.lrn) {
      setError("Please complete first name, last name, and LRN.");
      setLoading(false);
      return;
    }
    if (!sectionId) {
      setError("Please select a section.");
      setLoading(false);
      return;
    }

    const clientTempPassword = genTempPassword(10);
    const payload = {
      teacherId,
      lrn: clean.lrn,
      firstName: clean.firstName,
      middleName: clean.middleName || null,
      lastName: clean.lastName,
      sectionId, // number (int8)
      password: clientTempPassword,
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? null;

      const res = await fetch(CREATE_STUDENT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Unexpected response (HTTP ${res.status}).`);
      }

      if (!res.ok) {
        const msg = json?.error || "Failed to create student.";
        setError(`[${res.status}] ${msg}`);
        return;
      }

      const pw = json?.password || clientTempPassword;
      setCreatedLRN(clean.lrn);
      setTempPassword(pw);
      // Keep modal open; don't call onStudentAdded yet.
    } catch (e: any) {
      setError(e?.message || "Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleSingleDone = () => {
    onStudentAdded(); // refresh parent list
    closeModal();     // explicitly close
  };

  const handleAddAnother = () => {
    setCreatedLRN(null);
    setTempPassword(null);
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setLrn("");
    setSectionId("");
    setError(null);
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {}
  };

  /* ------------------------------ Bulk add ------------------------------ */
  const sectionByName = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sections) map[s.name.toLowerCase()] = s.id;
    return map;
  }, [sections]);

  const totalRows = csvRows.length;
  const bulkProgressPct = totalRows === 0 ? 0 : Math.round((bulkDone / totalRows) * 100);

  const handlePickCsv = async (file?: File | null) => {
    if (!teacherId) {
      setError("Please select a teacher first, then choose a CSV.");
      setCsvFile(null);
      setCsvRows([]);
      return;
    }

    setCsvFile(file ?? null);
    setCsvRows([]);
    setBulkResults([]);
    setBulkDone(0);
    setBulkSuccess(0);
    setBulkFailed(0);
    setBulkJustFinished(false);
    if (!file) return;

    const text = await file.text();
    const rows = parseCsv(text);
    setCsvRows(rows);
    setError(null);
  };

  const resolveSectionId = (row: Record<string, string>): number | null => {
    const sid = row["section_id"]?.trim();
    if (sid && /^\d+$/.test(sid)) return Number(sid);
    const sname = row["section"]?.trim().toLowerCase();
    if (sname && sectionByName[sname]) return sectionByName[sname];
    if (bulkDefaultSectionId) return Number(bulkDefaultSectionId);
    return null;
  };

  const handleStartImport = async () => {
    if (!teacherId) {
      setError("Please select a teacher first.");
      return;
    }
    if (csvRows.length === 0) {
      setError("Please choose a CSV file with at least one row.");
      return;
    }

    setError(null);
    setBulkProcessing(true);
    setBulkResults([]);
    setBulkDone(0);
    setBulkSuccess(0);
    setBulkFailed(0);
    setBulkJustFinished(false);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token ?? null;

    for (const row of csvRows) {
      const firstName = (row["first_name"] || "").trim();
      const lastName = (row["last_name"] || "").trim();
      const middleName = (row["middle_name"] || "").trim();
      const lrn = (row["lrn"] || "").trim();
      const sid = resolveSectionId(row);

      if (!firstName || !lastName || !lrn || !sid) {
        setBulkResults((prev) => [
          ...prev,
          {
            lrn,
            status: "failed",
            error: !sid
              ? "Missing or unknown section (provide 'section' or 'section_id' or choose Default Section)."
              : "Missing required fields (first_name, last_name, lrn).",
          },
        ]);
        setBulkFailed((n) => n + 1);
        setBulkDone((n) => n + 1);
        continue;
      }

      const clientTempPassword = genTempPassword(10);

      try {
        const res = await fetch(CREATE_STUDENT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            teacherId,
            lrn,
            firstName,
            middleName: middleName || null,
            lastName,
            sectionId: sid,
            password: clientTempPassword,
          }),
        });

        const text = await res.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          // ignore parse error; still record below
        }

        if (!res.ok) {
          const msg =
            res.status === 409
              ? json?.error || "Student already exists (LRN conflict)."
              : json?.error || `Failed (HTTP ${res.status}).`;

          setBulkResults((prev) => [...prev, { lrn, status: "failed", error: msg }]);
          setBulkFailed((n) => n + 1);
        } else {
          const pw = json?.password || clientTempPassword;
          setBulkResults((prev) => [...prev, { lrn, password: pw, status: "created" }]);
          setBulkSuccess((n) => n + 1);
          // Do not call onStudentAdded here; keep modal open.
        }
      } catch (e: any) {
        setBulkResults((prev) => [
          ...prev,
          { lrn, status: "failed", error: e?.message || "Network error." },
        ]);
        setBulkFailed((n) => n + 1);
      } finally {
        setBulkDone((n) => n + 1);
        // gentle throttle
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    setBulkProcessing(false);
    setBulkJustFinished(true); // keep modal open and show summary
  };

  const downloadTemplate = () => {
    downloadCsv("students_template.csv", [
      ["first_name", "last_name", "middle_name", "lrn", "section"],
      ["", "", "", "", ""],
    ]);
  };

  const downloadBulkResults = () => {
    if (bulkResults.length === 0) return;
    const rows = [
      ["lrn", "password", "status", "error"],
      ...bulkResults.map((r) => [
        r.lrn ?? "",
        r.password ?? "",
        r.status,
        r.error ?? "",
      ]),
    ];
    downloadCsv("students_import_results.csv", rows);
  };

  const resetBulk = () => {
    setCsvFile(null);
    setCsvRows([]);
    setBulkResults([]);
    setBulkDone(0);
    setBulkSuccess(0);
    setBulkFailed(0);
    setBulkJustFinished(false);
  };

  /* -------------------------------- UI -------------------------------- */
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-add-student-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Panel */}
        <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)]">
          {/* Header (sticky) */}
          <div className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600/10">
                  <UserPlusIcon className="h-5 w-5 text-blue-600" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="admin-add-student-title" className="truncate text-base font-semibold tracking-tight sm:text-lg">
                    Create Student (Admin)
                  </h2>
                  <p className="truncate text-xs text-slate-500">
                    Link students to a teacher and section. Single or Bulk CSV.
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="inline-flex items-center justify-center rounded-lg p-2 text-slate-500 outline-none hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Body (scrollable) */}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            {/* Error banner */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700"
              >
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Teacher selector (required for both modes) */}
            <div className="mb-4">
              <label htmlFor="teacher" className="mb-1 block text-xs font-medium text-slate-700">
                Teacher <span className="text-rose-600">*</span>
              </label>
              {listsLoading ? (
                <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />
              ) : teachers.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No teachers found. Please create a teacher account first.
                </p>
              ) : (
                <select
                  id="teacher"
                  className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 focus:border-blue-500 focus:ring-2"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  disabled={loading || bulkProcessing}
                  aria-required="true"
                >
                  <option value="">Select teacher</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {teacherLabel(t)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Tabs */}
            <div className="mb-4">
              <div role="tablist" aria-label="Add mode" className="inline-flex rounded-xl border bg-slate-50 p-1 text-sm">
                <button
                  role="tab"
                  aria-selected={mode === "single"}
                  onClick={() => setMode("single")}
                  className={`px-3 py-1.5 rounded-lg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    mode === "single" ? "bg-white shadow ring-1 ring-slate-200" : "text-slate-600"
                  }`}
                >
                  Single
                </button>
                <button
                  role="tab"
                  aria-selected={mode === "bulk"}
                  onClick={() => setMode("bulk")}
                  className={`px-3 py-1.5 rounded-lg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    mode === "bulk" ? "bg-white shadow ring-1 ring-slate-200" : "text-slate-600"
                  }`}
                >
                  Bulk CSV
                </button>
              </div>
            </div>

            {/* Mode content */}
            {mode === "single" ? (
              tempPassword ? (
                /* Success card */
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-green-700">
                      <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
                      <p className="text-sm font-medium">Student account created</p>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <KeyIcon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <div className="min-w-0 text-sm">
                          <div className="font-medium">LRN &amp; Password</div>
                          <div className="truncate font-mono text-slate-700">
                            {(createdLRN ?? lrn) || "—"} — {tempPassword}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => copy(`${(createdLRN ?? lrn) || ""} — ${tempPassword}`)}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                      >
                        <ClipboardIcon className="h-4 w-4" aria-hidden="true" />
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Single form grid */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {/* First name */}
                    <div className="relative min-w-0">
                      <label htmlFor="first_name" className="sr-only">
                        First name
                      </label>
                      <IdentificationIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true" />
                      <input
                        id="first_name"
                        type="text"
                        placeholder="First name"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>

                    {/* LRN */}
                    <div className="relative min-w-0">
                      <label htmlFor="lrn" className="sr-only">
                        LRN
                      </label>
                      <AtSymbolIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true" />
                      <input
                        id="lrn"
                        type="text"
                        placeholder="LRN"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                        value={lrn}
                        onChange={(e) => setLrn(e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>

                    {/* Last name */}
                    <div className="min-w-0">
                      <label htmlFor="last_name" className="sr-only">
                        Last name
                      </label>
                      <input
                        id="last_name"
                        type="text"
                        placeholder="Last name"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>

                    {/* Section */}
                    <div className="relative min-w-0">
                      <label htmlFor="section_id" className="sr-only">
                        Section
                      </label>
                      <AcademicCapIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" aria-hidden="true" />
                      {listsLoading ? (
                        <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />
                      ) : sections.length === 0 ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          No sections found. Create a section first.
                        </p>
                      ) : (
                        <select
                          id="section_id"
                          className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 focus:border-blue-500 focus:ring-2"
                          value={sectionId}
                          onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
                          disabled={loading}
                          aria-required="true"
                        >
                          <option value="">Select section</option>
                          {sections.map((sec) => (
                            <option key={sec.id} value={sec.id}>
                              {sec.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Middle name */}
                    <div className="md:col-span-2 min-w-0">
                      <label htmlFor="middle_name" className="sr-only">
                        Middle name (optional)
                      </label>
                      <input
                        id="middle_name"
                        type="text"
                        placeholder="Middle name (optional)"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                        value={middleName}
                        onChange={(e) => setMiddleName(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </>
              )
            ) : (
              /* -------------------------- BULK CSV UI -------------------------- */
              <>
                <div className="space-y-4">
                  <div className="rounded-2xl border p-4">
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <div className="min-w-0 text-sm font-medium text-slate-800">
                        <span className="truncate">
                          Upload CSV —{" "}
                         
                        </span>
                      </div>
                      <div className="justify-self-end">
                        <button
                          onClick={downloadTemplate}
                          className="inline-flex w-full items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                        >
                          <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
                          Template
                        </button>
                      </div>
                    </div>

                    <label
                      className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 hover:bg-slate-100 ${
                        !teacherId ? "cursor-not-allowed opacity-60" : ""
                      }`}
                      title={!teacherId ? "Select a teacher first" : "Choose CSV file"}
                    >
                      <ArrowUpTrayIcon className="h-6 w-6 text-slate-500" aria-hidden="true" />
                      <div className="text-sm text-slate-700">
                        {csvFile ? csvFile.name : "Choose CSV file"}
                      </div>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => handlePickCsv(e.target.files?.[0] ?? null)}
                        disabled={bulkProcessing || !teacherId}
                        aria-disabled={bulkProcessing || !teacherId}
                      />
                    </label>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="text-xs text-slate-600">
                        Parsed rows: <span className="font-semibold">{csvRows.length}</span>
                      </div>
                      <div className="sm:text-right">
                        <label htmlFor="default_section" className="text-xs text-slate-600">
                          Default Section (optional)
                        </label>
                        <div className="relative mt-1">
                          {listsLoading ? (
                            <div className="h-9 w-full animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />
                          ) : (
                            <select
                              id="default_section"
                              value={bulkDefaultSectionId}
                              onChange={(e) => setBulkDefaultSectionId(e.target.value ? Number(e.target.value) : "")}
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                              disabled={bulkProcessing}
                            >
                              <option value="">— None (use CSV section/section_id) —</option>
                              {sections.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress */}
                  {bulkProcessing || bulkDone > 0 ? (
                    <div className="rounded-2xl border p-4">
                      <div className="mb-2 grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                        <div className="font-medium text-slate-800">Import progress</div>
                        <div className="justify-self-end text-slate-600" aria-live="polite">
                          {bulkDone}/{totalRows} •{" "}
                          <span className="text-emerald-700">ok {bulkSuccess}</span> •{" "}
                          <span className="text-rose-700">fail {bulkFailed}</span>
                        </div>
                      </div>
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={bulkProgressPct}
                        aria-label="CSV import progress"
                      >
                        <div
                          className="h-full bg-blue-600 transition-[width] duration-300"
                          style={{ width: `${bulkProgressPct}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Results */}
                  {bulkResults.length > 0 ? (
                    <div className="rounded-2xl border p-4">
                      <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-2">
                        <div className="truncate text-sm font-medium text-slate-800">Results</div>
                        <div className="justify-self-end">
                          <button
                            onClick={downloadBulkResults}
                            className="inline-flex w-full items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                          >
                            <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
                            Download CSV
                          </button>
                        </div>
                      </div>

                      <div className="max-h-56 overflow-auto rounded-lg border">
                        <table className="min-w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-50">
                            <tr className="text-slate-600">
                              <th className="px-3 py-2">LRN</th>
                              <th className="px-3 py-2">Password</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2">Error</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {bulkResults.map((r, i) => (
                              <tr key={i} className="text-slate-700">
                                <td className="px-3 py-2 font-mono">{r.lrn || "—"}</td>
                                <td className="px-3 py-2 font-mono">{r.password || "—"}</td>
                                <td className="px-3 py-2">
                                  {r.status === "created" ? (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-200">
                                      created
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 ring-1 ring-rose-200">
                                      failed
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-slate-500">{r.error || ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>

          {/* Footer (sticky) */}
          <div className="sticky bottom-0 z-10 border-t bg-white/95 px-4 py-3 sm:px-6 sm:py-3 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            {/* Toolbar: fluid + auto columns, overlap-proof */}
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_auto]">
              <div className="min-w-0">
                {mode === "bulk" && bulkJustFinished ? (
                  <p className="truncate text-xs text-slate-600">
                     {bulkSuccess} Success, {bulkFailed} failed.
                  </p>
                ) : tempPassword ? (
                  <p className="truncate text-xs text-slate-600">
                    Review the credentials or add another student.
                  </p>
                ) : (
                  <span className="sr-only">Actions</span>
                )}
              </div>

              {/* Secondary */}
              {mode === "bulk" ? (
                bulkJustFinished ? (
                  <>
                    <button
                      onClick={resetBulk}
                      className="w-full whitespace-nowrap rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                    >
                      Upload another CSV
                    </button>
                    <button
                      onClick={() => {
                        onStudentAdded();
                        closeModal();
                      }}
                      className="w-full whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                    >
                      Done (Refresh list)
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={closeModal}
                      disabled={bulkProcessing}
                      className="w-full whitespace-nowrap rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleStartImport}
                      disabled={bulkProcessing || csvRows.length === 0 || !teacherId}
                      aria-busy={bulkProcessing}
                      className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                    >
                      {bulkProcessing ? (
                        <>
                          <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Importing…
                        </>
                      ) : (
                        <>
                          <ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />
                          Start Import
                        </>
                      )}
                    </button>
                  </>
                )
              ) : tempPassword ? (
                <>
                  <button
                    onClick={handleAddAnother}
                    className="w-full whitespace-nowrap rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                  >
                    Add another
                  </button>
                  <button
                    onClick={handleSingleDone}
                    className="w-full whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                  >
                    Done (Refresh list)
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={closeModal}
                    disabled={loading}
                    className="w-full whitespace-nowrap rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddStudent}
                    disabled={loading || !teacherId}
                    aria-busy={loading}
                    className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 sm:w-auto"
                  >
                    {loading ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <UserPlusIcon className="h-4 w-4" aria-hidden="true" />
                        Add New Student
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
