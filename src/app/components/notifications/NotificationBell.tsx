// /src/app/components/AddAssignmentModal.tsx
"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  XMarkIcon,
  DocumentArrowUpIcon,
  ClipboardDocumentCheckIcon,
<<<<<<< HEAD
  TrashIcon,
  LockClosedIcon,
  UserGroupIcon,
  CheckIcon,
  ExclamationTriangleIcon,
=======
  DocumentPlusIcon,
  AcademicCapIcon,
  FolderPlusIcon,
  InformationCircleIcon,
  CheckBadgeIcon, // NEW: icon for graded
  LockClosedIcon, // NEW: for private-assignment notices
>>>>>>> a949144 (feat: ManageAssignmentAccessModal + assignment/notification UI updates)
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabase";

<<<<<<< HEAD
/* ----------------------------- Props ----------------------------- */
interface AddAssignmentModalProps {
  closeModal: () => void;
  moduleId: string;
  onAssignmentAdded: () => void;
  /** When true, renders as an inline card (for the center viewer) instead of a modal layout. */
  inline?: boolean;
=======
/* ------------------------------- Types ------------------------------- */
type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null; // unused for navigation
  payload: any;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
};

type MetaPiece = {
  mod?: string | null;
  qtr?: string | null;
  quizTitle?: string | null;
  quizType?: "quiz" | "pre_test" | "post_test" | null;
  assignmentName?: string | null;
  score?: number | null; // NEW
};

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");
const iconForType: Record<string, ElementType> = {
  assignment_submitted: ClipboardDocumentCheckIcon,
  assignment_graded: CheckBadgeIcon, // NEW
  // --- Assignment-only additions ---
  assignment_new: DocumentPlusIcon,
  assignment_private_assigned: LockClosedIcon,
  assignment_private_unassigned: TrashIcon,
  // ----------------------------------
  quiz_due_ended: ExclamationTriangleIcon,
  module_created: FolderPlusIcon,
  assignment_published: DocumentPlusIcon,
  quiz_published: AcademicCapIcon,
  assignment_due_soon: ClockIcon,
  quiz_due_soon: ClockIcon,
  default: BellAlertIcon,
};
const iconByType = (t: string) => iconForType[t] || iconForType.default;

/* Helpers */
const isRlsBlock = (res: any) => res?.status === 403 || res?.error?.code === "42501";
const prettyQuizType = (t?: string | null) =>
  t === "pre_test" ? "Pre-Test" : t === "post_test" ? "Post-Test" : t === "quiz" ? "Quiz" : null;

// Extract metadata commonly used by UI (from payload only)
const extractMetaFromPayload = (p: any) => {
  const mod =
    p?.module_title ??
    p?.module_name ??
    p?.module?.title ??
    p?.moduleTitle ??
    p?.moduleName ??
    null;
  const qtr = p?.quarter_name ?? p?.quarter?.name ?? p?.quarterName ?? null;
  const quizTitle = p?.quiz_title ?? p?.quiz?.title ?? null;
  const quizType = p?.quiz_type ?? p?.quiz?.type ?? null;
  const assignmentName = p?.assignment_name ?? p?.assignment?.name ?? null;
  const score = p?.score ?? p?.grade ?? null; // NEW
  return { mod, qtr, quizTitle, quizType, assignmentName, score } as MetaPiece;
};

// Very light “sanity” detector for quiz/new-posted notices
const isQuizPosted = (r: NotifRow) =>
  r.type === "quiz_published" || r.payload?.quiz_id != null;

/** Fallback extractor: get ?assignmentId=... from a relative link_path if payload is missing */
function assignmentIdFromLink(link?: string | null): string | null {
  if (!link) return null;
  try {
    // URL can be relative; prefix dummy origin so URLSearchParams works
    const u = new URL(link, "https://dummy.local");
    const v = u.searchParams.get("assignmentId");
    return v && v.length > 0 ? v : null;
  } catch {
    // Regex fallback if the URL constructor fails for any reason
    const m = link.match(/[?&]assignmentId=([0-9a-f-]{36})/i);
    return m?.[1] ?? null;
  }
}

/* ------------------------------ Bell -------------------------------- */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const recountUnread = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { count } = await supabase
      .from("notifications")
      .select("*", { head: true, count: "exact" })
      .eq("recipient_user_id", uid)
      .is("deleted_at", null)
      .is("read_at", null);
    setUnread(count ?? 0);
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      await recountUnread();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;

      channel = supabase
        .channel(`notif-${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` },
          async () => {
            if (!active) return;
            await recountUnread();
          }
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [recountUnread]);

  useEffect(() => {
    const onRefresh = () => void recountUnread();
    window.addEventListener("notif:refresh", onRefresh as EventListener);
    return () => window.removeEventListener("notif:refresh", onRefresh as EventListener);
  }, [recountUnread]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50 transition"
        aria-label="Notifications"
      >
        <BellIcon className="h-5 w-5 text-slate-700" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.15rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-2 w-[26rem] max-w-[92vw]">
          <NotificationsPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
>>>>>>> a949144 (feat: ManageAssignmentAccessModal + assignment/notification UI updates)
}

