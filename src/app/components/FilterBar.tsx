"use client";

import {
  CalendarIcon,
  DocumentMagnifyingGlassIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import type { AssignmentOpt, ModuleOpt, QuarterOpt } from "@/lib/types/progress";

type SectionOpt = { id: number | string; name: string };

export default function FilterBar({
  quarters,
  modules,
  assignments,
  quarterId,
  moduleId,
  assignmentId,
  onQuarter,
  onModule,
  onAssignment,
  // optional section filter (you can omit these props)
  sections,
  sectionId,
  onSection,
  busy,
}: {
  quarters: QuarterOpt[];
  modules: ModuleOpt[];
  assignments: AssignmentOpt[];
  quarterId: string;
  moduleId: string;
  assignmentId: string;
  onQuarter: (v: string) => void;
  onModule: (v: string) => void;
  onAssignment: (v: string) => void;
  sections?: SectionOpt[];
  sectionId?: string | number;
  onSection?: (v: string) => void;
  busy?: boolean;
}) {
  const hasSection = !!sections?.length && !!onSection;

  return (
    <div
      className={`grid grid-cols-1 ${
        hasSection ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"
      } gap-3 items-start`}
    >
      {/* Quarter */}
      <LabeledSelect
        id="quarter-select"
        icon={<CalendarIcon className="w-5 h-5 text-neutral-700" />}
        label="Quarter"
        value={quarterId}
        onChange={onQuarter}
        disabled={busy}
        options={[{ id: "", name: "Select quarter" } as any, ...quarters]}
        // quarters use `name`
        getOptionLabel={(o: QuarterOpt | any) => o.name}
        count={quarters.length}
      />

      {/* Module */}
      <LabeledSelect
        id="module-select"
        icon={<DocumentMagnifyingGlassIcon className="w-5 h-5 text-neutral-700" />}
        label="Module"
        value={moduleId}
        onChange={onModule}
        disabled={!quarterId || busy}
        options={[{ id: "", title: "Select module", quarter_id: "" } as any, ...modules]}
        // modules use `title` (fallback to name only if present)
        getOptionLabel={(o: ModuleOpt | any) => o.title ?? o.name ?? ""}
        count={modules.length}
      />

      {/* Assignment */}
      <LabeledSelect
        id="assignment-select"
        icon={<ClipboardDocumentCheckIcon className="w-5 h-5 text-neutral-700" />}
        label="Assignment"
        value={assignmentId}
        onChange={onAssignment}
        disabled={!moduleId || busy}
        options={[{ id: "", name: "Select assignment", module_id: "" } as any, ...assignments]}
        // assignments use `name` (fallback to title if someone named it that way)
        getOptionLabel={(o: AssignmentOpt | any) => o.name ?? o.title ?? ""}
        count={assignments.length}
      />

      {/* Optional: Section */}
      {hasSection && (
        <LabeledSelect
          id="section-select"
          icon={
            <span
              className="inline-block w-5 h-5 rounded bg-neutral-200"
              aria-hidden="true"
            />
          }
          label="Section (optional)"
          value={String(sectionId ?? "")}
          onChange={onSection!}
          disabled={!assignmentId || busy}
          options={[{ id: "", name: "All sections" } as any, ...sections!]}
          getOptionLabel={(o: SectionOpt | any) => o.name}
          count={sections!.length}
        />
      )}
    </div>
  );
}

/**
 * Small, overlap-proof select with label + icon + (optional) count badge.
 * - `min-w-0` everywhere so it shrinks correctly inside grids/flex.
 * - First placeholder option is selectable (value="") for clarity.
 */
function LabeledSelect<T>({
  id,
  icon,
  label,
  value,
  onChange,
  disabled,
  options,
  getOptionLabel,
  count,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: T[];
  getOptionLabel: (o: T) => string;
  /** tiny debug count shown to the right of the label (optional) */
  count?: number;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-neutral-600">{label}</div>
            {typeof count === "number" && (
              <span className="text-[10px] text-neutral-400">({count})</span>
            )}
          </div>
          <select
            id={id}
            aria-label={label}
            className="min-w-0 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60 truncate"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            {options.map((o: any) => {
              const key = String(o.id ?? "");
              const labelText = (getOptionLabel(o) ?? "") as string;
              return (
                <option key={key} value={key}>
                  {labelText}
                </option>
              );
            })}
          </select>
        </div>
      </div>
    </div>
  );
}
