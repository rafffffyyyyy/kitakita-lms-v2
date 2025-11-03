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
  CheckBadgeIcon,
  LockClosedIcon,
  BugAntIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

/* ------------------------------- Types ------------------------------- */
type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
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
  score?: number | null;
};

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

const iconForType: Record<string, ElementType> = {
  // assignment core
  assignment_new: DocumentPlusIcon,
  assignment_created: DocumentPlusIcon,
  assignment_published: DocumentPlusIcon,
  assignment_updated: InformationCircleIcon,
  assignment_deleted: TrashIcon,

  // private assignment lifecycle
  assignment_private_assigned: LockClosedIcon,
  assignment_private_unassigned: TrashIcon,
  private_assignment_assigned: LockClosedIcon,
  private_assignment_unassigned: TrashIcon,
  assignment_assigned: DocumentPlusIcon,
  assignment_unassigned: TrashIcon,

  // student/teacher events
  assignment_submitted: ClipboardDocumentCheckIcon,
  assignment_submitted_teacher: ClipboardDocumentCheckIcon,
  assignment_graded: CheckBadgeIcon,

  // time-based
  assignment_due_soon: ClockIcon,
  assignment_due_ended: ExclamationTriangleIcon,

  // quiz/module
  quiz_published: AcademicCapIcon,
  quiz_due_soon: ClockIcon,
  module_created: FolderPlusIcon,

  default: BellAlertIcon,
};
const iconByType = (t: string) => iconForType[t] || iconForType.default;

const isQuizType = (t?: string | null) => (t ?? "").toLowerCase().includes("quiz");

const prettyQuizType = (t?: string | null) =>
  t === "pre_test" ? "Pre-Test" : t === "post_test" ? "Post-Test" : t === "quiz" ? "Quiz" : null;

/* ------------------- Payload/meta helpers (lenient) ------------------ */
const extractMetaFromPayload = (p: any) => {
  const mod =
    p?.module_title ?? p?.module_name ?? p?.module?.title ?? p?.moduleTitle ?? p?.moduleName ?? null;
  const qtr = p?.quarter_name ?? p?.quarter?.name ?? p?.quarterName ?? null;

  const quizTitle = p?.quiz_title ?? p?.quiz?.title ?? null;
  const quizType = p?.quiz_type ?? p?.quiz?.type ?? null;

  const assignmentName =
    p?.assignment_name ??
    p?.assignment_title ??
    p?.assignment?.name ??
    p?.assignment?.title ??
    p?.assignmentName ??
    p?.assignmentTitle ??
    null;

  const score = p?.score ?? p?.grade ?? null;
  return { mod, qtr, quizTitle, quizType, assignmentName, score } as MetaPiece;
};

