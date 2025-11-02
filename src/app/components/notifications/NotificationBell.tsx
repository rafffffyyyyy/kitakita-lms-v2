// File: /src/app/components/notifications/NotificationBell.tsx
"use client";

import type { ElementType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import {
  BellIcon,
  BellAlertIcon,
  CheckIcon,
  XMarkIcon,
  TrashIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentCheckIcon,
  DocumentPlusIcon,
  AcademicCapIcon,
  FolderPlusIcon,
  InformationCircleIcon,
  CheckBadgeIcon, // NEW: icon for graded
  LockClosedIcon, // NEW: for private-assignment notices
} from "@heroicons/react/24/outline";

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
}

/* ------------------------------ Panel -------------------------------- */
function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState<null | { mode: "one"; id: string; title?: string } | { mode: "all" }>(
    null
  );

  const [metaById, setMetaById] = useState<Record<string, MetaPiece>>({});
  const fetchedBatchRef = useRef<string>("");

  const dispatchRefresh = () =>
    setTimeout(() => window.dispatchEvent(new CustomEvent("notif:refresh")), 0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,body,link_path,payload,created_at,read_at,deleted_at")
      .eq("recipient_user_id", uid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(120);

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
      }

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
  );

  const [viewId, setViewId] = useState<string | null>(null);
  const activeRow = viewId ? rows.find((r) => r.id === viewId) ?? null : null;
  const activeMeta = viewId ? metaById[viewId] ?? {} : {};

  return (
    <>
      {/* Solid white panel */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
        {/* Header */}
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
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {body && <div className="mt-1 text-sm text-slate-600">{body}</div>}
          </div>
          <button onClick={onCancel} className="ml-auto rounded-full p-1 hover:bg-slate-100" aria-label="Close">
            <XMarkIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg border border-rose-200 bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, typeof window !== "undefined" ? document.body : ({} as any));
}

/* -------------------------- Details Modal --------------------------- */
function NotifDetailsModal({
  row,
  meta,
  onClose,
  onMarkRead,
  onDelete,
}: {
  row: NotifRow;
  meta: MetaPiece;
  onClose: () => void;
  onMarkRead: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Icon = iconByType(row.type);

  const lines: Array<{ label: string; value: string | null }> = [
    { label: "Quarter", value: meta.qtr ?? null },
    { label: "Module", value: meta.mod ?? null },
  ];

  if (meta.quizType || meta.quizTitle) {
    lines.push({ label: "Assessment", value: prettyQuizType(meta.quizType) || null });
    lines.push({ label: "Quiz Title", value: meta.quizTitle ?? null });
  }
  if (meta.assignmentName) {
    lines.push({ label: "Assignment", value: meta.assignmentName });
  }
  if (typeof meta.score === "number") {
    lines.push({ label: "Score", value: String(meta.score) });
  }

  const modal = (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/10">
              <Icon className="h-5 w-5 text-indigo-600" />
            </span>
            <h3 className="text-base font-semibold text-slate-900">Notification Details</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">{row.title}</div>
          {row.body && <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{row.body}</div>}

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60">
            <dl className="divide-y divide-slate-100">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[auto,1fr] items-start gap-3 px-4 py-2.5">
                  <InformationCircleIcon className="h-4 w-4 text-slate-500" />
                  <div className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">{l.label}</dt>
                    <dd className="truncate text-sm font-medium text-slate-800">{l.value ?? "—"}</dd>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[auto,1fr] items-start gap-3 px-4 py-2.5">
                <InformationCircleIcon className="h-4 w-4 text-slate-500" />
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">Created</dt>
                  <dd className="truncate text-sm font-medium text-slate-800">
                    {new Date(row.created_at).toLocaleString()}
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            {!row.read_at && (
              <button
                onClick={onMarkRead}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Mark as read
              </button>
            )}
            <button
              onClick={onDelete}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, typeof window !== "undefined" ? document.body : ({} as any));
}
