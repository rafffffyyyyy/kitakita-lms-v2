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
} from "@heroicons/react/24/outline";

import AddModuleModal from "@/app/components/AddModuleModal";
import EditModuleModal from "@/app/components/EditModuleModal";
import DeleteModuleModal from "@/app/components/DelateModuleModal";

interface Module {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
}

export default function QuarterModulesPage() {
  const params = useParams();
  const quarterId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string) || "";

  const [modules, setModules] = useState<Module[]>([]);
  const [quarterName, setQuarterName] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const { role } = useUser();

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

  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!quarterId || role === null) return;

    const fetchModules = async () => {
      let teacherIdToCheck: string | null = null;

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.error("❌ Failed to fetch Supabase Auth user:", userError?.message);
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      const userId = userData.user.id;

      if (role === "student") {
        const { data: student, error: studentError } = await supabase
          .from("students")
          .select("id, teacher_id")
          .eq("id", userId)
          .single();

        if (studentError || !student?.teacher_id) {
          console.error("❌ Student or linked teacher not found:", studentError);
          setIsAuthorized(false);
          setLoading(false);
          return;
        }

        teacherIdToCheck = student.teacher_id;
      }

      if (role === "teacher") {
        teacherIdToCheck = userId;
      }

      const { data: quarter, error: quarterError } = await supabase
        .from("quarters")
        .select("name, teacher_id")
        .eq("id", quarterId)
        .single();

      if (quarterError || !quarter) {
        console.error("❌ Quarter not found:", quarterError);
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      if (quarter.teacher_id !== teacherIdToCheck) {
        console.warn("🚫 Unauthorized access to quarter.");
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      setQuarterName(quarter.name);
      setIsAuthorized(true);

      const { data: moduleData, error: moduleError } = await supabase
        .from("modules")
        .select("id, title, description, thumbnail_url")
        .eq("quarter_id", quarterId)
        .order("created_at", { ascending: true });

      if (moduleError || !moduleData) {
        console.error("❌ Module fetch error:", moduleError);
        setLoading(false);
        return;
      }

      setModules(
        (moduleData as any[]).map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description ?? "",
          thumbnail_url: m.thumbnail_url ?? null,
        }))
      );

      setLoading(false);
    };

    fetchModules();
  }, [quarterId, role]);

  const moduleCount = modules.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q)
    );
  }, [modules, query]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Sticky header */}
      <header className="sticky top-16 z-40 border-b border-slate-200/60 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50">
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-3 py-3 sm:h-16 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <BackButton />
            </div>

            <div className="min-w-0 flex items-center gap-3">
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

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 min-w-0">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
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
                  <p className="mt-1 text-sm text-amber-800">
                    You are not authorized to view the modules for this quarter.
                  </p>
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
              return (
                <li key={mod.id}>
                  <ModuleCard
                    title={mod.title}
                    description={mod.description}
                    href={`/modules/${mod.id}`}
                    imageUrl={img}
                  >
                    {isAuthorized && role === "teacher" && (
                      <div className="absolute right-3 top-3 z-10 flex gap-1">
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
                      </div>
                    )}
                  </ModuleCard>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* Add */}
      {showAdd && (
        <AddModuleModal
          quarterId={quarterId}
          closeModal={() => setShowAdd(false)}
          onCreated={(row, imageUrl) => {
            setModules((prev) => [
              {
                id: row.id,
                title: row.title,
                description: row.description ?? "",
                thumbnail_url: imageUrl ?? row.thumbnail_url ?? null,
              },
              ...prev,
            ]);
          }}
        />
      )}

      {/* Edit */}
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
                      thumbnail_url: newImageUrl ?? (row as any).thumbnail_url ?? m.thumbnail_url ?? null,
                    }
                  : m
              )
            );
          }}
          closeModal={() => setEditTarget(null)}
        />
      )}

      {/* Delete */}
      {deleteTarget && (
        <DeleteModuleModal
          moduleId={deleteTarget.id}
          moduleTitle={deleteTarget.title}
          imageUrl={deleteTarget.imageUrl}
          onDeleted={() => {
            setModules((prev) => prev.filter((m) => m.id !== deleteTarget.id));
          }}
          closeModal={() => setDeleteTarget(null)}
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
}: {
  title: string;
  description: string;
  href: string;
  imageUrl: string | null;
  children?: React.ReactNode;
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
      </div>

      <div className="p-5">
        <h3 className="line-clamp-1 text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{description || "—"}</p>

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
