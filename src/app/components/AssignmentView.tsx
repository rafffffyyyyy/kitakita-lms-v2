// /src/app/components/AssignmentView.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DocumentTextIcon,
  PaperClipIcon,
  ArrowUpOnSquareIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  SparklesIcon,
  XMarkIcon,
  EyeIcon,
  UsersIcon,
  UserCircleIcon,
  InformationCircleIcon,
  CheckCircleIcon as CheckCircleSolid,
  XCircleIcon,
  CalendarDaysIcon,
  TrophyIcon,
  ArrowPathIcon,
  LockClosedIcon,
  UserGroupIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  BugAntIcon, // ✅ for the Debug button
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/app/UserContext";

// ✅ use the same grammar checker utility as the working page
import { checkGrammar } from "../api/grammarChecker";

/* ----------------------------- CONFIG ----------------------------- */
const STORAGE_BUCKET = "lms-files";

/* ----------------------------- GRAMMAR HELPERS ---------------------------- */
function extractBetween(src: string, start: RegExp, end?: RegExp): string | null {
  const s = src.search(start);
  if (s === -1) return null;
  const from = s + (src.slice(s).match(start)?.[0].length ?? 0);
  const rest = src.slice(from);
  if (!end) return rest.trim();
  const e = rest.search(end);
  return (e === -1 ? rest : rest.slice(0, e)).trim();
}
function stripLabel(s: string, re: RegExp) {
  return s.replace(re, "").trim();
}
function normalizeCorrected(s: string) {
  const quoted = s.match(/"([^"]+)"/);
  if (quoted) return quoted[1].trim();
  const firstLine = s.split(/\n/)[0];
  return firstLine.replace(/^[\-\u2022]\s*/, "").trim();
}
function toFlatBullets(block: string): string[] {
  if (!block) return [];
  const lines = block.replace(/\r/g, "").split("\n").map((l) => l.replace(/\t/g, "  "));
  const bullets: string[] = [];
  const bulletRe = /^\s*(?:[-*•\u2022\u2013\u2014]|(?:\d+[\.\)]))\s+(.*\S)\s*$/;
  const joinableRe = /^\s{2,}(.*\S)\s*$/;
  let carry = "";
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const m = line.match(bulletRe);
    if (m) {
      if (carry) {
        bullets.push(carry.trim());
        carry = "";
      }
      carry = m[1].trim();
      continue;
    }
    if (line.search(/[–—]\s+/) === 0) {
      if (carry) {
        bullets.push(carry.trim());
        carry = "";
      }
      carry = line.replace(/[–—]\s+/, "").trim();
      continue;
    }
    if (carry && joinableRe.test(raw)) {
      carry += " " + raw.trim();
    } else {
      if (carry) {
        bullets.push(carry.trim());
        carry = "";
      }
      bullets.push(line.trim());
    }
  }
  if (carry) bullets.push(carry.trim());
  return bullets
    .map((s) => s.replace(/^\s*(?:[-*•\u2022\u2013\u2014])\s+/, "").trim())
    .filter(Boolean);
}
function parseGrammarResponse(raw: string) {
  const text = raw.replace(/\r/g, "").trim();
  const unwrapped = text.replace(/^```[\s\S]*?\n/, "").replace(/```$/, "").trim();

  const RE_ORIG = /^\s*1\.\s*Original\s*Sentence\s*[:\-]/im;
  const RE_ERRS = /^\s*2\.\s*Errors?\s*&?\s*Explanation[s]?\s*[:\-]?/im;
  const RE_CORR = /^\s*3\.\s*Corrected\s*Sentence\s*[:\-]?/im;
  const RE_TIP_LABEL = /^(?:Writing\s+)?Tips?\s*:/im;

  let original = extractBetween(unwrapped, RE_ORIG, RE_ERRS) ?? "";
  let issues =
    extractBetween(unwrapped, RE_ERRS, RE_CORR) ??
    extractBetween(unwrapped, RE_ERRS, RE_TIP_LABEL) ??
    extractBetween(unwrapped, RE_ERRS) ??
    "";
  let corrected =
    extractBetween(unwrapped, RE_CORR, RE_TIP_LABEL) ??
    extractBetween(unwrapped, RE_CORR) ??
    "";
  let tips = extractBetween(unwrapped, RE_TIP_LABEL) ?? "";

  original = stripLabel(original, /^Original\s*Sentence\s*[:\-]\s*/i);
  issues = stripLabel(issues, /^Errors?\s*&?\s*Explanation[s]?\s*[:\-]?\s*/i);
  corrected = stripLabel(corrected, /^Corrected\s*Sentence\s*[:\-]?\s*/i);
  tips = stripLabel(tips, /^(?:Writing\s+)?Tips?\s*[:\-]?\s*/i);

  if (RE_TIP_LABEL.test(corrected)) {
    const parts = corrected.split(RE_TIP_LABEL);
    corrected = (parts[0] || "").trim();
    if (!tips.trim()) tips = (parts[1] || "").trim();
  }

  corrected = normalizeCorrected(corrected);

  return { original, issuesBlock: issues.trim(), corrected: corrected.trim(), tips: tips.trim() };
}
async function getGrammarText(input: string): Promise<string> {
  const res = (await (checkGrammar as unknown as (t: string) => Promise<any>)(input)) as any;
  if (typeof res === "string") return res ?? "";
  const direct = res?.content ?? res?.response ?? res?.text ?? "";
  if (direct) return String(direct);
  const parts: string[] = [];
  if (res?.original) parts.push(`1. Original Sentence:\n- ${res.original}`);
  const errors = Array.isArray(res?.errors) ? res.errors.join("\n- ") : res?.errors ? String(res.errors) : "";
  if (errors) parts.push(`2. Errors & Explanation:\n- ${errors}`);
  if (res?.corrected) parts.push(`3. Corrected Sentence:\n- ${res.corrected}`);
  if (res?.tips) parts.push(`Tips:\n- ${res.tips}`);
  return parts.join("\n\n");
}

