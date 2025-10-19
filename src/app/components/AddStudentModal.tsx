"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  XMarkIcon,
  UserPlusIcon,
  IdentificationIcon,
  AcademicCapIcon,
  AtSymbolIcon,
  KeyIcon,
  ClipboardIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

interface AddStudentModalProps {
  closeModal: () => void;
  teacherId: string;          // current teacher/admin auth UID
  onStudentAdded: () => void; // refresh parent list
}

type SectionRow = { id: number; name: string };

const CREATE_STUDENT_URL = "/api/teacher/create-student";

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
        // escaped quote
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
export default function AddStudentModal({
  closeModal,
  teacherId,
  onStudentAdded,
}: AddStudentModalProps) {
  /* -------------------------- Shared state -------------------------- */
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("sections")
        .select("id,name")
        .order("name", { ascending: true });

      if (error) setError(error.message);
      else setSections((data ?? []) as SectionRow[]);
    })();
  }, []);

  /* -------------------------- Mode: tabs ---------------------------- */
  const [mode, setMode] = useState<"single" | "bulk">("single");

  /* ------------------------- Single form ---------------------------- */
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [lrn, setLrn] = useState("");
  const [sectionId, setSectionId] = useState<number | "">("");

  const [loading, setLoading] = useState(false);
  const [createdLRN, setCreatedLRN] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const derivedEmail = useMemo(
    () => (lrn.trim() ? `${lrn.trim()}@students.kitakita.local` : ""),
    [lrn]
  );

  const handleAddStudent = async () => {
    setLoading(true);
    setError(null);

    const clean = {
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      lrn: lrn.trim(),
    };

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
    if (!teacherId) {
      setError("Missing teacher/admin id. Please re-login.");
      setLoading(false);
      return;
    }

    const clientTempPassword = genTempPassword(10);

    try {
      const res = await fetch(CREATE_STUDENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId,
          lrn: clean.lrn,
          firstName: clean.firstName,
          middleName: clean.middleName || null,
          lastName: clean.lastName,
          sectionId, // numeric
          password: clientTempPassword, // pass through to Auth + DB copy
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Unexpected response (HTTP ${res.status}).`);
      }

      if (!res.ok) {
        if (res.status === 409) throw new Error(json?.error || "Student already exists (LRN conflict).");
        throw new Error(json?.error || "Failed to create student.");
      }

      const pw = json?.password || clientTempPassword;

      setCreatedLRN(clean.lrn);
      setTempPassword(pw);
      onStudentAdded();
    } catch (e: any) {
      setError(e?.message || "Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
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

  /* -------------------------- Bulk import --------------------------- */
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

  const sectionByName = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sections) map[s.name.toLowerCase()] = s.id;
    return map;
  }, [sections]);

  const totalRows = csvRows.length;
  const bulkProgressPct = totalRows === 0 ? 0 : Math.round((bulkDone / totalRows) * 100);

  const handlePickCsv = async (file?: File | null) => {
    setCsvFile(file ?? null);
    setCsvRows([]);
    setBulkResults([]);
    setBulkDone(0);
    setBulkSuccess(0);
    setBulkFailed(0);
    if (!file) return;

    const text = await file.text();
    const rows = parseCsv(text);
    setCsvRows(rows);
  };

  const resolveSectionId = (row: Record<string, string>): number | null => {
    // CSV may provide section_id or section (name)
    const sid = row["section_id"]?.trim();
    if (sid && /^\d+$/.test(sid)) return Number(sid);
    const sname = row["section"]?.trim().toLowerCase();
    if (sname && sectionByName[sname]) return sectionByName[sname];
    if (bulkDefaultSectionId) return Number(bulkDefaultSectionId);
    return null;
  };

  const handleStartImport = async () => {
    if (!teacherId) {
      setError("Missing teacher/admin id. Please re-login.");
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
          headers: { "Content-Type": "application/json" },
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
          // ignore parse error; still record status below
        }

        if (!res.ok) {
          const msg =
            res.status === 409
              ? json?.error || "Student already exists (LRN conflict)."
              : json?.error || `Failed (HTTP ${res.status}).`;

          setBulkResults((prev) => [
            ...prev,
            { lrn, status: "failed", error: msg },
          ]);
          setBulkFailed((n) => n + 1);
        } else {
          const pw = json?.password || clientTempPassword;
          setBulkResults((prev) => [
            ...prev,
            { lrn, password: pw, status: "created" },
          ]);
          setBulkSuccess((n) => n + 1);
          onStudentAdded(); // refresh list incrementally
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
  };

  const downloadTemplate = () => {
    downloadCsv(
      "students_template.csv",
      [
        ["first_name", "last_name", "middle_name", "lrn", "section"],
        ["", "", "", "", ""],
      ]
    );
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

  /* ------------------------------- UI -------------------------------- */
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600/10">
              <UserPlusIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Add New Student</h2>
              <p className="text-xs text-slate-500">
                Create an account linked to this teacher/admin.
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* tabs */}
        <div className="px-6 pt-4">
          <div className="inline-flex rounded-xl border bg-slate-50 p-1 text-sm">
            <button
              onClick={() => setMode("single")}
              className={`px-3 py-1.5 rounded-lg ${mode === "single" ? "bg-white shadow ring-1 ring-slate-200" : "text-slate-600"}`}
            >
              Single
            </button>
            <button
              onClick={() => setMode("bulk")}
              className={`px-3 py-1.5 rounded-lg ${mode === "bulk" ? "bg-white shadow ring-1 ring-slate-200" : "text-slate-600"}`}
            >
              Bulk CSV
            </button>
          </div>
        </div>

        {/* body */}
        <div className="px-6 py-5">
          {mode === "single" ? (
            tempPassword ? (
              /* Success card: LRN + Password (single copy) */
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-green-700">
                    <CheckCircleIcon className="h-5 w-5" />
                    <p className="text-sm font-medium">Student account created</p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2">
                    <div className="flex items-center gap-2">
                      <KeyIcon className="h-4 w-4 text-slate-400" />
                      <div className="text-sm">
                        <div className="font-medium">LRN &amp; Password</div>
                        <div className="font-mono text-slate-700">
                          {(createdLRN ?? lrn) || "—"} — {tempPassword}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => copy(`${(createdLRN ?? lrn) || ""} — ${tempPassword}`)}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      <ClipboardIcon className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAddAnother}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    Add another
                  </button>
                  <button
                    onClick={closeModal}
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                    <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {/* form grid */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {/* First name */}
                  <div className="relative">
                    <IdentificationIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="First name"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  {/* LRN */}
                  <div className="relative">
                    <AtSymbolIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="LRN"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                      value={lrn}
                      onChange={(e) => setLrn(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  {/* Last name */}
                  <input
                    type="text"
                    placeholder="Last name"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={loading}
                  />

                  {/* Section */}
                  <div className="relative">
                    <AcademicCapIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                    <select
                      className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pl-10 text-sm outline-none ring-blue-500 focus:border-blue-500 focus:ring-2"
                      value={sectionId}
                      onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
                      disabled={loading}
                    >
                      <option value="">Select section</option>
                      {sections.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Middle name */}
                  <input
                    type="text"
                    placeholder="Middle name (optional)"
                    className="md:col-span-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    disabled={loading}
                  />
                </div>

                {/* actions */}
                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    onClick={closeModal}
                    disabled={loading}
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddStudent}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <UserPlusIcon className="h-4 w-4" />
                        Add New Student
                      </>
                    )}
                  </button>
                </div>
              </>
            )
          ) : (
            /* -------------------------- BULK CSV UI -------------------------- */
            <>
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                  <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-800">
                      Upload CSV —{" "}
                      <span className="font-normal text-slate-500">
                        columns: first_name, last_name, middle_name (optional), lrn, section (or section_id)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={downloadTemplate}
                        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-slate-50"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        Template
                      </button>
                    </div>
                  </div>

                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 hover:bg-slate-100">
                    <ArrowUpTrayIcon className="h-6 w-6 text-slate-500" />
                    <div className="text-sm text-slate-700">
                      {csvFile ? csvFile.name : "Choose CSV file"}
                    </div>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => handlePickCsv(e.target.files?.[0] ?? null)}
                      disabled={bulkProcessing}
                    />
                  </label>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="text-xs text-slate-600">
                      Parsed rows:{" "}
                      <span className="font-semibold">{csvRows.length}</span>
                    </div>
                    <div className="sm:text-right">
                      <label className="text-xs text-slate-600">
                        Default Section (optional)
                      </label>
                      <div className="relative mt-1">
                        <select
                          value={bulkDefaultSectionId}
                          onChange={(e) =>
                            setBulkDefaultSectionId(
                              e.target.value ? Number(e.target.value) : ""
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={bulkProcessing}
                        >
                          <option value="">
                            — None (use CSV section/section_id) —
                          </option>
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                {bulkProcessing || bulkDone > 0 ? (
                  <div className="rounded-xl border p-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <div className="font-medium text-slate-800">
                        Import progress
                      </div>
                      <div className="text-slate-600">
                        {bulkDone}/{totalRows} •{" "}
                        <span className="text-emerald-700">ok {bulkSuccess}</span>{" "}
                        • <span className="text-rose-700">fail {bulkFailed}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${bulkProgressPct}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {/* Results */}
                {bulkResults.length > 0 ? (
                  <div className="rounded-xl border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium text-slate-800">
                        Results
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={downloadBulkResults}
                          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-slate-50"
                        >
                          <ArrowDownTrayIcon className="h-4 w-4" />
                          Download CSV
                        </button>
                      </div>
                    </div>

                    <div className="max-h-52 overflow-auto rounded-lg border">
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
                              <td className="px-3 py-2 font-mono">
                                {r.lrn || "—"}
                              </td>
                              <td className="px-3 py-2 font-mono">
                                {r.password || "—"}
                              </td>
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
                              <td className="px-3 py-2 text-slate-500">
                                {r.error || ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={closeModal}
                    disabled={bulkProcessing}
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStartImport}
                    disabled={bulkProcessing || csvRows.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    {bulkProcessing ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Importing…
                      </>
                    ) : (
                      <>
                        <ArrowUpTrayIcon className="h-4 w-4" />
                        Start Import
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