function assignmentIdFromLink(link?: string | null, payload?: any): string | null {
  const pid = payload?.assignment_id ?? payload?.assignmentId ?? payload?.assignment?.id ?? null;
  if (pid) return pid;
  if (!link) return null;
  try {
    const u = new URL(link, "https://dummy.local");
    const q =
      u.searchParams.get("assignment") ||
      u.searchParams.get("assignmentId") ||
      u.searchParams.get("assignment_id");
    if (q) return q;
    const m = u.pathname.match(
      /\/assignments\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i
    );
    return m?.[1] ?? null;
  } catch {
    const m =
      link.match(/[?&](assignment|assignmentId|assignment_id)=([0-9a-f-]{36})/i) ||
      link.match(/\/assignments\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
    return m ? (m[m.length - 1] as string) : null;
  }
}

function quizIdFromLink(link?: string | null, payload?: any): string | null {
  const pid = payload?.quiz_id ?? payload?.quizId ?? payload?.quiz?.id ?? null;
  if (pid) return pid;
  if (!link) return null;
  try {
    const u = new URL(link, "https://dummy.local");
    const q = u.searchParams.get("quizId") || u.searchParams.get("quiz_id");
    if (q) return q;
    const m = u.pathname.match(
      /\/quizzes\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i
    );
    return m?.[1] ?? null;
  } catch {
    const m =
      link.match(/[?&](quizId|quiz_id)=([0-9a-f-]{36})/i) ||
      link.match(/\/quizzes\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
    return m ? (m[m.length - 1] as string) : null;
  }
}

/* ------------------------------ Bell -------------------------------- */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const bellLogsRef = useRef<string[]>([]);
  const bellLog = (msg: string, data?: any) => {
    const line =
      `[${new Date().toLocaleTimeString()}] ${msg}` + (data !== undefined ? ` — ${safeJson(data)}` : "");
    bellLogsRef.current = [line, ...bellLogsRef.current].slice(0, 200);
    // eslint-disable-next-line no-console
    console.log("[notif-bell]", msg, data ?? "");
  };

  const recountUnread = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;

    const [{ count: c1, error: e1 }, { count: c2, error: e2 }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("recipient_user_id", uid)
        .is("deleted_at", null)
        .is("read_at", null),
      supabase
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", uid)
        .is("deleted_at", null)
        .is("read_at", null),
    ]);

    if (e1) bellLog("recountUnread recipient error", e1);
    if (e2) bellLog("recountUnread user error", e2);
    setUnread((c1 ?? 0) + (c2 ?? 0));
    bellLog("recountUnread", { uid, count: (c1 ?? 0) + (c2 ?? 0) });
  }, []);

  useEffect(() => {
    let active = true;
    let ch1: ReturnType<typeof supabase.channel> | null = null;
    let ch2: ReturnType<typeof supabase.channel> | null = null;
    let pollId: number | null = null;

    (async () => {
      await recountUnread();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;

      ch1 = supabase
        .channel(`notif-recipient-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` },
          async () => active && (await recountUnread())
        )
        .subscribe();

      ch2 = supabase
        .channel(`notif-user-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          async () => active && (await recountUnread())
        )
        .subscribe();

      pollId = window.setInterval(() => active && recountUnread(), 15000);
    })();

    return () => {
      active = false;
      if (ch1) supabase.removeChannel(ch1);
      if (ch2) supabase.removeChannel(ch2);
      if (pollId) window.clearInterval(pollId);
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
        title="Notifications"
      >
        <BellIcon className="h-5 w-5 text-slate-700" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.15rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        /**
         * Mobile & Tablet (＜lg): full-screen overlay, panel centered.
         * ≥lg: popover under the bell (original behavior).
         */
        <div
          className="
            fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4
            lg:absolute lg:inset-auto lg:right-0 lg:top-full lg:mt-2 lg:bg-transparent lg:block lg:p-0
          "
          role="dialog"
          aria-modal="true"
          aria-label="Notifications panel"
          onClick={() => setOpen(false)} // click outside to close
        >
          <div
            className="w-full max-w-lg lg:max-w-[92vw] lg:w-[26rem]"
            onClick={(e) => e.stopPropagation()} // keep clicks inside
          >
            <NotificationsPanel onClose={() => setOpen(false)} upstreamLogs={bellLogsRef} isOpen={open} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Panel -------------------------------- */
function NotificationsPanel({
  onClose,
  upstreamLogs,
  isOpen,
}: {
  onClose: () => void;
  upstreamLogs: React.MutableRefObject<string[]>;
  isOpen: boolean;
}) {
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState<null | { mode: "one"; id: string; title?: string } | { mode: "all" }>(
    null
  );

  const [metaById, setMetaById] = useState<Record<string, MetaPiece>>({});
  const [debugOpen, setDebugOpen] = useState(false);
  const [debug, setDebug] = useState<{
    uid?: string | null;
    email?: string | null;
    count_recipient?: number | null;
    count_user?: number | null;
    count_visible?: number | null;
    sample?: any[];
    logs: string[];
  }>({ logs: [] });

  const log = (msg: string, data?: any) => {
    const line =
      `[${new Date().toLocaleTimeString()}] ${msg}` + (data !== undefined ? ` — ${safeJson(data)}` : "");
    setDebug((d) => ({ ...d, logs: [line, ...d.logs].slice(0, 200) }));
    // eslint-disable-next-line no-console
    console.log("[notif-panel]", msg, data ?? "");
  };

  const dispatchRefresh = () => setTimeout(() => window.dispatchEvent(new CustomEvent("notif:refresh")), 0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    const columns = "id,type,title,body,link_path,payload,created_at,read_at,deleted_at";

    const [{ data: a, error: ea }, { data: b, error: eb }] = await Promise.all([
      supabase
        .from("notifications")
        .select(columns)
        .eq("recipient_user_id", uid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(120),
      supabase
        .from("notifications")
        .select(columns)
        .eq("user_id", uid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

    if (ea) log("load recipient error", ea);
    if (eb) log("load user error", eb);

    const merged = [...(a ?? []), ...(b ?? [])] as NotifRow[];
    const uniqMap = new Map<string, NotifRow>();
    for (const r of merged) uniqMap.set(r.id, r);
    const list = Array.from(uniqMap.values()).sort(
      (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
    );

    setRows(list);
    setLoading(false);

    setMetaById((prev) => {
      const next: Record<string, MetaPiece> = { ...prev };
      for (const r of list) {
        const fromPayload = extractMetaFromPayload(r.payload);
        const old = prev[r.id] ?? {};
        next[r.id] = {
          mod: old.mod ?? fromPayload.mod ?? null,
          qtr: old.qtr ?? fromPayload.qtr ?? null,
          quizTitle: old.quizTitle ?? fromPayload.quizTitle ?? null,
          quizType: (old.quizType as any) ?? (fromPayload.quizType as any) ?? null,
          assignmentName: old.assignmentName ?? fromPayload.assignmentName ?? null,
          score: old.score ?? fromPayload.score ?? null,
        };
      }
      return next;
    });

    log("load", { uid, count: list.length });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => load(), 10_000);
    return () => clearInterval(id);
  }, [isOpen, load]);

  /* -------------------- Enrichment (quiz + assignment) -------------------- */
  const enrichMissing = useCallback(
    async (items: NotifRow[]) => {
      if (!items.length) return;

      const needQuizById: Array<{ notifId: string; quizId: string }> = [];
      const needAssign: Array<{ notifId: string; assignmentId: string }> = [];
      const needModule: Array<{ notifId: string; moduleId: string }> = [];
      const needQuizByTime: Array<{ notifId: string; created_at: string }> = [];

      items.forEach((r) => {
        const p = r.payload || {};
        const m = metaById[r.id] || {};
        const hasModQtr = Boolean(m.mod) && Boolean(m.qtr);

        const quizId = p?.quiz_id ?? p?.quizId ?? p?.quiz?.id ?? quizIdFromLink(r.link_path, p) ?? null;
        const assignmentId =
          p?.assignment_id ?? p?.assignmentId ?? p?.assignment?.id ?? assignmentIdFromLink(r.link_path, p) ?? null;
        const moduleId = p?.module_id ?? p?.moduleId ?? p?.module?.id ?? null;

        if (!hasModQtr && quizId) needQuizById.push({ notifId: r.id, quizId });
        if (!hasModQtr && assignmentId) needAssign.push({ notifId: r.id, assignmentId });
        if (!hasModQtr && !assignmentId && moduleId) needModule.push({ notifId: r.id, moduleId });
        if (!hasModQtr && !quizId && !assignmentId && !moduleId && isQuizType(r.type)) {
          needQuizByTime.push({ notifId: r.id, created_at: r.created_at });
        }
      });

      if (
        needQuizById.length === 0 &&
        needAssign.length === 0 &&
        needModule.length === 0 &&
        needQuizByTime.length === 0
      )
        return;

      try {
        const quizIds = Array.from(new Set(needQuizById.map((x) => x.quizId)));
        const assignIds = Array.from(new Set(needAssign.map((x) => x.assignmentId)));
        const extraModuleIds = Array.from(new Set(needModule.map((x) => x.moduleId)));

        let qRowsId:
          | Array<{ id: string; title: string | null; type: "quiz" | "pre_test" | "post_test" | null; module_id: string | null; created_at: string }>
          | [] = [];
        if (quizIds.length) {
          const { data: qd } = await supabase
            .from("quizzes")
            .select("id,title,type,module_id,created_at")
            .in("id", quizIds);
          qRowsId = (qd ?? []) as any[];
        }

        let aRows: Array<{ id: string; name: string | null; module_id: string | null }> = [];
        if (assignIds.length) {
          const { data: ad } = await supabase
            .from("assignments")
            .select("id,name,module_id")
            .in("id", assignIds);
          aRows = (ad ?? []) as any[];
        }

        let qRowsTime:
          | Array<{ id: string; title: string | null; type: any; module_id: string | null; created_at: string }>
          | [] = [];
        if (needQuizByTime.length) {
          const times = needQuizByTime.map((x) => new Date(x.created_at).getTime());
          const min = new Date(Math.min(...times) - 2 * 60 * 60 * 1000).toISOString();
          const max = new Date(Math.max(...times) + 2 * 60 * 60 * 1000).toISOString();

          const { data: qd2 } = await supabase
            .from("quizzes")
            .select("id,title,type,module_id,created_at")
            .gte("created_at", min)
            .lte("created_at", max)
            .order("created_at", { ascending: false })
            .limit(100);
          qRowsTime = (qd2 ?? []) as any[];
        }

        const moduleIds = Array.from(
          new Set<string>([
            ...qRowsId.map((q) => q.module_id).filter(Boolean) as string[],
            ...qRowsTime.map((q) => q.module_id).filter(Boolean) as string[],
            ...aRows.map((a) => a.module_id).filter(Boolean) as string[],
            ...extraModuleIds,
          ])
        );

        let mRows: Array<{ id: string; title: string | null; quarters?: { name?: string | null } | null }> = [];
        if (moduleIds.length) {
          const { data: md } = await supabase.from("modules").select("id,title,quarters(name)").in("id", moduleIds);
          mRows = (md ?? []) as any[];
        }
        const moduleById: Record<string, { title: string | null; quarterName: string | null }> = {};
        mRows.forEach((m) => {
          moduleById[m.id] = { title: m?.title ?? null, quarterName: (m as any)?.quarters?.name ?? null };
        });

        const quizById: Record<string, { title: string | null; type: any; module_id: string | null; created_at: string }> = {};
        qRowsId.forEach((q) => (quizById[q.id] = q));

        const nearestQuizFor = (tsIso: string) => {
          if (!qRowsTime.length) return null;
          const t = new Date(tsIso).getTime();
          let best: (typeof qRowsTime)[number] | null = null;
          let bestDelta = Infinity;
          for (const q of qRowsTime) {
            if (!q.module_id) continue;
            const d = Math.abs(new Date(q.created_at).getTime() - t);
            if (d < bestDelta) {
              bestDelta = d;
              best = q;
            }
          }
          return best;
        };

        setMetaById((prev) => {
          const next: Record<string, MetaPiece> = { ...prev };

          needQuizById.forEach(({ notifId, quizId }) => {
            const q = quizById[quizId];
            if (!q) return;
            const modInfo = q.module_id ? moduleById[q.module_id] : undefined;
            const prevM = next[notifId] || {};
            next[notifId] = {
              ...prevM,
              mod: prevM.mod ?? modInfo?.title ?? null,
              qtr: prevM.qtr ?? modInfo?.quarterName ?? null,
              quizTitle: prevM.quizTitle ?? (q.title ?? null),
              quizType: (prevM.quizType as any) ?? (q.type ?? null),
            };
          });

          needAssign.forEach(({ notifId, assignmentId }) => {
            const a = aRows.find((x) => x.id === assignmentId);
            if (!a) return;
            const modInfo = a.module_id ? moduleById[a.module_id] : undefined;
            const prevM = next[notifId] || {};
            next[notifId] = {
              ...prevM,
              mod: prevM.mod ?? modInfo?.title ?? null,
              qtr: prevM.qtr ?? modInfo?.quarterName ?? null,
              assignmentName: prevM.assignmentName ?? (a.name ?? null),
            };
          });

          needModule.forEach(({ notifId, moduleId }) => {
            const m = moduleById[moduleId];
            if (!m) return;
            const prevM = next[notifId] || {};
            next[notifId] = {
              ...prevM,
              mod: prevM.mod ?? m.title ?? null,
              qtr: prevM.qtr ?? m.quarterName ?? null,
            };
          });

          needQuizByTime.forEach(({ notifId, created_at }) => {
            const q = nearestQuizFor(created_at);
            if (!q) return;
            const modInfo = q.module_id ? moduleById[q.module_id] : undefined;
            const prevM = next[notifId] || {};
            next[notifId] = {
              ...prevM,
              mod: prevM.mod ?? modInfo?.title ?? null,
              qtr: prevM.qtr ?? modInfo?.quarterName ?? null,
              quizTitle: prevM.quizTitle ?? (q.title ?? null),
              quizType: (prevM.quizType as any) ?? (q.type ?? null),
            };
          });

          return next;
        });
      } catch (e) {
        console.warn("[notifications] enrichMissing failed (ok to ignore):", e);
        log("enrichMissing failed", e as any);
      }
    },
    [metaById, log]
  );

  useEffect(() => {
    if (!loading && rows.length) {
      const needing = rows.filter((r) => {
        const p = r.payload || {};
        const m = metaById[r.id] || {};
        const hasModQtr = Boolean(m.mod) && Boolean(m.qtr);

        if (!hasModQtr) {
          const hasIdsOrModule =
            p?.assignment_id ||
            p?.assignmentId ||
            p?.assignment?.id ||
            p?.module_id ||
            p?.moduleId ||
            p?.module?.id ||
            assignmentIdFromLink(r.link_path, p) ||
            p?.quiz_id ||
            p?.quizId ||
            p?.quiz?.id ||
            quizIdFromLink(r.link_path, p);

          return Boolean(hasIdsOrModule || isQuizType(r.type));
        }
        return false;
      });
      if (needing.length) enrichMissing(needing);
    }
  }, [rows, loading, metaById, enrichMissing]);

  const getUid = async () => (await supabase.auth.getUser()).data.user?.id ?? null;

  /* ------------------------------ Mutations --------------------------- */
  const markAllRead = async () => {
    setBusy(true);
    const prev = rows;
    try {
      setRows((xs) => xs.map((r) => (r.read_at ? r : { ...r, read_at: new Date().toISOString() })));
      const uid = await getUid();
      if (!uid) return;

      await Promise.all([
        supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("recipient_user_id", uid)
          .is("deleted_at", null)
          .is("read_at", null),
        supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", uid)
          .is("deleted_at", null)
          .is("read_at", null),
      ]);

      await load();
      dispatchRefresh();
    } catch (err) {
      setRows(prev);
      log("markAllRead failed", err as any);
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

      await Promise.all([
        supabase
          .from("notifications")
          .update({ deleted_at: new Date().toISOString() })
          .eq("recipient_user_id", uid)
          .is("deleted_at", null),
        supabase
          .from("notifications")
          .update({ deleted_at: new Date().toISOString() })
          .eq("user_id", uid)
          .is("deleted_at", null),
      ]);

      await load();
      dispatchRefresh();
    } catch (err) {
      setRows(prev);
      log("deleteAll failed", err as any);
      dispatchRefresh();
    } finally {
      setBusy(false);
    }
  };

  const markOneRead = async (id: string) => {
    const prev = rows;
    setRows((xs) => xs.map((r) => (r.id === id && !r.read_at ? { ...r, read_at: new Date().toISOString() } : r)));
    const call = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (call.error) {
      setRows(prev);
      log("markOneRead failed", call.error);
    } else {
      await load();
    }
    dispatchRefresh();
  };

  const deleteOne = async (id: string) => {
    const prev = rows;
    setRows((xs) => xs.filter((r) => r.id !== id));
    const call = await supabase.from("notifications").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (call.error) {
      setRows(prev);
      log("deleteOne failed", call.error);
    } else {
      await load();
    }
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

        <button
          onClick={() => setDebugOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
          title="Open notifications debug"
        >
          <BugAntIcon className="h-4 w-4" />
          Debug
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
  const activeMeta = viewId ? (metaById[viewId] as MetaPiece) ?? {} : {};

  /* ------------------------------ Render ------------------------------ */
  return (
    <>
      {/* Panel */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5">
        {/* Mobile grabber */}
        <div className="lg:hidden pt-2">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
        </div>

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

                const needsMeta = !mod && !qtr;

                return (
                  <li key={r.id}>
                    <div className="grid grid-cols-[2.25rem,1fr,auto,auto] items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
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

                        <div className="mt-1 text-[11px] text-slate-400">{new Date(r.created_at).toLocaleString()}</div>
                      </div>

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

      {/* Debug panel (portal) */}
      {debugOpen && <DebugPanel upstreamLogs={upstreamLogs.current} state={debug} setState={setDebug} onReload={load} />}

      {/* Centered confirmation (portal) */}
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

/* -------------------- Notification Details Modal -------------------- */
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
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
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

/* ------------------------------ Debug UI ----------------------------- */
function DebugPanel({
  upstreamLogs,
  state,
  setState,
  onReload,
}: {
  upstreamLogs: string[];
  state: {
    uid?: string | null;
    email?: string | null;
    count_recipient?: number | null;
    count_user?: number | null;
    count_visible?: number | null;
    sample?: any[];
    logs: string[];
  };
  setState: React.Dispatch<React.SetStateAction<typeof state>>;
  onReload: () => Promise<void>;
}) {
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      const email = (auth.user as any)?.email ?? null;

      if (!uid) return;

      const [{ count: cntRecipient }, { count: cntUser }, { data: visible }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", uid).is("deleted_at", null),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", uid).is("deleted_at", null),
        supabase
          .from("notifications")
          .select("id,type,read_at,deleted_at,recipient_user_id,user_id,created_at")
          .eq("recipient_user_id", uid)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const { data: visibleB } = await supabase
        .from("notifications")
        .select("id,type,read_at,deleted_at,recipient_user_id,user_id,created_at")
        .eq("user_id", uid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10);

      const merged = [...(visible ?? []), ...(visibleB ?? [])];
      const uniq = Array.from(new Map(merged.map((r: any) => [r.id, r])).values());

      setState((s) => ({
        ...s,
        uid,
        email,
        count_recipient: cntRecipient ?? 0,
        count_user: cntUser ?? 0,
        count_visible: uniq.length,
        sample: uniq,
      }));
    })();
  }, [setState]);

  return createPortal(
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <BugAntIcon className="h-5 w-5 text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-900">Notifications Debug</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReload}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              title="Reload list"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Reload
            </button>
            <button
              onClick={() => setState((s) => ({ ...s, logs: [] }))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              title="Clear log"
            >
              Clear log
            </button>
            <button
              onClick={() => (document.querySelector("[aria-label='Close']") as HTMLButtonElement)?.click()}
              className="rounded-full p-1 hover:bg-slate-100"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5 text-slate-600" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <section className="rounded-lg border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-800">Identity</div>
            <div className="mt-2 text-xs text-slate-600">
              <div>
                <span className="font-medium">uid:</span> {state.uid ?? "—"}
              </div>
              <div>
                <span className="font-medium">email:</span> {state.email ?? "—"}
              </div>
            </div>

            <div className="mt-3 text-sm font-semibold text-slate-800">Counts (visible)</div>
            <ul className="mt-1 text-xs text-slate-600">
              <li>
                recipient_user_id = uid: <span className="font-medium">{state.count_recipient ?? 0}</span>
              </li>
              <li>
                user_id = uid: <span className="font-medium">{state.count_user ?? 0}</span>
              </li>
              <li>
                loaded in panel: <span className="font-medium">{state.count_visible ?? 0}</span>
              </li>
            </ul>

            <div className="mt-3 text-sm font-semibold text-slate-800">Sample (latest 10)</div>
            <div className="mt-1 max-h-52 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] leading-snug text-slate-700">
              {state.sample?.length ? (
                <pre className="whitespace-pre-wrap break-all">{safeJson(state.sample, 2)}</pre>
              ) : (
                <div className="text-slate-500">No rows.</div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-800">Logs</div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <div className="max-h-60 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] leading-snug text-slate-700">
                {upstreamLogs.length ? (
                  <>
                    <div className="mb-1 font-semibold text-slate-600">Bell events</div>
                    <pre className="whitespace-pre-wrap break-all">{upstreamLogs.join("\n")}</pre>
                  </>
                ) : (
                  <div className="text-slate-500">No bell events yet.</div>
                )}
              </div>
              <div className="max-h-60 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] leading-snug text-slate-700">
                {state.logs.length ? (
                  <>
                    <div className="mb-1 font-semibold text-slate-600">Panel actions</div>
                    <pre className="whitespace-pre-wrap break-all">{state.logs.join("\n")}</pre>
                  </>
                ) : (
                  <div className="text-slate-500">No panel logs yet.</div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>,
    typeof window !== "undefined" ? document.body : ({} as any)
  );
}

/* ------------------------------ Utils -------------------------------- */
function safeJson(v: any, space = 0) {
  try {
    return JSON.stringify(
      v,
      (_k, val) => (typeof val === "bigint" ? String(val) : val),
      space
    );
  } catch {
    return String(v);
  }
}