/* ----------------------------- HELPERS ---------------------------- */
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}
function fileExt(name: string) {
  const p = name.split(".");
  return (p[p.length - 1] || "").toLowerCase();
}
function uuidLike() {
  return typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2);
}
function buildSubmissionPath(assignmentId: string, userId: string, fileName: string) {
  return `submissions/${assignmentId}/${userId}/${uuidLike()}.${fileExt(fileName)}`;
}
async function uploadAndReturnPath(path: string, file: File) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false, cacheControl: "3600", contentType: file.type || undefined });
  if (error) throw error;
  return data?.path ?? path;
}
async function toViewUrl(bucketPath: string, expiresSeconds = 3600) {
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(bucketPath, expiresSeconds);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch (e) {
    console.error("[toViewUrl] createSignedUrl failed:", e);
  }
  try {
    const pub = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(bucketPath);
    return pub?.data?.publicUrl ?? null;
  } catch (e) {
    console.error("[toViewUrl] getPublicUrl failed:", e);
    return null;
  }
}

/* ------------------------------- TYPES --------------------------- */
type Role = "teacher" | "student" | "admin" | null;
type Assignment = {
  id: string;
  module_id: string;
  name: string;
  instruction: string | null;
  created_at: string;
  max_score: number;
  max_attempts: number | null;
  available_from: string | null;
  due_at: string | null;
  /** schema column */
  is_private?: boolean | null;
};
type AssignmentFile = {
  id: string;
  assignment_id: string;
  file_url: string | null;
  file_name?: string | null;
  Name?: string | null;
  created_at: string;
};
type ModuleRow = { id: string; title: string; description: string | null; youtube_url: string | null };
type Student = {
  id: string;
  first_name: string | null;
  middle_name?: string | null;
  last_name: string | null;
  section_id: number | null;
  section_name?: string | null;
};
type SubmissionRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  file_url: string | null;
  answer_text: string | null;
  submitted_at: string | null;
};

/* ----------------------- Manage Audience Sheet (with Debug) ----------------------- */
/** ✅ UPDATED: uses plain INSERT (no upsert), sending only real columns.
 *  + Debug panel to see payloads and errors if RLS blocks writes.
 */
