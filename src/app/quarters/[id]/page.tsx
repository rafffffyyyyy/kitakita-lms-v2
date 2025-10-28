// quarter/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import BackButton from "@/app/components/BackButton";
import { useUser } from "@/app/UserContext";
import Image from "next/image";

import {
  AcademicCapIcon,
  BookOpenIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  ArrowRightIcon,
  PhotoIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  LockOpenIcon,
} from "@heroicons/react/24/outline";

import AddModuleModal from "@/app/components/AddModuleModal";
import EditModuleModal from "@/app/components/EditModuleModal";
import DeleteModuleModal from "@/app/components/DelateModuleModal";
import ManageModuleAccessModal from "@/app/components/ManageModuleAccessModal";

interface Module {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  is_private?: boolean;
}

type Prog = { completed: number; total: number; pct: number };

export default function QuarterModulesPage() {
  const params = useParams();
  const quarterId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string) || "";

  const [modules, setModules] = useState<Module[]>([]);
  const [quarterName, setQuarterName] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const { role } = useUser();

  const [viewerId, setViewerId] = useState<string | null>(null); // needed for student progress
  const [progressByModule, setProgressByModule] = useState<Record<string, Prog>>({});

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<null | {
    id: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
  }>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | {
    id: string;
    title: string;
    imageUrl: string | null;
  }>(null);

  const [manageTarget, setManageTarget] = useState<null | { id: string; title: string }>(null);

  const [query, setQuery] = useState("");

  // no-op logger to preserve call sites without shipping the debug UI
  const pushLog = (_label: string, _payload: any) => {};

  // refetch trigger
  const [refreshToken, setRefreshToken] = useState(0);
  const triggerRefresh = () => setRefreshToken((n) => n + 1);

  // per-module toggle busy flag
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!quarterId || role === null) return;
    let mounted = true;

    const fetchModules = async () => {
      setLoading(true);
      try {
        let teacherIdToCheck: string | null = null;

        const userRes = await supabase.auth.getUser();
        pushLog("getUser", userRes);
        if (userRes.error || !userRes.data?.user) {
          if (mounted) {
            setIsAuthorized(false);
            setLoading(false);
          }
          return;
        }
        const userId = userRes.data.user.id;
        if (mounted) setViewerId(userId);

        if (role === "student") {
          const student = await supabase
            .from("students")
            .select("id, teacher_id")
            .eq("id", userId)
            .single();
          pushLog("fetch student", student);

          if (student.error || !student.data?.teacher_id) {
            if (mounted) {
              setIsAuthorized(false);
              setLoading(false);
            }
            return;
          }
          teacherIdToCheck = student.data.teacher_id;
        } else {
          teacherIdToCheck = userId;
        }

        const quarterRes = await supabase
          .from("quarters")
          .select("name, teacher_id")
          .eq("id", quarterId)
          .single();
        pushLog("fetch quarter", quarterRes);

        if (quarterRes.error || !quarterRes.data) {
          if (mounted) {
            setIsAuthorized(false);
            setLoading(false);
          }
          return;
        }

        if (quarterRes.data.teacher_id !== teacherIdToCheck) {
          if (mounted) {
            setIsAuthorized(false);
            setLoading(false);
          }
          return;
        }

        if (!mounted) return;
        setQuarterName(quarterRes.data.name);
        setIsAuthorized(true);

        if (role === "teacher") {
          const moduleRes = await supabase
            .from("modules")
            .select("id, title, description, thumbnail_url, is_private")
            .eq("quarter_id", quarterId)
            .order("created_at", { ascending: true });

          pushLog("modules (teacher) select", moduleRes);

          if (moduleRes.error) throw moduleRes.error;

          if (!mounted) return;
          setModules(
            (moduleRes.data as any[]).map((m) => ({
              id: m.id,
              title: m.title,
              description: m.description ?? "",
              thumbnail_url: m.thumbnail_url ?? null,
              is_private: !!m.is_private,
            }))
          );
        } else {
          // student view: public + granted (joined) for THIS quarter
          const publicRes = await supabase
            .from("modules")
            .select("id, title, description, thumbnail_url, is_private")
            .eq("quarter_id", quarterId)
            .eq("is_private", false)
            .order("created_at", { ascending: true });

          pushLog("modules (public) select", publicRes);
          if (publicRes.error) throw publicRes.error;
          const publicMods = (publicRes.data as any[]) ?? [];

          const grantedJoinRes = await supabase
            .from("modules")
            .select(
              "id, title, description, thumbnail_url, is_private, module_students!inner(student_id)"
            )
            .eq("quarter_id", quarterId)
            .eq("module_students.student_id", userRes.data.user.id)
            .order("created_at", { ascending: true });

          pushLog("modules (granted, joined) select", grantedJoinRes);

          let grantedMods: any[] = [];
          if (!grantedJoinRes.error) grantedMods = (grantedJoinRes.data as any[]) ?? [];

          const merged = new Map<string, any>();
          for (const m of [...publicMods, ...grantedMods]) merged.set(m.id, m);

          if (!mounted) return;
          setModules(
            Array.from(merged.values()).map((m) => ({
              id: m.id,
              title: m.title,
              description: m.description ?? "",
              thumbnail_url: m.thumbnail_url ?? null,
              is_private: !!m.is_private,
            }))
          );
        }
      } catch (e: any) {
        pushLog("fetchModules error (caught)", { message: e?.message, raw: e });
        if (mounted) setModules([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchModules();
    return () => {
      mounted = false;
    };
  }, [quarterId, role, refreshToken]);

  // Compute per-module student progress (safe: ignores missing view-tracking tables)
  useEffect(() => {
    const run = async () => {
      if (role !== "student" || !viewerId || modules.length === 0) {
        setProgressByModule({});
        return;
      }
      const moduleIds = modules.map((m) => m.id);

      // containers
      const totals: Record<string, { res: number; vid: number; asg: number; quiz: number }> = {};
      const completed: Record<string, { res: number; vid: number; asg: number; quiz: number }> = {};
      moduleIds.forEach((id) => {
        totals[id] = { res: 0, vid: 0, asg: 0, quiz: 0 };
        completed[id] = { res: 0, vid: 0, asg: 0, quiz: 0 };
      });

      try {
        // 1) fetch lists per module
        const [resR, vidR, asgR, quizR] = await Promise.all([
          supabase.from("resources").select("id, module_id").in("module_id", moduleIds),
          supabase.from("module_youtube_links").select("id, module_id").in("module_id", moduleIds),
          supabase.from("assignments").select("id, module_id").in("module_id", moduleIds),
          supabase
            .from("quizzes")
            .select("id, module_id, is_published")
            .in("module_id", moduleIds),
        ]);
        pushLog("progress: totals resources", resR);
        pushLog("progress: totals videos", vidR);
        pushLog("progress: totals assignments", asgR);
        pushLog("progress: totals quizzes", quizR);

        const resList = (resR.data as any[]) || [];
        const vidList = (vidR.data as any[]) || [];
        const asgList = (asgR.data as any[]) || [];
        const quizList = ((quizR.data as any[]) || []).filter((q) =>
          typeof q.is_published === "boolean" ? q.is_published : true
        );

        const resourceIds = resList.map((r) => r.id);
        const videoIds = vidList.map((v) => v.id);
        const assignmentIds = asgList.map((a) => a.id);
        const quizIds = quizList.map((q) => q.id);

        resList.forEach((r: any) => (totals[r.module_id].res += 1));
        vidList.forEach((v: any) => (totals[v.module_id].vid += 1));
        asgList.forEach((a: any) => (totals[a.module_id].asg += 1));
        quizList.forEach((q: any) => (totals[q.module_id].quiz += 1));

        // 2) completed counts
        // 2a) assignments submitted
        const subR = await supabase
          .from("assignment_submissions")
          .select("assignment_id")
          .eq("student_id", viewerId)
          .in("assignment_id", assignmentIds);
        pushLog("progress: submissions", subR);

        const submittedSet = new Set<string>((subR.data as any[])?.map((s: any) => s.assignment_id));
        // count unique assignments with a submission, by module
        const asgIdToModule: Record<string, string> = {};
        asgList.forEach((a: any) => (asgIdToModule[a.id] = a.module_id));
        submittedSet.forEach((aid) => {
          const mid = asgIdToModule[aid];
          if (mid) completed[mid].asg += 1;
        });

        // 2b) quiz attempts
        const attR = await supabase
          .from("quiz_attempts")
          .select("quiz_id")
          .eq("student_id", viewerId)
          .in("quiz_id", quizIds);
        pushLog("progress: attempts", attR);

        const attemptedSet = new Set<string>((attR.data as any[])?.map((s: any) => s.quiz_id));
        const quizIdToModule: Record<string, string> = {};
        quizList.forEach((q: any) => (quizIdToModule[q.id] = q.module_id));
        attemptedSet.forEach((qid) => {
          const mid = quizIdToModule[qid];
          if (mid) completed[mid].quiz += 1;
        });

        // 2c) resource views (optional table)
        try {
          const rv = await supabase
            .from("resource_views") // expected schema: resource_id uuid, student_id uuid
            .select("resource_id")
            .eq("student_id", viewerId)
            .in("resource_id", resourceIds);
          pushLog("progress: resource_views", rv);
          const viewedRes = new Set<string>((rv.data as any[])?.map((r: any) => r.resource_id));
          const resIdToModule: Record<string, string> = {};
          resList.forEach((r: any) => (resIdToModule[r.id] = r.module_id));
          viewedRes.forEach((rid) => {
            const mid = resIdToModule[rid];
            if (mid) completed[mid].res += 1;
          });
        } catch (e) {
          pushLog("progress: resource_views skipped", e);
        }

        // 2d) video views (optional table)
        try {
          const vv = await supabase
            .from("module_video_views") // expected schema: youtube_link_id uuid, student_id uuid
            .select("youtube_link_id")
            .eq("student_id", viewerId)
            .in("youtube_link_id", videoIds);
          pushLog("progress: video_views", vv);
          const viewedVid = new Set<string>(
            (vv.data as any[])?.map((r: any) => r.youtube_link_id)
          );
          const vidIdToModule: Record<string, string> = {};
          vidList.forEach((v: any) => (vidIdToModule[v.id] = v.module_id));
          viewedVid.forEach((vid) => {
            const mid = vidIdToModule[vid];
            if (mid) completed[mid].vid += 1;
          });
        } catch (e) {
          pushLog("progress: video_views skipped", e);
        }

        // 3) assemble progress map
        const out: Record<string, Prog> = {};
        moduleIds.forEach((mid) => {
          const tot =
            totals[mid].res + totals[mid].vid + totals[mid].asg + totals[mid].quiz;
          const done =
            completed[mid].res +
            completed[mid].vid +
            completed[mid].asg +
            completed[mid].quiz;
          const pct = tot > 0 ? Math.round((done / tot) * 100) : 0;
          out[mid] = { completed: done, total: tot, pct };
        });

        setProgressByModule(out);
      } catch (e: any) {
        pushLog("progress compute error", { message: e?.message, raw: e });
        setProgressByModule({});
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, role, viewerId]);

  const moduleCount = modules.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter(
      (m) => m.title.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q)
    );
  }, [modules, query]);

  /**
   * Toggle private/public with optimistic UI.
   *  - Update first (no .select() to avoid 406 on some PostgREST versions)
   *  - Then fetch the row to confirm
   *  - If becoming public, delete all module_students
   */
  const togglePrivate = async (module: Module) => {
    const moduleId = module.id;
    const next = !module.is_private;

    // prevent spamming
    if (toggling[moduleId]) return;
    setToggling((m) => ({ ...m, [moduleId]: true }));

    // optimistic UI
    setModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, is_private: next } : m)));

    try {
      const upd = await supabase.from("modules").update({ is_private: next }).eq("id", moduleId);
      pushLog("togglePrivate update", upd);
      if (upd.error) throw upd.error;

      // fetch the updated row (separate select avoids PGRST116)
      const ref = await supabase
        .from("modules")
        .select("id, is_private")
        .eq("id", moduleId)
        .single();
      pushLog("togglePrivate refetch", ref);
      if (ref.error) throw ref.error;

      // if became public, clear grants
      if (!ref.data.is_private) {
        const del = await supabase.from("module_students").delete().eq("module_id", moduleId);
        pushLog("togglePrivate delete module_students", del);
        // Even if delete fails due to RLS, we keep the module public.
      }

      // ensure UI matches DB
      setModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, is_private: !!ref.data.is_private } : m))
      );

      // small refresh to keep lists consistent (badges/order)
      triggerRefresh();
    } catch (err) {
      // revert optimistic UI
      setModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, is_private: module.is_private } : m))
      );
      pushLog("togglePrivate error", err);
      console.error("togglePrivate failed", err);
    } finally {
      setToggling((m) => ({ ...m, [moduleId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="sticky top-16 z-40 border-b border-slate-200/60 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50">
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-3 py-3 sm:h-16 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
            
            <div className="min-w-0 flex items-center gap-3">
              <div className="min-w-0">
              <BackButton />
            </div>
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10">
                <AcademicCapIcon className="h-6 w-6 text-indigo-600" />
              </span>
              <div className="min-w-0 flex flex-col">
                <h1 className="truncate text-lg sm:text-xl font-semibold text-slate-900 tracking-tight">
                  {quarterName || "Quarter"} — Modules
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 whitespace-nowrap">
                    <BookOpenIcon className="h-4 w-4" />
                    {moduleCount} {moduleCount === 1 ? "module" : "modules"}
                  </span>
                  {isAuthorized ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
                      Access granted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 whitespace-nowrap">
                      Restricted
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0 flex items-center justify-end gap-2">
              <label htmlFor="module-search" className="sr-only">
                Search modules
              </label>
              <div className="relative min-w-0 w-full sm:w-56 md:w-72">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="module-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search modules…"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white/70 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              {isAuthorized && role === "teacher" && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="w-full sm:w-auto whitespace-nowrap inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Module
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 min-w-0">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="h-44 w-full animate-pulse bg-slate-200/70" />
                <div className="p-5">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200/70 mb-3" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200/60 mb-2" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200/60" />
                  <div className="mt-5 h-10 w-28 animate-pulse rounded-lg bg-slate-200/80" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !isAuthorized && (
          <div className="mx-auto max-w-xl">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
              <div className="flex items-start gap-4">
                <div className="mt-1 rounded-xl bg-amber-100 p-2">
                  <LockClosedIcon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Access restricted</h2>
                  <p className="mt-1 text-sm text-amber-800">You are not authorized to view the modules for this quarter.</p>
                  <div className="mt-4">
                    <BackButton />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && isAuthorized && filtered.length === 0 && (
          <div className="mx-auto max-w-xl">
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <ExclamationTriangleIcon className="h-7 w-7 text-slate-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">No modules found</h3>
              <p className="mt-2 text-sm text-slate-600">
                {query ? "Try a different search term." : "This quarter doesn’t have any modules at the moment."}
              </p>
            </div>
          </div>
        )}

        {!loading && isAuthorized && filtered.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((mod) => {
              const img = mod.thumbnail_url;
              const isBusy = !!toggling[mod.id];
              const prog = role === "student" ? progressByModule[mod.id] : undefined;

              return (
                <li key={mod.id} className="relative">
                  <ModuleCard
                    title={mod.title}
                    description={mod.description}
                    href={`/modules/${mod.id}`}
                    imageUrl={img}
                    isPrivate={mod.is_private ?? false}
                    progress={prog}
                  >
                    {isAuthorized && role === "teacher" && (
                      <div className="absolute right-3 top-3 z-10 flex gap-1">
                        {/* Edit */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setEditTarget({
                              id: mod.id,
                              title: mod.title,
                              description: mod.description || null,
                              imageUrl: img || null,
                            });
                          }}
                          className="rounded-lg bg-white/90 p-2 text-slate-700 shadow ring-1 ring-slate-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          title="Edit module"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setDeleteTarget({ id: mod.id, title: mod.title, imageUrl: img || null });
                          }}
                          className="rounded-lg bg-white/90 p-2 text-rose-600 shadow ring-1 ring-slate-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                          title="Delete module"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>

                        {/* Toggle private/public */}
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            if (!isBusy) await togglePrivate(mod);
                          }}
                          disabled={isBusy}
                          className={`rounded-lg bg-white/90 p-2 shadow ring-1 ring-slate-200 hover:bg-white focus:outline-none focus:ring-2 disabled:opacity-50 ${
                            mod.is_private
                              ? "text-emerald-700 focus:ring-emerald-400/30"
                              : "text-amber-700 focus:ring-amber-400/30"
                          }`}
                          title={mod.is_private ? "Make module public" : "Make module private"}
                        >
                          {mod.is_private ? (
                            <LockClosedIcon className="h-4 w-4" />
                          ) : (
                            <LockOpenIcon className="h-4 w-4" />
                          )}
                        </button>

                        {/* Manage access (only when private) */}
                        {mod.is_private && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setManageTarget({ id: mod.id, title: mod.title });
                            }}
                            className="rounded-lg bg-white/90 p-2 text-indigo-700 shadow ring-1 ring-slate-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                            title="Manage access"
                          >
                            <UserGroupIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </ModuleCard>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* Panels & Modals */}
      {showAdd && (
        <AddModuleModal
          quarterId={quarterId}
          closeModal={() => setShowAdd(false)}
          onCreated={(row, imageUrl) => {
            // Minimal fix: row may not declare `thumbnail_url` in its type.
            const rowThumb =
              (row as { thumbnail_url?: string | null }).thumbnail_url ?? null;

            setModules((prev) => [
              {
                id: row.id,
                title: row.title,
                description: row.description ?? "",
                thumbnail_url: imageUrl ?? rowThumb,
                is_private: false,
              },
              ...prev,
            ]);
            triggerRefresh();
          }}
        />
      )}

      {editTarget && (
        <EditModuleModal
          quarterId={quarterId}
          moduleId={editTarget.id}
          initialTitle={editTarget.title}
          initialDescription={editTarget.description}
          currentImageUrl={editTarget.imageUrl}
          onDeleteImageInState={() =>
            setModules((prev) =>
              prev.map((m) => (m.id === editTarget.id ? { ...m, thumbnail_url: null } : m))
            )
          }
          onUpdated={(row, newImageUrl) => {
            setModules((prev) =>
              prev.map((m) =>
                m.id === row.id
                  ? {
                      id: row.id,
                      title: row.title,
                      description: row.description ?? "",
                      thumbnail_url:
                        newImageUrl ??
                        (row as any).thumbnail_url ??
                        m.thumbnail_url ??
                        null,
                      is_private: m.is_private ?? false,
                    }
                  : m
              )
            );
            triggerRefresh();
          }}
          closeModal={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteModuleModal
          moduleId={deleteTarget.id}
          moduleTitle={deleteTarget.title}
          imageUrl={deleteTarget.imageUrl}
          onDeleted={() => {
            setModules((prev) => prev.filter((m) => m.id !== deleteTarget.id));
            triggerRefresh();
          }}
          closeModal={() => setDeleteTarget(null)}
        />
      )}

      {manageTarget && (
        <ManageModuleAccessModal
          open={!!manageTarget}
          moduleId={manageTarget.id}
          moduleTitle={manageTarget.title}
          onClose={() => setManageTarget(null)}
          onSaved={() => {
            triggerRefresh();
            setManageTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Card component (UI only) ---------- */
function ModuleCard({
  title,
  description,
  href,
  imageUrl,
  children,
  isPrivate,
  progress,
}: {
  title: string;
  description: string;
  href: string;
  imageUrl: string | null;
  children?: React.ReactNode;
  isPrivate?: boolean;
  progress?: { completed: number; total: number; pct: number } | undefined;
}) {
  const [errored, setErrored] = useState(false);
  const cover = !errored && imageUrl ? imageUrl : "/images/MelcsThumbmail/q1_m1.jpg";

  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
    >
      {children}

      <div className="relative h-44 w-full overflow-hidden bg-slate-100">
        <div className="absolute inset-0 animate-pulse bg-slate-200/50" />
        <Image
          src={cover}
          alt={`${title} cover`}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          onError={() => setErrored(true)}
          sizes="(max-width: 768px) 100vw, 33vw"
          priority={false}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
        {isPrivate && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 shadow-sm ring-1 ring-amber-100">
            <LockClosedIcon className="h-3.5 w-3.5" />
            Private
          </div>
        )}
      </div>

      <div className="p-5">
        <h3 className="line-clamp-1 text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{description || "—"}</p>

        {/* Progress bar (student view only) */}
        {progress && progress.total > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
              <span>Progress</span>
              <span className="font-medium">{progress.pct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-indigo-600 transition-[width] duration-500"
                style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {progress.completed} of {progress.total} items
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
            <PhotoIcon className="h-4 w-4" />
            Cover
          </span>

          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-700">
            Start
            <ArrowRightIcon className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