/* ----------------------------- CONFIG ---------------------------- */
const MAX_MB = 20;
const ALLOWED = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];
const REQUEST_TIMEOUT_MS = 20_000;

/* ----------------------------- HELPERS --------------------------- */
function fileExt(name: string) {
  const parts = name.split(".");
  return (parts[parts.length - 1] || "").toLowerCase();
}
function slugBase(name: string) {
  const base = name.replace(/\.[^/.]+$/, "");
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
function uuidLike() {
  return typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2);
}
function buildAssignmentFilePath(assignmentId: string, file: File) {
  return `assignments/${assignmentId}/${slugBase(file.name)}-${uuidLike()}.${fileExt(file.name)}`;
}

async function withTimeout<T>(p: Promise<T>, ms: number, abort?: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      try {
        abort?.abort();
      } catch {}
      reject(new Error(`Request exceeded ${Math.round(ms / 1000)}s and was cancelled.`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/* ---------------------- Student Picker (inline sheet) ---------------------- */
type SectionRow = { id: number; name: string };
type StudentRow = {
  id: string;
  first_name: string | null;
  middle_name?: string | null;
  last_name: string | null;
  section_id: number | null;
  section_name?: string | null;
};

function PickStudentsSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(value));

  useEffect(() => setSelected(new Set(value)), [value]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? "";

      const { data: meTeacher } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", userId)
        .single();

      const teacherId = meTeacher?.id ?? null;
      if (!teacherId) {
        setSections([]);
        setActiveSectionId(null);
        setLoading(false);
        return;
      }

      const { data: secIdsRaw } = await supabase
        .from("students")
        .select("section_id")
        .eq("teacher_id", teacherId);

      const secIds = Array.from(
        new Set((secIdsRaw ?? []).map((r) => r.section_id).filter(Boolean) as number[])
      );

      let secs: SectionRow[] = [];
      if (secIds.length) {
        const { data } = await supabase
          .from("sections")
          .select("id, name")
          .in("id", secIds)
          .order("name", { ascending: true });
        secs = data ?? [];
      }

      setSections(secs);
      setActiveSectionId(secs[0]?.id ?? null);
      setLoading(false);
    })();
  }, [open]);

  useEffect(() => {
    if (!open || !activeSectionId) {
      setStudents([]);
      return;
    }
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, middle_name, last_name, section_id")
        .eq("section_id", activeSectionId)
        .order("last_name", { ascending: true });

<<<<<<< HEAD
      if (!error) {
        setStudents(
          (data ?? []).map((s) => ({
            ...s,
            section_name: sections.find((x) => x.id === s.section_id)?.name ?? null,
          }))
        );
=======
    const list = (data ?? []) as NotifRow[];
    setRows(list);
    setLoading(false);

    const initialMeta: Record<string, MetaPiece> = {};
    for (const r of list) initialMeta[r.id] = extractMetaFromPayload(r.payload);
    setMetaById(initialMeta);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Batch-enrich missing quarter/module details safely
  const enrichMissing = useCallback(async (items: NotifRow[]) => {
    if (!items.length) return;

    const stableKey = items.map((r) => r.id).join(",");
    if (fetchedBatchRef.current === stableKey) return;
    fetchedBatchRef.current = stableKey;

    const needQuiz: Array<{ notifId: string; quizId: string }> = [];
    const needAssign: Array<{ notifId: string; assignmentId: string }> = [];

    items.forEach((r) => {
      const p = r.payload || {};
      const m = metaById[r.id] || {};
      const hasModQtr = Boolean(m.mod) && Boolean(m.qtr);

      const quizId = p?.quiz_id ?? p?.quizId ?? p?.quiz?.id ?? null;
      // --- Assignment: allow link_path fallback when payload lacks assignment_id
      const assignmentId =
        p?.assignment_id ??
        p?.assignmentId ??
        p?.assignment?.id ??
        assignmentIdFromLink(r.link_path) ??
        null;

      if (!hasModQtr && quizId) needQuiz.push({ notifId: r.id, quizId });
      if (!hasModQtr && assignmentId) needAssign.push({ notifId: r.id, assignmentId });
    });

    if (needQuiz.length === 0 && needAssign.length === 0) return;

    try {
      const quizIds = Array.from(new Set(needQuiz.map((x) => x.quizId)));
      const assignIds = Array.from(new Set(needAssign.map((x) => x.assignmentId)));

      // Quizzes
      let qRows: Array<{ id: string; title: string | null; type: "quiz" | "pre_test" | "post_test" | null; module_id: string | null }> = [];
      if (quizIds.length) {
        const { data: qd } = await supabase
          .from("quizzes")
          .select("id,title,type,module_id")
          .in("id", quizIds);
        qRows = (qd ?? []) as any[];
>>>>>>> a949144 (feat: ManageAssignmentAccessModal + assignment/notification UI updates)
      }
      setLoading(false);
    })();
  }, [open, activeSectionId, sections]);

<<<<<<< HEAD
  const allIdsInSection = useMemo(() => students.map((s) => s.id), [students]);
  const sectionAllChecked = useMemo(
    () => allIdsInSection.length > 0 && allIdsInSection.every((id) => selected.has(id)),
    [allIdsInSection, selected]
  );
  const sectionSomeChecked = useMemo(
    () => allIdsInSection.some((id) => selected.has(id)) && !sectionAllChecked,
    [allIdsInSection, selected, sectionAllChecked]
=======
      // Assignments
      let aRows: Array<{ id: string; name: string | null; module_id: string | null }> = [];
      if (assignIds.length) {
        const { data: ad } = await supabase
          .from("assignments")
          .select("id,name,module_id")
          .in("id", assignIds);
        aRows = (ad ?? []) as any[];
      }

      // Strong typing + Set<string>
      const isNonEmptyString = (x: unknown): x is string => typeof x === "string" && x.length > 0;
      const quizModuleIds = qRows.map((q) => q.module_id).filter(isNonEmptyString);
      const assignModuleIds = aRows.map((a) => a.module_id).filter(isNonEmptyString);
      const moduleIds = Array.from(new Set<string>([...quizModuleIds, ...assignModuleIds]));

      // Modules (+ quarters.name)
      let mRows: Array<{ id: string; title: string | null; quarters?: { name?: string | null } | null }> = [];
      if (moduleIds.length) {
        const { data: md } = await supabase
          .from("modules")
          .select("id,title,quarters(name)")
          .in("id", moduleIds);
        mRows = (md ?? []) as any[];
      }
      const moduleById: Record<string, { title: string | null; quarterName: string | null }> = {};
      mRows.forEach((m) => {
        moduleById[m.id] = { title: m?.title ?? null, quarterName: (m as any)?.quarters?.name ?? null };
      });

      const quizById: Record<string, { title: string | null; type: any; module_id: string | null }> = {};
      qRows.forEach((q) => (quizById[q.id] = q));

      const assignById: Record<string, { name: string | null; module_id: string | null }> = {};
      aRows.forEach((a) => (assignById[a.id] = a));

      const next: Record<string, MetaPiece> = { ...metaById };

      needQuiz.forEach(({ notifId, quizId }) => {
        const q = quizById[quizId];
        if (!q) return;
        const mod = q.module_id ? moduleById[q.module_id]?.title ?? null : null;
        const qtr = q.module_id ? moduleById[q.module_id]?.quarterName ?? null : null;
        const prev = next[notifId] || {};
        next[notifId] = {
          ...prev,
          mod: prev.mod ?? mod ?? null,
          qtr: prev.qtr ?? qtr ?? null,
          quizTitle: prev.quizTitle ?? (q.title ?? null),
          quizType: (prev.quizType as any) ?? (q.type ?? null),
        };
      });

      needAssign.forEach(({ notifId, assignmentId }) => {
        const a = assignById[assignmentId];
        if (!a) return;
        const mod = a.module_id ? moduleById[a.module_id]?.title ?? null : null;
        const qtr = a.module_id ? moduleById[a.module_id]?.quarterName ?? null : null;
        const prev = next[notifId] || {};
        next[notifId] = {
          ...prev,
          mod: prev.mod ?? mod ?? null,
          qtr: prev.qtr ?? qtr ?? null,
          assignmentName: prev.assignmentName ?? (a.name ?? null),
        };
      });

      setMetaById(next);
    } catch (e) {
      console.warn("[notifications] enrich missing meta failed (ok to ignore):", e);
    }
  }, [metaById]);

  useEffect(() => {
    if (!loading && rows.length) {
      const needing = rows.filter((r) => {
        const p = r.payload || {};
        const m = metaById[r.id] || {};
        const hasModQtr = Boolean(m.mod) && Boolean(m.qtr);
        const needs =
          !hasModQtr &&
          (
            p?.assignment_id ||
            p?.assignmentId ||
            p?.assignment?.id ||
            assignmentIdFromLink(r.link_path) // assignment-only fallback
          ) ||
          (p?.quiz_id || p?.quizId || p?.quiz?.id);
        return Boolean(needs);
      });
      if (needing.length) enrichMissing(needing);
    }
  }, [rows, loading, metaById, enrichMissing]);

  const getUid = async () => (await supabase.auth.getUser()).data.user?.id ?? null;

  /* ---------- Mutations (with RPC fallbacks for RLS) ---------- */
  const markAllRead = async () => {
    setBusy(true);
    const toMark = rows.filter((r) => !r.read_at).map((r) => r.id);
    const prev = rows;

    try {
      setRows((xs) => xs.map((r) => (r.read_at ? r : { ...r, read_at: new Date().toISOString() })));

      const uid = await getUid();
      if (!uid) return;

      let call: any = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_user_id", uid)
        .is("deleted_at", null)
        .is("read_at", null)
        .select("id");

      if (isRlsBlock(call)) {
        const results = await Promise.all(toMark.map((id) => supabase.rpc("notif_mark_read", { _id: id })));
        const anyErr = results.find((r) => r.error);
        if (anyErr) throw anyErr;
      } else if (toMark.length > 0 && (!call.data || call.data.length === 0)) {
        throw new Error("no rows updated");
      }

      dispatchRefresh();
    } catch (err) {
      setRows(prev);
      console.error("[notifications] markAllRead failed:", err);
      dispatchRefresh();
    } finally {
      setBusy(false);
    }
  };

  const deleteAll = async () => {
    setBusy(true);
    const prev = rows;

    try {
      setRows([]);

      const uid = await getUid();
      if (!uid) return;

      let call: any = await supabase
        .from("notifications")
        .update({ deleted_at: new Date().toISOString() })
        .eq("recipient_user_id", uid)
        .is("deleted_at", null)
        .select("id");

      if (isRlsBlock(call)) {
        const ids = prev.map((r) => r.id);
        const results = await Promise.all(ids.map((id) => supabase.rpc("notif_soft_delete", { _id: id })));
        const anyErr = results.find((r) => r.error);
        if (anyErr) throw anyErr;
      } else if (prev.length > 0 && (!call.data || call.data.length === 0)) {
        throw new Error("no rows updated");
      }

      dispatchRefresh();
    } catch (err) {
      setRows(prev);
      console.error("[notifications] deleteAll failed:", err);
      dispatchRefresh();
    } finally {
      setBusy(false);
    }
  };

  const markOneRead = async (id: string) => {
    const prev = rows;

    setRows((xs) =>
      xs.map((r) => (r.id === id && !r.read_at ? { ...r, read_at: new Date().toISOString() } : r))
    );

    const uid = await getUid();
    if (!uid) return;

    let call: any = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_user_id", uid)
      .select("id, recipient_user_id");

    if (isRlsBlock(call)) call = await supabase.rpc("notif_mark_read", { _id: id });

    if (call.error || !call.data || (Array.isArray(call.data) && call.data.length === 0)) {
      setRows(prev);
      console.error("[notifications] markOneRead failed:", call.error ?? "no rows updated");
    }

    dispatchRefresh();
  };

  const deleteOne = async (id: string) => {
    const prev = rows;

    setRows((xs) => xs.filter((r) => r.id !== id));

    const uid = await getUid();
    if (!uid) return;

    let call: any = await supabase
      .from("notifications")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_user_id", uid)
      .select("id, recipient_user_id");

    if (isRlsBlock(call)) call = await supabase.rpc("notif_soft_delete", { _id: id });

    if (call.error || !call.data || (Array.isArray(call.data) && call.data.length === 0)) {
      setRows(prev);
      console.error("[notifications] deleteOne failed:", call.error ?? "no rows updated");
    }

    dispatchRefresh();
  };

  /* -------------------------- Header actions -------------------------- */
  const HeaderActions = useMemo(
    () => (
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={markAllRead}
          disabled={busy || loading || rows.length === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title="Mark all as read"
        >
          <CheckIcon className="h-4 w-4" />
          Mark all as read
        </button>
        <button
          onClick={() => setConfirmDlg({ mode: "all" })}
          disabled={busy || loading || rows.length === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          title="Delete all"
        >
          <TrashIcon className="h-4 w-4" />
          Delete all
        </button>
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100" aria-label="Close">
          <XMarkIcon className="h-5 w-5 text-slate-600" />
        </button>
      </div>
    ),
    [busy, loading, rows.length, onClose]
>>>>>>> a949144 (feat: ManageAssignmentAccessModal + assignment/notification UI updates)
  );

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleSectionAll = () => {
    const next = new Set(selected);
    if (sectionAllChecked) allIdsInSection.forEach((id) => next.delete(id));
    else allIdsInSection.forEach((id) => next.add(id));
    setSelected(next);
  };

  const save = () => {
    onChange(Array.from(selected));
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-[720px] max-h-[85vh] bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
<<<<<<< HEAD
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-gray-50">
=======
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
          <div className="text-sm font-semibold text-slate-900">Notifications</div>
          {HeaderActions}
        </div>

        {/* List */}
        <div className="max-h-[70vh] overflow-auto" aria-busy={loading}>
          {loading ? (
            <ul className="divide-y divide-slate-100 px-4 py-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="grid grid-cols-[2.25rem,1fr,auto,auto] items-center gap-3 py-3">
                  <div className="flex items-center justify-center">
                    <div className="h-5 w-5 rounded-full bg-slate-200 animate-pulse" />
                  </div>
                  <div className="min-w-0 w-full">
                    <div className="h-3 w-40 max-w-[70%] rounded bg-slate-200 animate-pulse" />
                    <div className="mt-2 h-3 w-56 max-w-[90%] rounded bg-slate-100 animate-pulse" />
                    <div className="mt-1 h-2 w-24 rounded bg-slate-100 animate-pulse" />
                  </div>
                  <div className="justify-self-end">
                    <div className="h-6 w-14 rounded bg-slate-100 animate-pulse" />
                  </div>
                  <div className="justify-self-end">
                    <div className="h-6 w-7 rounded bg-slate-100 animate-pulse" />
                  </div>
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No notifications.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const Icon = iconByType(r.type);
                const unread = !r.read_at;

                const payloadMeta = metaById[r.id] || {};
                const { mod, qtr, quizTitle, quizType, assignmentName, score } = payloadMeta;
                const needsMeta = !mod || !qtr;

                return (
                  <li key={r.id}>
                    {/* Four columns: icon (click to view) • message • Read • Delete */}
                    <div className="grid grid-cols-[2.25rem,1fr,auto,auto] items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
                      {/* Icon column (opens details) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewId(r.id);
                        }}
                        className="relative flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        title="View details"
                        aria-label="View details"
                      >
                        <Icon className={cx("h-5 w-5", unread ? "text-indigo-600" : "text-slate-400")} />
                        {unread && (
                          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white" />
                        )}
                      </button>

                      {/* Message — NOT clickable */}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {r.title}
                          {needsMeta && (
                            <span className="ml-2 align-middle rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 ring-1 ring-amber-200">
                              Missing details
                            </span>
                          )}
                        </div>

                        {r.body && <div className="line-clamp-2 text-xs text-slate-600">{r.body}</div>}

                        {(quizType || quizTitle || assignmentName || typeof score === "number") && (
                          <div className="mt-0.5 text-[11px] text-slate-600">
                            {quizType || quizTitle ? (
                              <>
                                {prettyQuizType(quizType)}
                                {quizType && quizTitle ? ": " : null}
                                {quizTitle || null}
                              </>
                            ) : (
                              <>
                                {assignmentName ? (
                                  <>
                                    Assignment: <span className="font-medium">{assignmentName}</span>
                                  </>
                                ) : null}
                                {assignmentName && typeof score === "number" ? <span> • </span> : null}
                                {typeof score === "number" ? (
                                  <>
                                    Score: <span className="font-medium">{score}</span>
                                  </>
                                ) : null}
                              </>
                            )}
                          </div>
                        )}

                        {(qtr || mod) && (
                          <div className="mt-1 text-[11px] text-slate-500">
                            {qtr ? (
                              <>
                                Quarter: <span className="font-medium">{qtr}</span>
                              </>
                            ) : null}
                            {qtr && mod ? <span> • </span> : null}
                            {mod ? (
                              <>
                                Module: <span className="font-medium">{mod}</span>
                              </>
                            ) : null}
                          </div>
                        )}

                        <div className="mt-1 text-[11px] text-slate-400">
                          {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>

                      {/* Read */}
                      <div className="justify-self-end">
                        {!r.read_at && (
                          <button
                            onClick={() => markOneRead(r.id)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 hover:bg-emerald-50"
                            title="Mark as read"
                          >
                            Read
                          </button>
                        )}
                      </div>

                      {/* Delete */}
                      <div className="justify-self-end">
                        <button
                          onClick={() => setConfirmDlg({ mode: "one", id: r.id, title: r.title })}
                          className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-600/20 hover:bg-rose-50"
                          title="Delete"
                          aria-label="Delete notification"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Centered confirmation (portal to <body>) */}
      {confirmDlg && (
        <PortalCenteredConfirm
          title={confirmDlg.mode === "all" ? "Delete all notifications?" : "Delete this notification?"}
          body={
            confirmDlg.mode === "all"
              ? "This will remove all visible notifications. You can’t undo this."
              : `You are about to delete “${(confirmDlg as any).title ?? "Notification"}”.`
          }
          confirmLabel="Delete"
          onCancel={() => setConfirmDlg(null)}
          onConfirm={async () => {
            const local = confirmDlg;
            setConfirmDlg(null);
            if (local.mode === "all") await deleteAll();
            else await deleteOne((local as any).id);
          }}
        />
      )}

      {/* View Details modal (portal) */}
      {activeRow && (
        <NotifDetailsModal
          row={activeRow}
          meta={activeMeta}
          onClose={() => setViewId(null)}
          onMarkRead={() => markOneRead(activeRow.id)}
          onDelete={() => {
            setViewId(null);
            setConfirmDlg({ mode: "one", id: activeRow.id, title: activeRow.title });
          }}
        />
      )}
    </>
  );
}

/* ----------------------- Centered Confirm (Portal) ------------------- */
function PortalCenteredConfirm({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
}: {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const modal = (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-rose-50 p-2 ring-1 ring-rose-100">
            <TrashIcon className="h-5 w-5 text-rose-600" />
          </div>
>>>>>>> a949144 (feat: ManageAssignmentAccessModal + assignment/notification UI updates)
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold truncate">
              Select students for this private assignment
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 truncate">
              Optional at create-time — you can also assign students later in the Assignment page.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200" aria-label="Close">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

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
                {!sections.length && (
                  <p className="text-sm text-gray-500 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4" /> No sections found for your students.
                  </p>
                )}
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
                >
                  {sectionAllChecked ? "Unselect all" : "Select all"}
                  <CheckIcon className={`w-4 h-4 ${sectionSomeChecked ? "opacity-60" : ""}`} />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {students.map((st) => {
                  const checked = selected.has(st.id);
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
                      <UserGroupIcon className="w-5 h-5 text-gray-500" />
                      <span className="truncate">
                        {[st.last_name, st.first_name].filter(Boolean).join(", ") || "Unnamed"}
                      </span>
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
            Use selection
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Main Component --------------------------- */
export default function AddAssignmentModal({
  closeModal,
  moduleId,
  onAssignmentAdded,
  inline = false,
}: AddAssignmentModalProps) {
  // required
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [maxScore, setMaxScore] = useState<string>("");

  // optional
  const [maxAttempts, setMaxAttempts] = useState<string>("");
  const [availableFrom, setAvailableFrom] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>("");

  // Privacy / preselect
  const [isPrivate, setIsPrivate] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [preSelectedStudentIds, setPreSelectedStudentIds] = useState<string[]>([]);

  // file & ui
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // debug
  const [debugText, setDebugText] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const dropRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => {
    setTimeout(() => firstInputRef.current?.focus(), 0);
    return () => {
      try { inflight.current?.abort(); } catch {}
    };
  }, []);

  const canSubmit = useMemo(
    () => !loading && name.trim() && instruction.trim() && maxScore.trim(),
    [loading, name, instruction, maxScore]
  );

  const openFilePicker = () => fileInputRef.current?.click();

  const validateFile = (f: File): string | null => {
    const ext = `.${(f.name.split(".").pop() || "").toLowerCase()}`;
    if (!ALLOWED.includes(ext)) return `Unsupported file type. Allowed: ${ALLOWED.join(", ")}`;
    if (f.size > MAX_MB * 1024 * 1024) return `File too large. Max ${MAX_MB}MB.`;
    return null;
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0] ?? null;
    if (f) {
      const err = validateFile(f);
      if (err) {
        setError(err);
        setFile(null);
      } else {
        setError(null);
        setFile(f);
      }
    }
    e.currentTarget.value = "";
  };

  const clearFile = () => setFile(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      setError(err);
      setFile(null);
    } else {
      setError(null);
      setFile(f);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /** Upsert private recipients safely after creation (RLS-friendly). */
  const upsertRecipients = async (assignmentId: string) => {
    if (!isPrivate || preSelectedStudentIds.length === 0) {
      return { attempted: 0, inserted: 0, error: null as any };
    }

    const rows = preSelectedStudentIds.map((sid) => ({
      assignment_id: assignmentId,
      student_id: sid,
    }));

    // NOTE: some supabase-js versions only allow a single argument for .select()
    const { data, error } = await supabase
      .from("assignment_students")
      .upsert(rows, {
        onConflict: "assignment_id,student_id",
        ignoreDuplicates: true,
      })
      .select("assignment_id,student_id"); // no second {count,head} arg

    return {
      attempted: rows.length,
      inserted: data?.length ?? 0, // we rely on returned rows length
      error,
      data,
    };
  };

  // Submit to REST API with timeout & debug capture
  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!canSubmit || loading) return;

    if (availableFrom && dueAt) {
      const from = new Date(availableFrom);
      const to = new Date(dueAt);
      if (to < from) {
        setError("Due date must be after (or equal to) Available From.");
        return;
      }
    }

    setLoading(true);
    setError(null);
    setShowDebug(false);
    setDebugText(null);
    setProgress(10);

    let who: { id?: string | null; email?: string | null } = {};
    let accessToken: string | undefined;
    try {
      const [{ data: userData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
      who = { id: userData.user?.id ?? null, email: (userData.user as any)?.email ?? null };
      accessToken = sessionData.session?.access_token;
    } catch {}

    const form = new FormData();
    form.set("module_id", moduleId);
    form.set("name", name);
    form.set("instruction", instruction);
    form.set("max_score", maxScore);
    if (maxAttempts.trim()) form.set("max_attempts", maxAttempts);
    if (availableFrom) form.set("available_from", availableFrom);
    if (dueAt) form.set("due_at", dueAt);
    if (file) form.append("file", file, file.name);

    // Private flags (client intent)
    form.set("is_private", isPrivate ? "true" : "false");
    form.set("visibility", isPrivate ? "private" : "standard");

    // Let the API optionally handle recipients too
    if (isPrivate && preSelectedStudentIds.length) {
      form.set("private_student_ids", JSON.stringify(preSelectedStudentIds));
    }

    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (isPrivate) headers["X-Is-Private"] = "1";

    if (inflight.current) {
      try { inflight.current.abort(); } catch {}
    }
    const controller = new AbortController();
    inflight.current = controller;

    const postUrl = `/api/assignments${isPrivate ? "?is_private=1" : ""}`;

    try {
      setProgress(35);
      const res = await withTimeout(
        fetch(postUrl, { method: "POST", body: form, headers, signal: controller.signal }),
        REQUEST_TIMEOUT_MS,
        controller
      );
      setProgress(60);

      const rawText = await res.text();
      let json: any = null;
      try { json = rawText ? JSON.parse(rawText) : null; } catch {}

      const created =
        json?.assignment ??
        json?.data ??
        (json && typeof json === "object" ? json : null);

      let createdId: string | undefined = created?.id ?? json?.id ?? undefined;
      const serverIsPrivate: boolean | undefined =
        created?.is_private ??
        (typeof json?.is_private === "boolean" ? json.is_private : undefined);

      if (!createdId) {
        const { data: last, error: lastErr } = await supabase
          .from("assignments")
          .select("id")
          .eq("module_id", moduleId)
          .eq("name", name)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!lastErr && last?.id) createdId = last.id;
      }

      if (isPrivate && createdId && serverIsPrivate !== true) {
        await supabase.from("assignments").update({ is_private: true }).eq("id", createdId);
      }

      setProgress(75);
      let recipientsResult: any = null;
      if (createdId) {
        recipientsResult = await upsertRecipients(createdId);
      }

      const debugPayload: any = {
        endpoint: postUrl,
        status: res.status,
        statusText: res.statusText,
        now: new Date().toISOString(),
        user: who,
        moduleId,
        authHeaderPresent: Boolean(accessToken),
        clientPayloadPreview: {
          name,
          instructionLength: instruction.length,
          maxScore: Number(maxScore),
          maxAttempts: maxAttempts ? Number(maxAttempts) : null,
          availableFrom: availableFrom || null,
          dueAt: dueAt || null,
          isPrivateRequested: isPrivate,
          preSelectedCount: preSelectedStudentIds.length,
          file: file ? { name: file.name, size: file.size, type: file.type } : null,
        },
        serverBody: json ?? rawText,
        createdId,
        serverIsPrivate,
        recipientsUpsert: recipientsResult,
      };
      setDebugText(JSON.stringify(debugPayload, null, 2));
      console.debug("[AddAssignment DEBUG]", debugPayload);

      if (!res.ok || (json && json.ok === false)) {
        const msgRaw = (json && (json.error || json.message)) || rawText || "Failed to add assignment.";
        let msg = String(msgRaw);
        if (/JWT expired|Invalid token|Not authenticated/i.test(msg)) {
          msg = "Your session expired. Please sign-in again and retry.";
        }
        setShowDebug(true);
        throw new Error(msg);
      }

      if (recipientsResult?.error) {
        setError(
          "Assignment saved, but adding recipients failed due to permissions. Please open the assignment and add students there."
        );
        setShowDebug(true);
      }

      setProgress(100);
      onAssignmentAdded();
      closeModal();
    } catch (err: any) {
      const pretty =
        err?.name === "AbortError"
          ? "Saving took too long and was cancelled. Please try again (your network may be slow or the server busy)."
          : String(err?.message || err);
      setError(pretty);
      setShowDebug(true);
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 400);
      inflight.current = null;
    }
  };

  /* --------------------------- Shared content --------------------------- */
  const headerCls = inline
    ? "border-b border-slate-200 bg-white px-6 pt-5 pb-3"
    : "sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur px-4 py-3 sm:px-6";

  const formCls = inline ? "px-6 py-6" : "flex-1 overflow-y-auto px-4 py-5 sm:px-6";

  const footerCls = inline
    ? "mt-8 border-t border-slate-200 bg-transparent px-6 pt-4 pb-6"
    : "sticky bottom-0 mt-6 border-t border-slate-200 bg-white px-0 pt-4";

  const content = (
    <>
      {/* Header */}
      <div className={headerCls}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2
            id="add-assignment-title"
            className="min-w-0 truncate flex items-center gap-2 text-base sm:text-lg font-semibold text-slate-900"
          >
            <ClipboardDocumentCheckIcon className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600 shrink-0" />
            Add Assignment
          </h2>
          <button
            onClick={closeModal}
            className="justify-self-end rounded-full p-2 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} className={formCls} encType="multipart/form-data" noValidate>
        <div className="space-y-5">
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {debugText && (
            <details
              open={showDebug}
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            >
              <summary
                className="cursor-pointer select-none text-[13px] font-semibold"
                onClick={() => setShowDebug((s) => !s)}
              >
                Debug details
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words">
                {debugText}
              </pre>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded border px-2 py-1 hover:bg-white"
                  onClick={() => debugText && navigator.clipboard.writeText(debugText)}
                >
                  Copy debug
                </button>
                <span className="text-[11px] text-amber-700">
                  If RLS blocks insert/update, ensure you own the module and policies
                  <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">assignments_insert_by_owner</code>,
                  <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">assignments_update_by_owner</code> and
                  <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">assignment_students_upsert_by_owner</code>
                  exist.
                </span>
              </div>
            </details>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Assignment Name <span className="text-rose-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              placeholder="e.g., Argumentative Essay"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Instructions <span className="text-rose-500">*</span>
            </label>
            <textarea
              name="instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              required
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              placeholder="Describe what students need to do…"
            />
          </div>

          {/* Score + Attempts */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Max Score <span className="text-rose-500">*</span>
              </label>
              <input
                name="max_score"
                type="number"
                min={1}
                step={1}
                required
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                placeholder="100"
              />
              <p className="mt-1 text-xs text-slate-500">Total points to grade out of.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Max Attempts (optional)</label>
              <input
                name="max_attempts"
                type="number"
                min={1}
                step={1}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                placeholder="Leave empty = unlimited"
              />
              <p className="mt-1 text-xs text-slate-500">How many times a student may re-submit.</p>
            </div>
          </div>

          {/* Availability window */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Available From (optional)</label>
              <input
                name="available_from"
                type="datetime-local"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Due At (optional)</label>
              <input
                name="due_at"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
              <p className="mt-1 text-xs text-slate-500">
                Submissions outside this window are blocked by the database.
              </p>
            </div>
          </div>

          {/* Privacy / Intervention */}
          <div className="rounded-xl border p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                  isPrivate ? "bg-indigo-50 border-indigo-300" : "bg-gray-50"
                }`}
              >
                <LockClosedIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">Privacy</p>
                  {isPrivate ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      Private / Intervention
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                      Standard
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Standard: visible to all students in this class under the module’s quarter. Private: hidden from all
                  students until you select recipients. You may leave the selection <em>empty for now</em> and assign
                  students later in the Assignment page.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivate((v) => !v)}
                    className="px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                  >
                    {isPrivate ? "Switch to Standard" : "Make Private"}
                  </button>
                  {isPrivate && (
                    <button
                      type="button"
                      onClick={() => setPickOpen(true)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                    >
                      <UserGroupIcon className="w-4 h-4" />
                      {preSelectedStudentIds.length ? "Edit students" : "Choose students (optional)"}
                    </button>
                  )}
                  {isPrivate && preSelectedStudentIds.length > 0 && (
                    <span className="text-xs text-indigo-700">{preSelectedStudentIds.length} selected</span>
                  )}
                </div>

                {isPrivate && preSelectedStudentIds.length === 0 && (
                  <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    No recipients selected yet — this private assignment will remain hidden from students until you
                    assign them in the Assignment page.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* File Upload (optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Attach File (optional)</label>
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={openFilePicker}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openFilePicker();
              }}
              role="button"
              tabIndex={0}
              className="mt-2 flex cursor-pointer select-none items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-6 transition hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            >
              <input
                ref={fileInputRef}
                id="file-upload"
                name="file"
                type="file"
                accept={ALLOWED.join(",")}
                className="sr-only"
                onChange={handleFilePick}
              />
              <div className="flex w-full max-w-md flex-col items-center min-w-0">
                <DocumentArrowUpIcon className="h-8 w-8 text-slate-500" />
                <span className="mt-2 truncate text-sm text-slate-600">
                  {file ? file.name : "Click to upload or drag & drop"}
                </span>
                <span className="mt-1 text-xs text-slate-400">
                  Allowed: {ALLOWED.join(", ")} • up to {MAX_MB}MB
                </span>
                {file && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearFile();
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Remove file
                  </button>
                )}
              </div>
            </div>
            {loading && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-100">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={footerCls}>
          <div className="grid grid-cols-1 gap-3 sm:auto-cols-max sm:grid-flow-col">
            <button
              type="button"
              onClick={closeModal}
              className="w-full sm:w-auto whitespace-nowrap rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full sm:w-auto whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving…
                </>
              ) : (
                <>
                  <ClipboardDocumentCheckIcon className="h-5 w-5" />
                  Add Assignment
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </>
  );

  /* --------------------------- Layout switch --------------------------- */
  if (inline) {
    return (
      <div
        className="w-full max-w-6xl mx-auto overflow-visible rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 flex flex-col"
        role="region"
        aria-labelledby="add-assignment-title"
      >
        {content}
        {isPrivate && pickOpen && (
          <PickStudentsSheet
            open={pickOpen}
            onClose={() => setPickOpen(false)}
            value={preSelectedStudentIds}
            onChange={setPreSelectedStudentIds}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto w-full sm:max-w-2xl md:max-w-3xl overflow-hidden rounded-xl sm:rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-assignment-title"
    >
      <div className="pointer-events-none flex min-h-dvh w-full items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
        <div
          className={[
            "pointer-events-auto w-full sm:max-w-2xl md:max-w-3xl",
            "rounded-none sm:rounded-2xl bg-white shadow-xl ring-1 ring-slate-200",
            "max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)]",
            "flex flex-col",
          ].join(" ")}
        >
          {content}
        </div>
      </div>

      {isPrivate && pickOpen && (
        <PickStudentsSheet
          open={pickOpen}
          onClose={() => setPickOpen(false)}
          value={preSelectedStudentIds}
          onChange={setPreSelectedStudentIds}
        />
      )}
    </div>
  );
}
