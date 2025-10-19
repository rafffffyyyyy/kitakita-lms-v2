"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { RosterStudent } from "@/lib/types/progress";

export default function StudentList({
  roster,
  loading,
  error,
  value,
  onChange,
}: {
  roster: RosterStudent[];
  loading?: boolean;
  error?: string | null;
  value: string | null;
  onChange: (s: RosterStudent) => void;
}) {
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("__all");

  // ----- Skeleton while loading -----
  if (loading) {
    return (
      <div className="flex flex-col gap-3 h-full">
        {/* Search + filter skeletons */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <div className="h-9 rounded-xl bg-neutral-200 animate-pulse" />
          </div>
          <div className="h-9 w-32 rounded-xl bg-neutral-200 animate-pulse" />
        </div>

        {/* Group + rows skeletons */}
        <div className="space-y-4 overflow-auto min-h-0">
          {Array.from({ length: 2 }).map((_, gi) => (
            <div key={gi}>
              <div className="h-3 w-24 mb-2 rounded bg-neutral-200 animate-pulse" />
              <ul className="space-y-2">
                {Array.from({ length: 5 }).map((__, ri) => (
                  <li key={ri}>
                    <div className="w-full flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-neutral-200 animate-pulse" />
                        <div className="min-w-0 space-y-2">
                          <div className="h-3 w-40 rounded bg-neutral-200 animate-pulse" />
                          <div className="h-3 w-24 rounded bg-neutral-200 animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  const sections = useMemo(() => {
    const map = new Map<string, { name: string; items: RosterStudent[] }>();
    for (const s of roster) {
      const name = (s as any).section_name || "All";
      if (!map.has(name)) map.set(name, { name, items: [] });
      map.get(name)!.items.push(s);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [roster]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySection =
      sectionFilter === "__all"
        ? roster
        : roster.filter((s) => ((s as any).section_name || "All") === sectionFilter);

    if (!q) return bySection;

    return bySection.filter((s) => {
      const name = `${s.last_name}, ${s.first_name}`.toLowerCase();
      const lrn = (s as any).lrn?.toLowerCase?.() || "";
      const username = (s as any).username?.toLowerCase?.() || "";
      return name.includes(q) || lrn.includes(q) || username.includes(q);
    });
  }, [roster, query, sectionFilter]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Search + Section filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, LRN, username…"
            className="w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="__all">All sections</option>
          {sections.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Grouped by section (simple list) */}
      <div className="space-y-4 overflow-auto min-h-0">
        {sections.map((sec) => {
          const showGroup =
            sectionFilter === "__all" ? true : sectionFilter === sec.name;
          const items = filtered.filter(
            (r) => ((r as any).section_name || "All") === sec.name
          );
          if (!showGroup || items.length === 0) return null;

          return (
            <div key={sec.name}>
              <div className="text-xs font-semibold text-neutral-500 mb-1">
                {sec.name} <span className="opacity-60">({sec.items.length})</span>
              </div>
              <ul className="space-y-2">
                {items.map((s) => {
                  const selected = s.id === value;
                  const avatarUrl =
                    (s as any).profile_picture_url ||
                    (s as any).avatar_url ||
                    (s as any).avatarUrl ||
                    (s as any).imageUrl ||
                    null;

                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => onChange(s)}
                        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left ${
                          selected
                            ? "border-blue-600 bg-blue-50"
                            : "border-neutral-200 bg-white hover:bg-neutral-50"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={`${s.first_name ?? ""} ${s.last_name ?? ""}`}
                              className="h-8 w-8 rounded-full object-cover ring-1 ring-neutral-200"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-semibold text-indigo-700">
                              {initials(s.first_name, s.last_name)}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="text-sm font-medium text-neutral-900 truncate">
                              {s.last_name}, {s.first_name}
                            </div>
                            {/* ID removed */}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function initials(first?: string | null, last?: string | null) {
  const f = (first?.[0] || "").toUpperCase();
  const l = (last?.[0] || "").toUpperCase();
  return `${f}${l}` || "ST";
}
