"use client";

/**
 * The rank ladder editor.
 *
 * This is the screen that makes the rest of the staff module work for an
 * institution we have never seen. A tenant picks the preset closest to how
 * they are organised — or none at all — and then owns every rank on the list:
 * its name, where it sits in the order of seniority, whether it can run a
 * department, and what it promotes into.
 *
 * Presets top up rather than replace, so applying one on a live school never
 * pulls a rank out from under the people holding it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  Check,
  Crown,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BrandButton } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { cn } from "@/lib/utils";
import { TRACK_TONES } from "@/lib/staff/hierarchy-presets";

interface Designation {
  id: string;
  name: string;
  shortName: string | null;
  level: number;
  track: string;
  canHeadDepartment: boolean;
  isInstitutionHead: boolean;
  promotesToId: string | null;
  minYearsInRank: number | null;
  description: string | null;
  isActive: boolean;
  staffCount: number;
}

interface Preset {
  type: string;
  label: string;
  blurb: string;
  rankCount: number;
  departmentCount: number;
}

const emptyDraft = {
  id: "",
  name: "",
  shortName: "",
  level: 50,
  track: "ACADEMIC",
  canHeadDepartment: false,
  isInstitutionHead: false,
  promotesToId: "",
  minYearsInRank: "",
  description: "",
};

export function DesignationLadder({ campusId, onChanged }: { campusId?: string; onChanged?: () => void }) {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [institutionType, setInstitutionType] = useState("SCHOOL");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<typeof emptyDraft | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Designation | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/designations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the rank ladder");
      setDesignations(data.designations ?? []);
      setPresets(data.presets ?? []);
      setInstitutionType(data.institutionType ?? "SCHOOL");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the rank ladder");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byTrack = useMemo(() => {
    const groups = new Map<string, Designation[]>();
    for (const d of designations) {
      const list = groups.get(d.track) ?? [];
      list.push(d);
      groups.set(d.track, list);
    }
    return groups;
  }, [designations]);

  const applyPreset = async (type: string) => {
    setApplying(type);
    try {
      const res = await fetch("/api/staff/designations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: type, campusId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not apply the preset");
      toast.success(
        data.designationsAdded === 0 && data.departmentsAdded === 0
          ? "Everything in that preset already exists here."
          : `Added ${data.designationsAdded} rank(s) and ${data.departmentsAdded} unit(s).`
      );
      setShowPresets(false);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply the preset");
    } finally {
      setApplying(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Give the rank a name");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        shortName: draft.shortName.trim() || null,
        level: Number(draft.level),
        track: draft.track,
        canHeadDepartment: draft.canHeadDepartment,
        isInstitutionHead: draft.isInstitutionHead,
        promotesToId: draft.promotesToId || null,
        minYearsInRank: draft.minYearsInRank === "" ? null : Number(draft.minYearsInRank),
        description: draft.description.trim() || null,
      };
      const res = await fetch("/api/staff/designations", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the rank");
      toast.success(draft.id ? "Rank updated" : `${payload.name} added to the ladder`);
      setDraft(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the rank");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (designation: Designation) => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/staff/designations?id=${designation.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove the rank");
      toast.success(data.message || `${designation.name} removed`);
      setPendingRemoval(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the rank");
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-xs font-bold text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading the rank ladder…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-ink">Rank ladder</h3>
          <p className="mt-0.5 max-w-2xl text-xs font-semibold text-ink-muted">
            Every rank your institution uses, most senior first. Nothing here is fixed — rename what you like,
            reorder by changing the seniority number, and retire what you no longer use.
          </p>
        </div>
        <div className="flex gap-2">
          <BrandButton variant="soft" icon={<Sparkles className="h-4 w-4" />} onClick={() => setShowPresets(true)}>
            Use a preset
          </BrandButton>
          <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...emptyDraft })}>
            Add rank
          </BrandButton>
        </div>
      </div>

      {designations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#cfc2d6]/60 bg-[#fafaff] px-6 py-12 text-center">
          <Layers className="mx-auto h-8 w-8 text-ink-muted" />
          <p className="mt-3 text-sm font-black text-ink">No ranks defined yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs font-semibold text-ink-muted">
            Ranks are what make the chart mean something — who is senior to whom, who can head a department, and
            what a promotion moves someone into. Start from a preset for your kind of institution, or build the
            ladder yourself.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <BrandButton icon={<Sparkles className="h-4 w-4" />} onClick={() => setShowPresets(true)}>
              Choose a preset
            </BrandButton>
            <BrandButton variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...emptyDraft })}>
              Add the first rank
            </BrandButton>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(TRACK_TONES).map(([track, tone]) => {
            const ranks = byTrack.get(track) ?? [];
            if (ranks.length === 0) return null;
            return (
              <section key={track} className="space-y-2">
                <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.hex }} />
                  {tone.label}
                  <span className="font-bold normal-case tracking-normal">({ranks.length})</span>
                </h4>
                <ul className="space-y-1.5">
                  {ranks.map((d) => {
                    const promotesTo = designations.find((x) => x.id === d.promotesToId);
                    return (
                      <li
                        key={d.id}
                        className={cn(
                          "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border bg-white px-3.5 py-3",
                          d.isActive ? "border-[#cfc2d6]/40" : "border-dashed border-[#cfc2d6]/60 opacity-60"
                        )}
                        style={{ borderLeftWidth: 4, borderLeftColor: tone.hex }}
                      >
                        <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f9] text-[10px] font-black tabular-nums text-ink-muted" title="Seniority — lower is more senior">
                          {d.level}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-black text-ink">{d.name}</span>
                            {d.shortName ? <span className="text-[10px] font-bold text-ink-muted">({d.shortName})</span> : null}
                            {d.isInstitutionHead ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#fbf0fe] px-2 py-0.5 text-[9px] font-black text-[#8127cf]">
                                <Crown className="h-2.5 w-2.5" /> HEAD OF INSTITUTION
                              </span>
                            ) : null}
                            {d.canHeadDepartment ? (
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black text-indigo-600">CAN HEAD A UNIT</span>
                            ) : null}
                            {!d.isActive ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">RETIRED</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[10px] font-semibold text-ink-muted">
                            {promotesTo ? (
                              <span className="inline-flex items-center gap-1">
                                <ArrowUp className="h-3 w-3" /> promotes to {promotesTo.name}
                              </span>
                            ) : null}
                            {d.minYearsInRank ? <span>after ~{d.minYearsInRank}y</span> : null}
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" /> {d.staffCount} staff
                            </span>
                          </span>
                        </span>

                        <span className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setDraft({
                                id: d.id,
                                name: d.name,
                                shortName: d.shortName ?? "",
                                level: d.level,
                                track: d.track,
                                canHeadDepartment: d.canHeadDepartment,
                                isInstitutionHead: d.isInstitutionHead,
                                promotesToId: d.promotesToId ?? "",
                                minYearsInRank: d.minYearsInRank == null ? "" : String(d.minYearsInRank),
                                description: d.description ?? "",
                              })
                            }
                            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                            aria-label={`Edit ${d.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingRemoval(d)}
                            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Remove ${d.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmAction
        open={pendingRemoval !== null}
        tone={pendingRemoval && pendingRemoval.staffCount > 0 ? "warning" : "danger"}
        title={pendingRemoval ? (pendingRemoval.staffCount > 0 ? `Retire ${pendingRemoval.name}?` : `Delete ${pendingRemoval.name}?`) : ""}
        description={
          pendingRemoval && pendingRemoval.staffCount > 0
            ? `${pendingRemoval.staffCount} staff hold this rank, so it will be retired rather than deleted — they keep it, and it simply stops being offered for new appointments.`
            : "Nobody holds this rank, so it will be deleted outright."
        }
        confirmLabel={pendingRemoval && pendingRemoval.staffCount > 0 ? "Retire rank" : "Delete rank"}
        busy={removing}
        onConfirm={() => pendingRemoval && remove(pendingRemoval)}
        onCancel={() => setPendingRemoval(null)}
      />

      {/* ── Preset picker ────────────────────────────────── */}
      {showPresets ? (
        <Modal
          title="Start from a preset"
          eyebrow="Rank ladder"
          subtitle="Pick the shape closest to your institution. Ranks you already have are left alone — a preset only adds what is missing."
          icon={Sparkles}
          size="md"
          onClose={() => setShowPresets(false)}
        >
          <ul className="space-y-2">
            {presets.map((preset) => (
              <li key={preset.type}>
                <button
                  type="button"
                  disabled={applying !== null}
                  onClick={() => applyPreset(preset.type)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all hover:border-[#8127cf] hover:bg-[#fbf0fe]/40 disabled:opacity-50",
                    institutionType === preset.type ? "border-[#8127cf] bg-[#fbf0fe]/40" : "border-[#cfc2d6]/40"
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf]">
                    {applying === preset.type ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-black text-ink">{preset.label}</span>
                      {institutionType === preset.type ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#8127cf] px-2 py-0.5 text-[9px] font-black text-white">
                          <Check className="h-2.5 w-2.5" /> CURRENT
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-ink-muted">{preset.blurb}</span>
                    <span className="mt-1.5 block text-[10px] font-black uppercase tracking-wide text-ink-subtle">
                      {preset.rankCount} ranks · {preset.departmentCount} units
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}

      {/* ── Rank editor ──────────────────────────────────── */}
      {draft ? (
        <Modal
          title={draft.id ? `Edit ${draft.name || "rank"}` : "New rank"}
          eyebrow="Rank ladder"
          icon={Layers}
          size="md"
          onClose={() => setDraft(null)}
          footer={
            <ModalActions
              busy={saving}
              busyLabel="Saving…"
              actionLabel={draft.id ? "Save rank" : "Add rank"}
              onCancel={() => setDraft(null)}
              onAction={save}
              blockedReason={draft.name.trim() ? null : "Give the rank a name."}
            />
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabelledField label="Name" required>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Senior Teacher" />
              </LabelledField>
              <LabelledField label="Short name" hint="Shown on the chart when space is tight">
                <Input value={draft.shortName} onChange={(e) => setDraft({ ...draft, shortName: e.target.value })} placeholder="e.g. Sr. Teacher" />
              </LabelledField>
              <LabelledField label="Seniority" hint="Lower is more senior. Step by 10 so you can slot ranks in later.">
                <Input type="number" min={1} max={999} value={draft.level} onChange={(e) => setDraft({ ...draft, level: Number(e.target.value) })} />
              </LabelledField>
              <LabelledField label="Track">
                <Select value={draft.track} onChange={(e) => setDraft({ ...draft, track: e.target.value })}>
                  {Object.entries(TRACK_TONES).map(([key, tone]) => (
                    <option key={key} value={key}>{tone.label}</option>
                  ))}
                </Select>
              </LabelledField>
              <LabelledField label="Promotes into" hint="Pre-fills the promote shortcut. Optional.">
                <Select value={draft.promotesToId} onChange={(e) => setDraft({ ...draft, promotesToId: e.target.value })}>
                  <option value="">Nothing — top of this track</option>
                  {designations
                    .filter((d) => d.id !== draft.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </Select>
              </LabelledField>
              <LabelledField label="Usual years in rank" hint="Flags who is due. Blocks nothing.">
                <Input type="number" min={0} max={50} value={draft.minYearsInRank} onChange={(e) => setDraft({ ...draft, minYearsInRank: e.target.value })} placeholder="e.g. 4" />
              </LabelledField>
            </div>

            <LabelledField label="Description" hint="What this rank is for. Shown to admins, not to staff.">
              <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </LabelledField>

            <div className="space-y-2 rounded-2xl bg-[#f3f4f9]/60 p-3.5">
              <Toggle
                checked={draft.canHeadDepartment}
                onChange={(v) => setDraft({ ...draft, canHeadDepartment: v })}
                label="Can head a department"
                hint="Whether someone at this rank may be given charge of a unit. Headship is still assigned per department."
              />
              <Toggle
                checked={draft.isInstitutionHead}
                onChange={(v) => setDraft({ ...draft, isInstitutionHead: v })}
                label="Head of the institution"
                hint="The root of the org chart — Principal, Director, Vice Chancellor. Only one rank can hold this."
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function LabelledField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-black text-ink">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[10px] font-semibold text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#8127cf]" />
      <span className="min-w-0">
        <span className="block text-xs font-black text-ink">{label}</span>
        <span className="block text-[10px] font-semibold text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}
