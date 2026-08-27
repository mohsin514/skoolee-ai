"use client";

/**
 * Rank, department and reporting line, asked at the point of hiring.
 *
 * Shared by the add-teacher and add-staff wizards. The hiring decision already
 * knows where the person will sit, so asking here — rather than leaving it to
 * be filled in after they accept — is the difference between an org chart that
 * is right on day one and one that fills up with unplaced staff nobody gets
 * round to placing.
 *
 * Everything here is optional. A school that has not set up its ladder yet
 * sees a short line saying so and carries on inviting people.
 */

import { useEffect, useState } from "react";
import { Network } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TRACK_TONES, DEPARTMENT_KIND_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/lib/staff/hierarchy-presets";

export interface PositionValue {
  designationId: string;
  primaryDepartmentId: string;
  reportsToId: string;
  employmentType: string;
  employeeCode: string;
}

export const emptyPosition: PositionValue = {
  designationId: "",
  primaryDepartmentId: "",
  reportsToId: "",
  employmentType: "FULL_TIME",
  employeeCode: "",
};

interface Option {
  id: string;
  name: string;
  track?: string;
  kind?: string;
  parentId?: string | null;
  designation?: { name: string } | null;
}

export function usePositionOptions(campusId?: string) {
  const [designations, setDesignations] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [managers, setManagers] = useState<Option[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/staff/hierarchy${campusId ? `?campusId=${campusId}` : ""}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setDesignations(data.designations ?? []);
        setDepartments(data.departments ?? []);
        setManagers(
          (data.nodes ?? [])
            .slice()
            .sort(
              (a: { designation?: { level: number }; fullName: string }, b: { designation?: { level: number }; fullName: string }) =>
                (a.designation?.level ?? 999) - (b.designation?.level ?? 999) || a.fullName.localeCompare(b.fullName)
            )
            .map((n: { id: string; fullName: string; designation: { name: string } | null }) => ({
              id: n.id,
              name: n.fullName,
              designation: n.designation,
            }))
        );
      } catch {
        // The wizard still works without a ladder — leave the lists empty.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campusId]);

  return { designations, departments, managers, ready };
}

export function PositionFields({
  value,
  onChange,
  options,
}: {
  value: PositionValue;
  onChange: (next: PositionValue) => void;
  options: ReturnType<typeof usePositionOptions>;
}) {
  const { designations, departments, managers, ready } = options;
  const set = <K extends keyof PositionValue>(key: K, next: PositionValue[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Rank" hint={designations.length === 0 && ready ? "No ranks set up yet — you can add one later under Staff → Hierarchy." : "Their designation on the ladder."}>
        <Select value={value.designationId} onChange={(e) => set("designationId", e.target.value)} disabled={designations.length === 0}>
          <option value="">Not set</option>
          {Object.entries(TRACK_TONES).map(([track, tone]) => {
            const inTrack = designations.filter((d) => d.track === track);
            if (inTrack.length === 0) return null;
            return (
              <optgroup key={track} label={tone.label}>
                {inTrack.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </optgroup>
            );
          })}
        </Select>
      </Field>

      <Field label="Home department" hint="They can be added to more departments afterwards.">
        <Select value={value.primaryDepartmentId} onChange={(e) => set("primaryDepartmentId", e.target.value)} disabled={departments.length === 0}>
          <option value="">Not set</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.parentId ? "— " : ""}
              {d.name}
              {d.kind ? ` (${DEPARTMENT_KIND_LABELS[d.kind as keyof typeof DEPARTMENT_KIND_LABELS]})` : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Reports to" hint="Who they answer to day to day. Leave empty for the head of the institution.">
        <Select value={value.reportsToId} onChange={(e) => set("reportsToId", e.target.value)}>
          <option value="">Not set</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.designation ? ` — ${m.designation.name}` : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Employment type">
        <Select value={value.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
          {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Select>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Staff code" hint="Your own employee number, if you use one.">
          <Input value={value.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} placeholder="e.g. EMP-0142" />
        </Field>
      </div>
    </div>
  );
}

export { Network as PositionIcon };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-black text-ink">{label}</label>
      {children}
      {hint ? <p className="text-[10px] font-semibold text-ink-muted">{hint}</p> : null}
    </div>
  );
}