function ManageAudienceSheet({
  open,
  onClose,
  assignmentId,
  teacherId,
  initialSelectedIds, // kept for signature; server is the source of truth
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  assignmentId: string;
  teacherId: string;
  initialSelectedIds: string[];
  onSaved: (nextIds: string[]) => void;
}) {
  type SectionFilter = "ALL" | number;

  type AudienceRow = {
    student_id: string;
    first_name: string | null;
    last_name: string | null;
    section_id: number | null;
    is_assigned: boolean;
  };

  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<Array<{ id: number; name: string }>>([]);
  const [allRows, setAllRows] = useState<AudienceRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<SectionFilter>("ALL");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // selection maps
  const [initialSet, setInitialSet] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 🔎 Debug state
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const pushDebug = (label: string, payload?: unknown) => {
    const stamp = new Date().toLocaleTimeString();
    let msg = `[${stamp}] ${label}`;
    if (payload !== undefined) {
      try {
        msg += ` → ${JSON.stringify(payload)}`;
      } catch {
        msg += ` → <unserializable>`;
      }
    }
    console.log(label, payload);
    setDebugLines((prev) => [...prev, msg].slice(-400));
  };

  // load from tables
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setDebugLines([]);
      try {
        pushDebug("LOAD start", { assignmentId, teacherId });

        // 1) teacher's students
        const { data: studs, error: sErr } = await supabase
          .from("students")
          .select("id, first_name, last_name, section_id")
          .eq("teacher_id", teacherId)
          .order("last_name", { ascending: true });

        if (sErr) throw sErr;
        pushDebug("Loaded students", { count: studs?.length || 0 });

        // 2) current assignment audience
        const { data: aud, error: aErr } = await supabase
          .from("assignment_students")
          .select("student_id")
          .eq("assignment_id", assignmentId);

        if (aErr) throw aErr;
        pushDebug("Loaded audience", { count: aud?.length || 0 });

        const init = new Set((aud ?? []).map((r: any) => r.student_id as string));
        setInitialSet(init);
        setSelected(new Set(init));

        // 3) combine + sort
        const rows: AudienceRow[] = (studs ?? []).map((st: any) => ({
          student_id: st.id,
          first_name: st.first_name ?? null,
          last_name: st.last_name ?? null,
          section_id: st.section_id ?? null,
          is_assigned: init.has(st.id),
        }));
        rows.sort((a, b) =>
          `${a.last_name ?? ""} ${a.first_name ?? ""}`.localeCompare(`${b.last_name ?? ""} ${b.first_name ?? ""}`)
        );
        setAllRows(rows);
        pushDebug("Combined rows", { total: rows.length });

        // 4) sections used
        const secIds = Array.from(
          new Set(rows.map((r) => r.section_id).filter((v): v is number => typeof v === "number"))
        );
        if (secIds.length) {
          const { data: secs, error: secErr } = await supabase
            .from("sections")
            .select("id,name")
            .in("id", secIds);
          if (secErr) throw secErr;
          setSections((secs ?? []) as Array<{ id: number; name: string }>);
          pushDebug("Loaded sections", { count: secs?.length || 0 });
        } else {
          setSections([]);
          pushDebug("No sections referenced by these students");
        }

        setActiveFilter("ALL");
        pushDebug("LOAD done");
      } catch (e: any) {
        pushDebug("LOAD failed", { code: e?.code, message: e?.message || String(e) });
        alert("Failed to load audience. Please try again.");
        setAllRows([]);
        setSections([]);
        setInitialSet(new Set());
        setSelected(new Set());
      } finally {
        setLoading(false);
      }
    })();
  }, [open, assignmentId, teacherId]);

  // filter + search
  const filteredRows = useMemo(() => {
    const bySection = activeFilter === "ALL" ? allRows : allRows.filter((r) => r.section_id === activeFilter);
    const q = query.trim().toLowerCase();
    if (!q) return bySection;
    return bySection.filter((r) => {
      const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.toLowerCase();
      return name.includes(q);
    });
  }, [allRows, activeFilter, query]);

  const visibleIds = useMemo(() => filteredRows.map((r) => r.student_id), [filteredRows]);
  const allChecked = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selected.has(id)),
    [visibleIds, selected]
  );
  const someChecked = useMemo(
    () => visibleIds.some((id) => selected.has(id)) && !allChecked,
    [visibleIds, selected, allChecked]
  );

  const setOne = (id: string, value: boolean) => {
    const next = new Set(selected);
    value ? next.add(id) : next.delete(id);
    setSelected(next);
  };

  const toggleVisibleAll = () => {
    const next = new Set(selected);
    if (allChecked) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  const sectionName = (id: number | null | undefined) => {
    if (id == null) return "No section";
    const s = sections.find((x) => x.id === id);
    return s?.name ?? `Section ${id}`;
  };

  // 🔧 UPDATED SAVE: plain INSERT (no upsert), payload includes only real columns, no unsupported options
  const save = async () => {
    setSaving(true);
    try {
      const nextSet = new Set(selected);
      const toEnable = Array.from(nextSet).filter((id) => !initialSet.has(id));
      const toDisable = Array.from(initialSet).filter((id) => !nextSet.has(id));

      pushDebug("SAVE begin", { to_enable: toEnable.length, to_disable: toDisable.length });

      if (toEnable.length) {
        const rows = toEnable.map((sid) => ({ assignment_id: assignmentId, student_id: sid }));
        pushDebug("INSERT payload (assignment_students)", rows);

        // ⛔ No { returning: 'minimal' } — not supported by your supabase-js typings
        const { error: insErr } = await supabase.from("assignment_students").insert(rows);

        if (insErr && insErr.code !== "23505") {
          // 23505: unique_violation — safe to ignore if a unique constraint exists
          pushDebug("Insert error", { code: insErr.code, message: insErr.message, details: insErr.details });
          throw insErr;
        } else if (!insErr) {
          pushDebug("Insert ok");
        } else {
          pushDebug("Insert had duplicate rows; ignored");
        }
      }

      if (toDisable.length) {
        pushDebug("Deleting assignment_students", toDisable);
        const { error: delErr } = await supabase
          .from("assignment_students")
          .delete()
          .eq("assignment_id", assignmentId)
          .in("student_id", toDisable);
        if (delErr) {
          pushDebug("Delete error", { code: delErr.code, message: delErr.message, details: delErr.details });
          throw delErr;
        } else {
          pushDebug("Delete ok");
        }
      }

      pushDebug("SAVE done — refreshing selection");
      onSaved(Array.from(nextSet));
      onClose();
    } catch (e: any) {
      const info = { code: e?.code, message: e?.message || String(e), details: e?.details };
      pushDebug("SAVE failed", info);

      const hint =
        e?.code === "42501" || /RLS|row level|permission|not allowed/i.test(String(e?.message))
          ? "\nHint: RLS is likely blocking insert/delete on assignment_students for this teacher."
          : "";

      alert(`Saving audience failed. Please try again.\n\n${info.code || ""} ${info.message || ""}${hint}`);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[880px] max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-gray-50/80">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold truncate">Manage Audience</h3>
            <p className="text-xs sm:text-sm text-gray-500">Choose which students receive this private assignment.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDebugOpen((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] ${
                debugOpen ? "bg-amber-50" : ""
              }`}
              title="Show debug panel"
            >
              <BugAntIcon className="h-3.5 w-3.5" />
              Debug
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200" aria-label="Close">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-[220px,1fr] gap-0 sm:gap-4">
          {/* Sections / Filters */}
          <aside className="border-r max-h-[65vh] overflow-y-auto">
            <div className="p-3 sm:p-4">
              <p className="text-xs text-gray-500 mb-2">Filter</p>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveFilter("ALL")}
                  className={`w-full text-left px-3 py-2 rounded-lg border ${
                    activeFilter === "ALL" ? "bg-indigo-50 border-indigo-300" : "hover:bg-gray-50"
                  }`}
                >
                  <span className="font-medium">All students</span>
                </button>

                {sections.map((sec) => (
                  <button
                    key={sec.id}
                    onClick={() => setActiveFilter(sec.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border ${
                      activeFilter === sec.id ? "bg-indigo-50 border-indigo-300" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="font-medium">{sec.name}</span>
                  </button>
                ))}

                {!sections.length && !loading && (
                  <p className="text-sm text-gray-500 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4" /> No sections found.
                  </p>
                )}
              </div>
            </div>
          </aside>

          {/* Students (one column, searchable, scrollable) */}
          <main className="max-h-[65vh] overflow-y-auto">
            {/* Sticky tools */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur px-3 sm:px-4 pt-3 pb-2 border-b">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name…"
                    className="w-full rounded-lg border pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Search students"
                  />
                </div>
                <button
                  onClick={toggleVisibleAll}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50 whitespace-nowrap text-sm"
                  title={allChecked ? "Unselect all shown" : "Select all shown"}
                >
                  {allChecked ? "Unselect" : "Select"} all
                  <CheckIcon className={`w-4 h-4 ${someChecked ? "opacity-60" : ""}`} />
                </button>
              </div>

              {/* Debug drawer */}
              {debugOpen && (
                <div className="mt-2 rounded-lg border bg-amber-50/40 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-xs font-medium text-amber-800">
                      Debug • assignment: <span className="font-mono">{assignmentId.slice(0, 8)}…</span> • teacher:{" "}
                      <span className="font-mono">{(teacherId || "").slice(0, 8)}…</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-amber-700">
                        selected: {selected.size} • initial: {initialSet.size}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(debugLines.join("\n"))}
                        className="rounded border px-2 py-0.5 text-[11px] hover:bg-white"
                      >
                        Copy log
                      </button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-auto text-[11px] font-mono leading-4 text-amber-900 whitespace-pre-wrap">
                    {debugLines.length ? (
                      debugLines.map((l, i) => <div key={i}>{l}</div>)
                    ) : (
                      <div className="italic text-amber-700">No logs yet. Try Save.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4">
              {loading && (
                <div className="animate-pulse space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-xl bg-slate-100" />
                  ))}
                </div>
              )}

              {!loading && filteredRows.length === 0 && (
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-4 h-4" /> No students match your filter.
                </div>
              )}

              <ul className="space-y-2">
                {filteredRows.map((r) => {
                  const checked = selected.has(r.student_id);
                  return (
                    <li key={r.student_id}>
                      <label
                        className={`flex items-center gap-3 p-2.5 border rounded-xl cursor-pointer transition ${
                          checked ? "bg-indigo-50 border-indigo-300" : "hover:bg-gray-50"
                        }`}
                        title={checked ? "Included in audience" : "Not included"}
                      >
                        <input
                          type="checkbox"
                          className="accent-indigo-600"
                          checked={checked}
                          onChange={(e) => setOne(r.student_id, e.target.checked)}
                        />
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center">
                          <UserGroupIcon className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {[r.last_name, r.first_name].filter(Boolean).join(", ") || "Unnamed"}
                          </div>
                          <div className="mt-0.5">
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
                              {sectionName(r.section_id)}
                            </span>
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </main>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 border-t bg-white">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 sm:px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- MAIN COMPONENT -------------------------- */
type Props = {
  assignmentId: string;
  moduleId?: string;
  roleOverride?: Role;
  onSubmitted?: () => void;
};

export default function AssignmentView({ assignmentId, moduleId: moduleIdProp, roleOverride, onSubmitted }: Props) {
  const { role: ctxRole } = useUser();
  const role = roleOverride ?? ctxRole;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [fileMeta, setFileMeta] = useState<AssignmentFile | null>(null);
  const [module, setModule] = useState<ModuleRow | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // student submit state
  const [answerText, setAnswerText] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // grammar state
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [corrected, setCorrected] = useState("");
  const [feedback, setFeedback] = useState("");
  const [tipsText, setTipsText] = useState("");

  // attempts, score, feedback (student)
  const [attemptsUsed, setAttemptsUsed] = useState<number>(0);
  const [gradeScore, setGradeScore] = useState<number | null>(null);
  const [teacherFeedback, setTeacherFeedback] = useState<string | null>(null);

  // ui
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // roster (teacher)
  const isStudent = role === "student";
  const isTeacher = role === "teacher" || role === "admin";
  const [students, setStudents] = useState<Student[]>([]);
  const [subsByStudent, setSubsByStudent] = useState<Record<string, SubmissionRow | undefined>>({});
  const [loadingRoster, setLoadingRoster] = useState(false);

  // audience (private)
  const [audienceIds, setAudienceIds] = useState<string[] | null>(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);

  // ⭐ NEW: student's latest submission state
  const [mySubmission, setMySubmission] = useState<SubmissionRow | null>(null);
  const [mySubmissionUrl, setMySubmissionUrl] = useState<string | null>(null);
  const [myFileExtLower, setMyFileExtLower] = useState<string>("");

  /* Load assignment + preview file + module + teacherId */
  useEffect(() => {
    (async () => {
      setErr(null);

      // resolve teacherId for later queries
      try {
        const { data: authUser } = await supabase.auth.getUser();
        const uid = authUser?.user?.id ?? null;
        if (uid) {
          const { data: trow } = await supabase.from("teachers").select("id").eq("user_id", uid).maybeSingle();
          setTeacherId(trow?.id ?? null);
        }
      } catch {}

      // assignment
      const { data: a, error: e1 } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();

      if (e1 || !a) {
        setErr(e1?.message ?? "Assignment not found.");
        return;
      }
      setAssignment(a as unknown as Assignment);

      // module
      const moduleId = moduleIdProp ?? (a as Assignment).module_id;
      if (moduleId) {
        const { data: m } = await supabase
          .from("modules")
          .select("id, title, description, youtube_url")
          .eq("id", moduleId)
          .maybeSingle();
        if (m) setModule(m as ModuleRow);
      }

      // file (latest)
      const { data: af, error: e3 } = await supabase
        .from("assignment_files")
        .select("id, assignment_id, file_url, file_name, created_at")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (e3) {
        setErr(e3.message || "Failed to load attached file.");
      }
      if (af) {
        const row = af as AssignmentFile;
        setFileMeta(row);
        if (row.file_url) {
          const url = await toViewUrl(row.file_url);
          setPreviewUrl(url ?? (row.file_url.startsWith("http") ? row.file_url : null));
        } else {
          setPreviewUrl(null);
        }
      } else {
        setFileMeta(null);
        setPreviewUrl(null);
      }

      // audience (if private)
      if ((a as Assignment).is_private) {
        const { data: audRows } = await supabase
          .from("assignment_students")
          .select("student_id")
          .eq("assignment_id", assignmentId);
        setAudienceIds((audRows ?? []).map((r: any) => r.student_id as string));
      } else {
        setAudienceIds(null);
      }
    })();
  }, [assignmentId, moduleIdProp]);

  /* Student: attempts used + grade + feedback */
  useEffect(() => {
    if (!isStudent || !assignmentId) return;

    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const studentId = auth.user?.id;
        if (!studentId) return;

        const { count: cnt } = await supabase
          .from("assignment_submissions")
          .select("*", { count: "exact", head: true })
          .eq("assignment_id", assignmentId)
          .eq("student_id", studentId);

        setAttemptsUsed(cnt ?? 0);

        const { data: lastSub } = await supabase
          .from("assignment_submissions")
          .select("grade, feedback, submitted_at")
          .eq("assignment_id", assignmentId)
          .eq("student_id", studentId)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastSub) {
          const g = (lastSub as any).grade;
          setGradeScore(typeof g === "number" ? g : g != null ? Number(g) : null);
          setTeacherFeedback((lastSub as any).feedback ?? null);
        } else {
          setGradeScore(null);
          setTeacherFeedback(null);
        }
      } catch {
        // ignore
      }
    })();
  }, [isStudent, assignmentId]);

  /* ⭐ NEW: Student – load latest submission (full row + preview URL) */
  useEffect(() => {
    if (!isStudent || !assignmentId) return;

    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          setMySubmission(null);
          setMySubmissionUrl(null);
          setMyFileExtLower("");
          return;
        }

        const { data: last } = await supabase
          .from("assignment_submissions")
          .select("id, assignment_id, student_id, file_url, answer_text, submitted_at")
          .eq("assignment_id", assignmentId)
          .eq("student_id", uid)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!last) {
          setMySubmission(null);
          setMySubmissionUrl(null);
          setMyFileExtLower("");
          return;
        }

        setMySubmission(last as SubmissionRow);

        const rawPath = (last as any).file_url as string | null;
        if (rawPath) {
          const url = await toViewUrl(rawPath);
          setMySubmissionUrl(url ?? (rawPath.startsWith("http") ? rawPath : null));
          setMyFileExtLower(fileExt(rawPath).toLowerCase());
        } else {
          setMySubmissionUrl(null);
          setMyFileExtLower("");
        }
      } catch {
        setMySubmission(null);
        setMySubmissionUrl(null);
        setMyFileExtLower("");
      }
    })();
  }, [isStudent, assignmentId]);

  /* Teacher roster loader (standard vs private) */
  useEffect(() => {
    if (!isTeacher || !assignmentId || teacherId === undefined) return;

    const run = async () => {
      setLoadingRoster(true);
      try {
        // Standard: entire class; Private: only selected audienceIds
        let baseStudents: Student[] = [];

        if (assignment?.is_private) {
          const ids = audienceIds ?? [];
          if (ids.length) {
            const { data } = await supabase
              .from("students")
              .select("id, first_name, middle_name, last_name, section_id")
              .in("id", ids)
              .order("last_name", { ascending: true });
            baseStudents = (data ?? []) as Student[];
          } else {
            baseStudents = [];
          }
        } else {
          if (!teacherId) {
            baseStudents = [];
          } else {
            const { data: studs } = await supabase
              .from("students")
              .select("id, first_name, middle_name, last_name, section_id")
              .eq("teacher_id", teacherId)
              .order("last_name", { ascending: true });
            baseStudents = (studs ?? []) as Student[];
          }
        }

        // section names
        const sectionIds = Array.from(
          new Set(baseStudents.map((s) => s.section_id).filter((v): v is number => typeof v === "number"))
        );
        let sectionNameById: Record<number, string> = {};
        if (sectionIds.length) {
          const { data: secs } = await supabase.from("sections").select("id, name").in("id", sectionIds);
          sectionNameById = Object.fromEntries((secs ?? []).map((r: { id: number; name: string }) => [r.id, r.name]));
        }
        const withNames = baseStudents.map((s) => ({
          ...s,
          section_name: s.section_id != null ? sectionNameById[s.section_id] ?? null : null,
        }));
        setStudents(withNames);

        // submissions by these students
        if (withNames.length) {
          const ids = withNames.map((s) => s.id);
          const { data: subs } = await supabase
            .from("assignment_submissions")
            .select("id, assignment_id, student_id, file_url, answer_text, submitted_at")
            .eq("assignment_id", assignmentId)
            .in("student_id", ids);
          const map: Record<string, SubmissionRow> = {};
          (subs ?? []).forEach((r) => (map[r.student_id] = r as SubmissionRow));
          setSubsByStudent(map);
        } else {
          setSubsByStudent({});
        }
      } catch (e) {
        console.error("Roster fetch failed:", e);
        setStudents([]);
        setSubsByStudent({});
      } finally {
        setLoadingRoster(false);
      }
    };

    run();
  }, [isTeacher, assignmentId, assignment?.is_private, audienceIds, teacherId]);

  const fileExtLower = useMemo(() => {
    if (!fileMeta?.file_url) return "";
    const parts = fileMeta.file_url.split(".");
    return parts[parts.length - 1]?.toLowerCase();
  }, [fileMeta?.file_url]);

  // ---------- NEW: local UI-only filters for teacher panel ----------
  type SectionFilter = "ALL" | number;
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("ALL");
  const [studentQuery, setStudentQuery] = useState("");

  const sectionOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of students) {
      if (typeof s.section_id === "number") {
        map.set(s.section_id, s.section_name ?? `Section ${s.section_id}`);
      }
    }
    return Array.from(map.entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [students]);

  const filteredStudents = useMemo(() => {
    let arr = students;
    if (sectionFilter !== "ALL") {
      arr = arr.filter((s) => s.section_id === sectionFilter);
    }
    const q = studentQuery.trim().toLowerCase();
    if (q) {
      arr = arr.filter((s) => {
        const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ").toLowerCase();
        return name.includes(q);
      });
    }
    return arr;
  }, [students, sectionFilter, studentQuery]);
  // ------------------------------------------------------------------

  const windowState = useMemo(() => {
    const now = Date.now();
    const fromTs = assignment?.available_from ? Date.parse(assignment.available_from) : null;
    const dueTs = assignment?.due_at ? Date.parse(assignment.due_at) : null;
    const before = fromTs != null && now < fromTs;
    const after = dueTs != null && now > dueTs;
    const isOpen = !before && !after;
    let reason: string | null = null;
    if (before) reason = `Opens on ${fmtDateTime(assignment?.available_from || null)}`;
    else if (after) reason = `Closed after ${fmtDateTime(assignment?.due_at || null)}`;
    return { isOpen, reason };
  }, [assignment?.available_from, assignment?.due_at]);

  /* ----------------------------- RENDER HELPERS ----------------------------- */
  const renderSkeleton = (rows = 3) => (
    <div className="animate-pulse">
      <div className="h-5 w-32 rounded bg-slate-200/80" />
      <div className="mt-3 h-[50vh] sm:h-[60vh] w-full rounded-2xl bg-slate-100" />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );

  const renderFileViewer = () => {
    if (!previewUrl) {
      return (
        <div className="flex h-[50vh] sm:h-[60vh] w-full flex-col items-center justify-center rounded-2xl border border-dashed bg-white text-sm text-slate-500">
          <DocumentTextIcon className="mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />
          No attached file for this assignment.
        </div>
      );
    }

    if (fileExtLower === "pdf") {
      return (
        <object data={previewUrl} type="application/pdf" className="h-[68vh] sm:h-[74vh] w-full rounded-xl border">
          <iframe title="PDF preview" src={previewUrl} className="h-[68vh] sm:h-[74vh] w-full rounded-xl border" />
        </object>
      );
    }

    if (["png", "jpg", "jpeg", "gif", "webp"].includes(fileExtLower)) {
      return (
        <img
          src={previewUrl}
          alt="Assignment file preview"
          className="h-auto max-h-[68vh] sm:max-h-[74vh] w-full rounded-xl border object-contain"
        />
      );
    }

    if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(fileExtLower)) {
      const gview = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`;
      return <iframe title="Office preview" src={gview} className="h-[68vh] sm:h-[74vh] w-full rounded-xl border" allowFullScreen />;
    }

    return (
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        title="Open the file in a new tab"
      >
        <EyeIcon className="h-4 w-4" aria-hidden="true" />
        Open file
      </a>
    );
  };

  // ⭐ NEW: viewer for the student's latest submission file
  const renderMySubmissionViewer = () => {
    if (!mySubmissionUrl) return null;

    if (myFileExtLower === "pdf") {
      return (
        <object data={mySubmissionUrl} type="application/pdf" className="h-80 w-full rounded-lg border">
          <iframe title="Submission PDF preview" src={mySubmissionUrl} className="h-80 w-full rounded-lg border" />
        </object>
      );
    }

    if (["png", "jpg", "jpeg", "gif", "webp"].includes(myFileExtLower)) {
      return (
        <img
          src={mySubmissionUrl}
          alt="Your submission file"
          className="h-auto max-h-80 w-full rounded-lg border object-contain"
        />
      );
    }

    if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(myFileExtLower)) {
      const gview = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(mySubmissionUrl)}`;
      return <iframe title="Your submission (Office)" src={gview} className="h-80 w-full rounded-lg border" allowFullScreen />;
    }

    return (
      <a
        href={mySubmissionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        title="Open your submitted file in a new tab"
      >
        <EyeIcon className="h-4 w-4" aria-hidden="true" />
        Open submitted file
      </a>
    );
  };

  const renderAssignmentDetails = () => {
    const score = assignment?.max_score ?? 100;
    const from = fmtDateTime(assignment?.available_from);
    const now = Date.now();
    const to = fmtDateTime(assignment?.due_at);

    const fromTs = assignment?.available_from ? Date.parse(assignment.available_from) : null;
    const dueTs = assignment?.due_at ? Date.parse(assignment.due_at) : null;
    const isOpen = (fromTs == null || now >= fromTs) && (dueTs == null || now <= dueTs);

    return (
      <section className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <InformationCircleIcon className="h-5 w-5 text-slate-600 shrink-0" />
              <h3 className="truncate text-sm font-semibold text-slate-900">Assignment Details</h3>
            </div>
            <div className="flex items-center gap-2">
              {assignment?.is_private ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-600/20">
                  <LockClosedIcon className="h-3.5 w-3.5" /> Private
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-300">
                  Standard
                </span>
              )}
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${
                  isOpen ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-rose-50 text-rose-700 ring-rose-600/20"
                }`}
              >
                {isOpen ? "Open" : "Closed"}
              </span>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-1 divide-y divide-slate-100">
          <div className="grid grid-cols-[auto,1fr] items-center gap-3 px-4 py-3">
            <TrophyIcon className="h-5 w-5 text-slate-600" />
            <div>
              <dt className="text-xs text-slate-500">Max Score</dt>
              <dd className="text-sm font-medium text-slate-800">{score ?? "—"}</dd>
            </div>
          </div>

          <div className="grid grid-cols-[auto,1fr] items-center gap-3 px-4 py-3">
            <ArrowPathIcon className="h-5 w-5 text-slate-600" />
            <div>
              <dt className="text-xs text-slate-500">Max Attempts</dt>
              <dd className="text-sm font-medium text-slate-800">
                {assignment?.max_attempts == null
                  ? isStudent
                    ? `Unlimited (Used: ${attemptsUsed})`
                    : "Unlimited"
                  : isStudent
                  ? `${assignment.max_attempts} (Used: ${attemptsUsed})`
                  : assignment.max_attempts}
              </dd>
            </div>
          </div>

          <div className="grid grid-cols-[auto,1fr] items-center gap-3 px-4 py-3">
            <CalendarDaysIcon className="h-5 w-5 text-slate-600" />
            <div>
              <dt className="text-xs text-slate-500">Available From</dt>
              <dd className="text-sm font-medium text-slate-800">{from}</dd>
            </div>
          </div>

          <div className="grid grid-cols-[auto,1fr] items-center gap-3 px-4 py-3">
            <CalendarDaysIcon className="h-5 w-5 text-slate-600" />
            <div>
              <dt className="text-xs text-slate-500">Due At</dt>
              <dd className="text-sm font-medium text-slate-800">{fmtDateTime(assignment?.due_at)}</dd>
            </div>
          </div>
        </dl>
      </section>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStudent || !assignment) return;
    if (submitting) return;

    if (!windowState.isOpen) {
      setErr(windowState.reason || "Submission window is closed.");
      return;
    }

    const limit = assignment.max_attempts;
    const attemptsExceeded = limit != null && attemptsUsed >= limit;
    if (attemptsExceeded) {
      setErr("You have used all your attempts for this assignment.");
      return;
    }

    setSubmitting(true);
    setErr(null);
    setOkMsg(null);

    try {
      if (!answerText.trim() && !uploadFile) {
        setErr("Please write an answer or attach a file.");
        return;
      }

      const { data: authRes, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authRes?.user?.id) throw new Error("Not authenticated.");
      const studentId = authRes.user.id;

      let uploadedPath: string | null = null;
      if (uploadFile) {
        const path = buildSubmissionPath(assignment.id, studentId, uploadFile.name);
        uploadedPath = await uploadAndReturnPath(path, uploadFile);
      }

      const payload = {
        assignment_id: assignment.id,
        student_id: studentId,
        answer_text: answerText || null,
        file_url: uploadedPath,
      };
      const { error: insErr } = await supabase.from("assignment_submissions").insert(payload);
      if (insErr) throw new Error(insErr.message || "Insert failed.");

      setOkMsg("Submission uploaded successfully.");
      setShowSuccess(true);
      setAnswerText("");
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSubmitted?.();

      try {
        const { count: cnt } = await supabase
          .from("assignment_submissions")
          .select("*", { count: "exact", head: true })
          .eq("assignment_id", assignment.id)
          .eq("student_id", studentId);
        setAttemptsUsed(cnt ?? attemptsUsed);
      } catch {}

      // refresh student's latest submission after successful submit
      try {
        const { data: last } = await supabase
          .from("assignment_submissions")
          .select("id, assignment_id, student_id, file_url, answer_text, submitted_at")
          .eq("assignment_id", assignment.id)
          .eq("student_id", studentId)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (last) {
          setMySubmission(last as SubmissionRow);
          const rawPath = (last as any).file_url as string | null;
          if (rawPath) {
            const url = await toViewUrl(rawPath);
            setMySubmissionUrl(url ?? (rawPath.startsWith("http") ? rawPath : null));
            setMyFileExtLower(fileExt(rawPath).toLowerCase());
          } else {
            setMySubmissionUrl(null);
            setMyFileExtLower("");
          }
        }
      } catch {}
    } catch (e: any) {
      const msg = e?.message || e?.error_description || e?.error || "Submit failed.";
      console.error("SUBMIT_ERROR:", e);
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = fileMeta?.file_name || fileMeta?.Name || "";
  const initials = (s: Student) => {
    const f = (s.first_name || "").trim();
    const l = (s.last_name || "").trim();
    return (f[0] || "").toUpperCase() + (l[0] || "").toUpperCase();
  };
  const fullName = (s: Student) => [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");

  // 🔁 counts reflect filtered list
  const submittedCount = filteredStudents.filter((s) => {
    const sub = subsByStudent[s.id];
    return Boolean(sub?.submitted_at || sub?.file_url || sub?.answer_text);
  }).length;
  const totalCount = filteredStudents.length;

  const attemptsLimit = assignment?.max_attempts ?? null;
  const attemptsReached = attemptsLimit != null && attemptsUsed >= attemptsLimit;

  return (
    <div className="w-full">
      {showSuccess && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-success-title"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center gap-3 bg-emerald-600/95 px-5 py-4 text-white">
              <div className="rounded-full bg-white/10 p-2">
                <CheckCircleIcon className="h-6 w-6" />
              </div>
              <h2 id="submit-success-title" className="text-base font-semibold">
                Submission Complete
              </h2>
            </div>
            <div className="px-5 pb-5 pt-4">
              <p className="text-sm text-slate-700">Your assignment was submitted successfully.</p>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setShowSuccess(false)}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-[1] border-b border-slate-200 bg-white/80 shadow-sm supports-[backdrop-filter]:backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-3 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tracking-wide text-slate-700">
                  <InformationCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="truncate">{module ? `Module • ${module.title}` : "Assignment"}</span>
                </span>
                {assignment?.is_private ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-600/20">
                    <LockClosedIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    Private
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-300">
                    Standard
                  </span>
                )}
              </div>
              <h1 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 truncate">
                {assignment?.name ?? "—"}
              </h1>
              {assignment?.instruction ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 whitespace-pre-line">
                  {assignment.instruction}
                </p>
              ) : null}
              {assignment?.is_private && isStudent && (
                <p className="mt-1 text-xs text-indigo-700">
                  This is a private assignment assigned to selected students.
                </p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs ring-1 whitespace-nowrap ${
                isStudent
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-indigo-50 text-indigo-700 ring-indigo-200"
              }`}
            >
              {isStudent ? "Student View" : "Teacher View"}
            </span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto max-w-[1400px] px-3 sm:px-6 py-4 sm:py-6">
        <div className="grid grid-cols-12 gap-3 sm:gap-6">
          {/* LEFT */}
          <div className="col-span-12 lg:col-span-8 xl:col-span-9">
            {isStudent && (
              <div className="rounded-2xl ring-1 ring-slate-200 bg-white p-4 shadow-sm mb-4">
                <div className="mb-3 flex items-center gap-2 min-w-0">
                  <PaperClipIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <h2 className="text-sm font-semibold truncate">Your Submission</h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label htmlFor="answer-text" className="mb-1 block text-xs font-medium text-slate-600">
                      Answer (text)
                    </label>
                    <textarea
                      id="answer-text"
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="Write your answer here…"
                      className="h-48 w-full resize-y rounded-xl border bg-white p-3 text-sm outline-none ring-1 ring-transparent transition focus:ring-2 focus:ring-indigo-500"
                      aria-label="Answer text"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Tip: You can use the AI Grammar Check to refine your answer.
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Attempts used: {attemptsUsed}
                      {attemptsLimit != null ? ` of ${attemptsLimit}` : " (unlimited)"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
                        onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                        className="hidden"
                        id="student-assignment-file"
                      />
                      <label
                        htmlFor="student-assignment-file"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        title="Attach a file to your submission"
                      >
                        <ArrowUpOnSquareIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{uploadFile ? uploadFile.name : "Attach file (optional)"}</span>
                      </label>
                      {uploadFile ? (
                        <button
                          type="button"
                          onClick={() => {
                            setUploadFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          title="Remove file"
                        >
                          <XMarkIcon className="h-4 w-4" aria-hidden="true" /> Clear
                        </button>
                      ) : null}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || attemptsReached || !windowState.isOpen}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                      aria-busy={submitting ? "true" : "false"}
                      title={
                        !windowState.isOpen
                          ? windowState.reason || "Submission closed"
                          : attemptsReached
                          ? "No attempts remaining"
                          : "Submit your answer"
                      }
                    >
                      <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
                      {submitting ? "Submitting…" : "Submit Assignment"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {isStudent && (
              <div className="rounded-2xl ring-1 ring-slate-200 bg-white p-4 shadow-sm mb-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <SparklesIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <h2 className="text-sm font-semibold truncate">AI Grammar Check</h2>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!answerText.trim()) return;
                      setGrammarLoading(true);
                      setFeedback("");
                      setCorrected("");
                      setTipsText("");
                      try {
                        const rawText = await getGrammarText(answerText);
                        const parsed = parseGrammarResponse(String(rawText ?? ""));
                        setCorrected(parsed.corrected || "—");
                        const issueBullets = toFlatBullets(parsed.issuesBlock || "");
                        setFeedback(
                          issueBullets.length ? issueBullets.map((b) => `• ${b}`).join("\n") : "No issues found."
                        );
                        const tipsBullets = parsed.tips ? toFlatBullets(parsed.tips) : [];
                        setTipsText(tipsBullets.length ? tipsBullets.map((b) => `• ${b}`).join("\n") : "");
                      } finally {
                        setGrammarLoading(false);
                      }
                    }}
                    disabled={grammarLoading || !answerText.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 whitespace-nowrap"
                    title="Analyze your answer and get suggestions"
                  >
                    <ChatBubbleLeftRightIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {grammarLoading ? "Checking…" : "Check grammar"}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-xl border p-3">
                    <div className="mb-1 text-xs font-semibold text-slate-700">Corrected Version</div>
                    <textarea
                      value={corrected}
                      readOnly
                      className="h-44 w-full resize-none rounded-lg bg-slate-50 p-2 text-sm outline-none"
                      placeholder="Corrected text will appear here…"
                      aria-label="Corrected version"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAnswerText(corrected)}
                        disabled={!corrected}
                        className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                      >
                        Use as answer
                      </button>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(corrected)}
                        disabled={!corrected}
                        className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="mb-1 text-xs font-semibold text-slate-700">Grammar Issues &amp; Explanations</div>
                    <textarea
                      value={feedback}
                      readOnly
                      className="h-44 w-full resize-none rounded-lg bg-slate-50 p-2 text-sm outline-none"
                      placeholder="AI feedback will appear here…"
                      aria-label="AI feedback"
                    />
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="mb-1 text-xs font-semibold text-slate-700">Tips</div>
                    <textarea
                      value={tipsText}
                      readOnly
                      className="h-36 w-full resize-none rounded-lg bg-slate-50 p-2 text-sm outline-none"
                      placeholder="No tips yet."
                      aria-label="AI tips"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ⭐ NEW: Latest Submission (Student) */}
            {isStudent && (
              <div className="rounded-2xl ring-1 ring-slate-200 bg-white p-4 shadow-sm mb-4">
                <div className="mb-3 flex items-center gap-2 min-w-0">
                  <DocumentTextIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <h2 className="text-sm font-semibold truncate">Latest Submission</h2>
                </div>

                {!mySubmission ? (
                  <div className="text-sm text-slate-500">You haven’t submitted anything yet.</div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500">Submitted: {fmtDateTime(mySubmission.submitted_at)}</div>

                    {mySubmission.answer_text?.trim() ? (
                      <div className="rounded-lg border bg-slate-50 p-3 text-sm whitespace-pre-wrap">
                        {mySubmission.answer_text}
                      </div>
                    ) : null}

                    {renderMySubmissionViewer()}
                  </div>
                )}
              </div>
            )}

            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 min-w-0">
                <DocumentTextIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate">Preview</span>
              </div>
              {displayName ? (
                <span className="truncate text-xs text-slate-500" title={displayName}>
                  {displayName}
                </span>
              ) : null}
            </div>
            <div className="rounded-2xl ring-1 ring-slate-200 bg-white p-2 sm:p-3">
              {!assignment && renderSkeleton(2)}
              {assignment && renderFileViewer()}
            </div>

            {err ? (
              <div
                role="alert"
                aria-live="polite"
                className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                <InformationCircleIcon className="mt-0.5 h-5 w-5" aria-hidden="true" />
                <span>{err}</span>
              </div>
            ) : null}
            {okMsg ? (
              <div
                role="status"
                aria-live="polite"
                className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              >
                <CheckCircleIcon className="mt-0.5 h-5 w-5" aria-hidden="true" />
                <span>{okMsg}</span>
              </div>
            ) : null}
          </div>

          {/* RIGHT (Teacher) */}
          {isTeacher && (
            <div className="col-span-12 lg:col-span-4 xl:col-span-3">
              {renderAssignmentDetails()}

              <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <UsersIcon className="h-5 w-5 text-slate-600 shrink-0" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-slate-900 truncate">Submission Status</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                        <CheckCircleSolid className="h-3.5 w-3.5" /> {submittedCount}
                      </span>
                      <span className="text-[11px] text-slate-500 whitespace-nowrap">of {totalCount}</span>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      {assignment?.is_private
                        ? "Private assignment: showing only selected students."
                        : "Standard assignment: showing all students in this class."}
                    </p>

                    {/* One-word action button */}
                    {assignment?.is_private && teacherId && (
                      <button
                        type="button"
                        onClick={() => setAudienceOpen(true)}
                        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] hover:bg-white"
                        title="Edit audience"
                      >
                        <UserGroupIcon className="h-3.5 w-3.5" />
                        Audience
                      </button>
                    )}
                  </div>
                </div>

                {/* NEW: Filter/Search toolbar */}
                <div className="px-3 sm:px-4 py-2 border-b bg-white">
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <div className="relative flex-1">
                      <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        placeholder="Search student name…"
                        className="w-full rounded-md border pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        aria-label="Search student"
                      />
                    </div>
                    <select
                      value={sectionFilter === "ALL" ? "ALL" : String(sectionFilter)}
                      onChange={(e) => setSectionFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                      className="rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label="Filter by section"
                    >
                      <option value="ALL">All sections</option>
                      {sectionOptions.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name || `Section ${id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="max-h-[74vh] overflow-auto divide-y divide-slate-100" aria-busy={loadingRoster ? "true" : "false"}>
                  {!loadingRoster && filteredStudents.length === 0 && (
                    <div className="px-4 py-10 text-center text-sm text-slate-500">
                      <UsersIcon className="mx-auto mb-2 h-6 w-6 text-slate-300" aria-hidden="true" />
                      No students match your filter.
                    </div>
                  )}

                  {loadingRoster && (
                    <div className="p-4">
                      <div className="animate-pulse space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-slate-200" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3 w-1/2 rounded bg-slate-200" />
                              <div className="h-3 w-1/3 rounded bg-slate-100" />
                            </div>
                            <div className="h-5 w-24 rounded bg-slate-100" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!loadingRoster &&
                    filteredStudents.map((s) => {
                      const sub = subsByStudent[s.id];
                      const submitted = Boolean(sub?.submitted_at || sub?.file_url || sub?.answer_text);
                      return (
                        <div key={s.id} className="px-3 py-3 flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center ring-1 ring-white/60" title={fullName(s) || "Student"}>
                            {s.first_name || s.last_name ? (
                              <span className="text-xs font-semibold text-slate-700">{initials(s)}</span>
                            ) : (
                              <UserCircleIcon className="h-7 w-7 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-800">
                              {fullName(s) || "Unnamed Student"}
                            </div>
                            <div className="text-xs text-slate-500">{s.section_name ? s.section_name : "No section"}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {submitted ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                                title="Student has submitted"
                              >
                                <CheckCircleSolid className="h-4 w-4" aria-hidden="true" />
                                Submitted
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-rose-50 text-rose-700 ring-1 ring-rose-600/20"
                                title="Student has not submitted"
                              >
                                <XCircleIcon className="h-4 w-4" aria-hidden="true" />
                                Not submitted
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* RIGHT (Student) */}
          {isStudent && (
            <div className="col-span-12 lg:col-span-4 xl:col-span-3">
              {renderAssignmentDetails()}
              {/* Student grade + feedback components kept earlier */}
            </div>
          )}
        </div>
      </div>

      {/* Manage Audience (teacher; only for private assignments) */}
      {assignment?.is_private && isTeacher && teacherId && (
        <ManageAudienceSheet
          open={audienceOpen}
          onClose={() => setAudienceOpen(false)}
          assignmentId={assignmentId}
          teacherId={teacherId}
          initialSelectedIds={audienceIds ?? []}
          onSaved={(nextIds) => setAudienceIds(nextIds)}
        />
      )}
    </div>
  );
}
