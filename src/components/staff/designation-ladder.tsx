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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BrandButton } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DeskFilterStatus, DeskPill, DeskQuickFilter, deskRow } from "@/components/ui/desk";
import { cn } from "@/lib/utils";
import { TRACK_TONES } from "@/lib/staff/hierarchy-presets";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { SkeletonList, SkeletonRegion } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";


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

/**
 * `addRequest` (each change opens "New rank") and `hideAdd` let a console's PageHeader carry "Add rank" as the
 * tab's primary action; "Use a preset" stays here as the in-panel alternative.
 */
export function DesignationLadder({ campusId, onChanged, addRequest, hideAdd = false }: { campusId?: string; onChanged?: () => void; addRequest?: number; hideAdd?: boolean }) {
  const ui = useUiText();
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
  const [loadError, setLoadError] = useState(false);
  const lastAddRequest = useRef(addRequest);
  useEffect(() => {
    if (addRequest === undefined || addRequest === lastAddRequest.current) return;
    lastAddRequest.current = addRequest;
    setDraft({ ...emptyDraft });
  }, [addRequest]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/designations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the rank ladder");
      setDesignations(data.designations ?? []);
      setPresets(data.presets ?? []);
      setInstitutionType(data.institutionType ?? "SCHOOL");
      setLoadError(false);
    } catch (error) {
      // R4: the inline ErrorState below (with retry) is the only signal; no toast on top of it.
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A long ladder gets the desks' type-to-narrow box (name or short name); `/` jumps to it, Escape clears it.
  const [rankQuery, setRankQuery] = useState("");
  const needle = rankQuery.trim().toLocaleLowerCase();
  const shownRanks = useMemo(
    () => (needle ? designations.filter((d) => `${d.name} ${d.shortName ?? ""}`.toLocaleLowerCase().includes(needle)) : designations),
    [designations, needle]
  );
  const byTrack = useMemo(() => {
    const groups = new Map<string, Designation[]>();
    for (const d of shownRanks) {
      const list = groups.get(d.track) ?? [];
      list.push(d);
      groups.set(d.track, list);
    }
    return groups;
  }, [shownRanks]);

  const applyPreset = async (type: string) => {
    setApplying(type);
    try {
      const res = await fetch("/api/staff/designations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: type, campusId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "");
      toast.success(
        data.designationsAdded === 0 && data.departmentsAdded === 0
          ? "Everything in that preset already exists here."
          : ui("Added {0} ranks and {1} units.", [data.designationsAdded, data.departmentsAdded])
      );
      setShowPresets(false);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not apply the preset. Please try again.")));
    } finally {
      setApplying(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error(ui("Give the rank a name"));
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
      if (!res.ok) throw new Error(data.error || "");
      toast.success(draft.id ? ui("Rank updated") : ui("{0} added to the ladder", [payload.name]));
      setDraft(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not save the rank. Please try again.")));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (designation: Designation) => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/staff/designations?id=${designation.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "");
      toast.success(data.message || ui("{0} removed", [designation.name]));
      setPendingRemoval(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not remove the rank. Please try again.")));
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <SkeletonRegion label={ui("Loading the rank ladder…")} className="space-y-3 py-2">
        <SkeletonList rows={5} />
      </SkeletonRegion>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title={ui("The rank ladder did not load")}
        description={ui("Could not load the rank ladder. Check your connection and try again.")}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink-strong">{ui("Rank ladder")}</h3>
          <p className="mt-0.5 max-w-2xl text-sm font-normal leading-relaxed text-ink-muted">
            {ui("Every rank your institution uses, most senior first. Nothing here is fixed — rename what you like, reorder by changing the seniority number, and retire what you no longer use.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BrandButton variant="soft" icon={<Sparkles className="h-4 w-4" />} onClick={() => setShowPresets(true)}>
            {ui("Use a preset")}
          </BrandButton>
          {hideAdd ? null : (
            <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...emptyDraft })}>
              {ui("Add rank")}
            </BrandButton>
          )}
        </div>
      </div>

      {designations.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={ui("No ranks defined yet")}
          description={ui("Ranks are what make the chart mean something — who is senior to whom, who can head a department, and what a promotion moves someone into. Start from a preset for your kind of institution, or build the ladder yourself.")}
          action={
            <BrandButton icon={<Sparkles className="h-4 w-4" />} onClick={() => setShowPresets(true)}>
              {ui("Choose a preset")}
            </BrandButton>
          }
          secondaryAction={
            <BrandButton variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...emptyDraft })}>
              {ui("Add the first rank")}
            </BrandButton>
          }
        />
      ) : (
        <div className="space-y-5">
          {designations.length > 8 ? (
            <div className="space-y-2">
              <DeskQuickFilter value={rankQuery} onChange={setRankQuery} label={ui("Search ranks")} />
              <DeskFilterStatus shown={shownRanks.length} total={designations.length} onClear={() => setRankQuery("")} />
            </div>
          ) : null}
          {Object.entries(TRACK_TONES).map(([track, tone]) => {
            const ranks = byTrack.get(track) ?? [];
            if (ranks.length === 0) return null;
            return (
              <section key={track} className="space-y-2">
                <h4 className="flex items-center gap-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: tone.hex }} />
                  {ui(tone.label)}
                  <span className="font-semibold normal-case tracking-normal tabular-nums">({ranks.length})</span>
                </h4>
                <ul className="space-y-1.5">
                  {ranks.map((d) => {
                    const promotesTo = designations.find((x) => x.id === d.promotesToId);
                    return (
                      // A desk row whose rail takes the track's colour; a retired rank reads muted.
                      <li
                        key={d.id}
                        data-tone={d.isActive ? "brand" : "muted"}
                        className={cn(deskRow, "flex flex-wrap items-center gap-x-3 gap-y-1.5", !d.isActive && "border-dashed")}
                        style={{ ["--dk-border" as string]: tone.hex }}
                      >
                        <Tooltip content={ui("Seniority — lower is more senior")}>
                        <span tabIndex={0} className="flex h-7 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-2xs font-bold tabular-nums text-ink-muted">
                          {d.level}
                        </span>
                        </Tooltip>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-ink-strong">{d.name}</span>
                            {d.shortName ? <span className="text-xs font-medium text-ink-muted">({d.shortName})</span> : null}
                            {d.isInstitutionHead ? (
                              <DeskPill tone="brand">
                                <Crown aria-hidden="true" className="size-3" /> {" "}{ui("Head of institution")}
                              </DeskPill>
                            ) : null}
                            {d.canHeadDepartment ? (
                              <DeskPill tone="info">{ui("Can head a unit")}</DeskPill>
                            ) : null}
                            {!d.isActive ? (
                              <DeskPill tone="neutral">{ui("Retired")}</DeskPill>
                            ) : null}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs font-normal text-ink-subtle">
                            {promotesTo ? (
                              <span className="inline-flex items-center gap-1">
                                <ArrowUp aria-hidden="true" className="h-3 w-3" /> {ui("promotes to {0}", [promotesTo.name])}
                              </span>
                            ) : null}
                            {d.minYearsInRank ? <span>{ui("after about {0} years", [d.minYearsInRank])}</span> : null}
                            <span className="inline-flex items-center gap-1">
                              <Users aria-hidden="true" className="h-3 w-3" /> {ui("{0} staff", [d.staffCount])}
                            </span>
                          </span>
                        </span>

                        <span className="flex shrink-0 gap-1">
                          <IconButton variant="secondary"
                            label={ui("Edit {0}", [d.name])}
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
                          >
                            <Pencil aria-hidden="true" />
                          </IconButton>
                          <IconButton variant="ghost" className="text-status-error-text actionable-hover:bg-status-error-surface actionable-hover:text-status-error-text"
                            label={ui("Remove {0}", [d.name])}
                            onClick={() => setPendingRemoval(d)}
                          >
                            <Trash2 aria-hidden="true" />
                          </IconButton>
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
        title={pendingRemoval ? (pendingRemoval.staffCount > 0 ? ui("Retire {0}?", [pendingRemoval.name]) : ui("Delete {0}?", [pendingRemoval.name])) : ""}
        description={
          pendingRemoval && pendingRemoval.staffCount > 0
            ? ui("{0} staff hold this rank, so it will be retired rather than deleted — they keep it, and it simply stops being offered for new appointments.", [pendingRemoval.staffCount])
            : ui("Nobody holds this rank, so it will be deleted outright.")
        }
        confirmLabel={pendingRemoval && pendingRemoval.staffCount > 0 ? ui("Retire rank") : ui("Delete rank")}
        busy={removing}
        onConfirm={async () => { if (pendingRemoval) await remove(pendingRemoval); }}
        onCancel={() => setPendingRemoval(null)}
      />

      {/* ── Preset picker ────────────────────────────────── */}
      {showPresets ? (
        <Modal
          title={ui("Start from a preset")}
          eyebrow={ui("Rank ladder")}
          subtitle={ui("Pick the shape closest to your institution. Ranks you already have are left alone — a preset only adds what is missing.")}
          icon={Sparkles}
          size="md"
          onClose={() => setShowPresets(false)}
        >
          <ul className="space-y-2">
            {presets.map((preset) => (
              <li key={preset.type}>
                <Button variant="ghost"
                  type="button"
                  disabled={applying !== null}
                  aria-busy={applying === preset.type ? true : undefined}
                  aria-current={institutionType === preset.type ? "true" : undefined}
                  onClick={() => applyPreset(preset.type)}
                  className={cn(
                    "sk-row-interactive flex h-auto w-full items-start justify-start gap-3 whitespace-normal py-3 text-start",
                    institutionType === preset.type && "bg-brand-50/40"
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                    {applying === preset.type ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Layers aria-hidden="true" className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-strong">{preset.label}</span>
                      {institutionType === preset.type ? (
                        <Badge variant="default" size="sm" className="gap-1">
                          <Check aria-hidden="true" className="h-2.5 w-2.5" /> {" "}{ui("Current")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs font-normal leading-relaxed text-ink-muted">{preset.blurb}</span>
                    <span className="mt-1.5 block text-xs font-medium tabular-nums text-ink-subtle">
                      {ui("{0} ranks · {1} units", [preset.rankCount, preset.departmentCount])}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}

      {/* ── Rank editor ──────────────────────────────────── */}
      {draft ? (
        <Modal
          title={draft.id ? draft.name ? ui("Edit {0}", [draft.name]) : ui("Edit rank") : ui("New rank")}
          eyebrow={ui("Rank ladder")}
          icon={Layers}
          size="md"
          onClose={() => setDraft(null)}
          footer={
            <ModalActions
              busy={saving}
              busyLabel={ui("Saving…")}
              actionLabel={draft.id ? ui("Save rank") : ui("Add rank")}
              onCancel={() => setDraft(null)}
              onAction={save}
              blockedReason={draft.name.trim() ? null : ui("Give the rank a name.")}
            />
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabelledField label={ui("Name")} required>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={ui("e.g. Senior Teacher")} />
              </LabelledField>
              <LabelledField label={ui("Short name")} hint={ui("Shown on the chart when space is tight")}>
                <Input value={draft.shortName} onChange={(e) => setDraft({ ...draft, shortName: e.target.value })} placeholder={ui("e.g. Sr. Teacher")} />
              </LabelledField>
              <LabelledField label={ui("Seniority")} hint={ui("Lower is more senior. Step by 10 so you can slot ranks in later.")}>
                <Input type="number" min={1} max={999} value={draft.level} onChange={(e) => setDraft({ ...draft, level: Number(e.target.value) })} />
              </LabelledField>
              <LabelledField label={ui("Track")}>
                <Select value={draft.track} onChange={(e) => setDraft({ ...draft, track: e.target.value })}>
                  {Object.entries(TRACK_TONES).map(([key, tone]) => (
                    <option key={key} value={key}>{ui(tone.label)}</option>
                  ))}
                </Select>
              </LabelledField>
              <LabelledField label={ui("Promotes into")} hint={ui("Pre-fills the promote shortcut. Optional.")}>
                <Select value={draft.promotesToId} onChange={(e) => setDraft({ ...draft, promotesToId: e.target.value })}>
                  <option value="">{ui("Nothing — top of this track")}</option>
                  {designations
                    .filter((d) => d.id !== draft.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </Select>
              </LabelledField>
              <LabelledField label={ui("Usual years in rank")} hint={ui("Flags who is due. Blocks nothing.")}>
                <Input type="number" min={0} max={50} value={draft.minYearsInRank} onChange={(e) => setDraft({ ...draft, minYearsInRank: e.target.value })} placeholder="e.g. 4" />
              </LabelledField>
            </div>

            <LabelledField label={ui("Description")} hint={ui("What this rank is for. Shown to admins, not to staff.")}>
              <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </LabelledField>

            <div className="space-y-2 rounded-2xl bg-muted/60 p-3.5">
              <Toggle
                checked={draft.canHeadDepartment}
                onChange={(v) => setDraft({ ...draft, canHeadDepartment: v })}
                label={ui("Can head a department")}
                hint={ui("Whether someone at this rank may be given charge of a unit. Headship is still assigned per department.")}
              />
              <Toggle
                checked={draft.isInstitutionHead}
                onChange={(v) => setDraft({ ...draft, isInstitutionHead: v })}
                label={ui("Head of the institution")}
                hint={ui("The root of the org chart — Principal, Director, Vice Chancellor. Only one rank can hold this.")}
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
      <label className="block text-sm font-semibold text-ink-strong">
        {label}
        {required ? <span aria-hidden="true" className="ms-0.5 text-status-error-text">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs font-normal leading-relaxed text-ink-subtle">{hint}</p> : null}
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
      <SystemCheckbox  checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink-strong">{label}</span>
        <span className="block text-xs font-normal leading-relaxed text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}
