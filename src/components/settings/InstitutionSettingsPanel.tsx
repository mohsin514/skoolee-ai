"use client";

import { ArchivedCampusList, CampusArchiveButton, CampusArchiveDialog } from "./campus-lifecycle";
import { Button } from "@/components/ui/button";
import { UiText, useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { FormErrorSummary } from "@/components/ui/form-field";
import { DraftRecovery } from "@/components/ui/draft-recovery";
import { ErrorState } from "@/components/ui/error-state";
import { Alert } from "@/components/ui/alert";
import { SkeletonCards, SkeletonList } from "@/components/ui/skeleton";
import { InputGroup } from "@/components/ui/input-group";
import { usePanelCommand } from "@/components/fees/fee-utils";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "@/components/ui/toast";
import {
  Building,
  Building2,
  CalendarDays,
  Clock,
  Globe,
  GraduationCap,
  Hash,
  ImageIcon,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Tag,
  Upload,
  UserRound,
} from "lucide-react";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BoardSelect } from "@/components/ui/board-select";
import {
  getInstitutionHistory,
  getInstitutionSettings,
  updateCampusDetails,
  updateSchoolDetails,
  type InstitutionHistoryEntry,
  type InstitutionSettings,
} from "@/app/actions/settings";
import { resolveMediaUrl } from "@/lib/storage/s3";
import { Select as SystemSelect } from "@/components/ui/select";

/** Offered zones. Anything already stored is added so it is never silently lost. */
const TIMEZONES = [
  { value: "Asia/Karachi", label: "Pakistan — Asia/Karachi (PKT)" },
  { value: "Asia/Dubai", label: "UAE — Asia/Dubai (GST)" },
  { value: "Asia/Riyadh", label: "Saudi Arabia — Asia/Riyadh (AST)" },
  { value: "Asia/Kolkata", label: "India — Asia/Kolkata (IST)" },
  { value: "Asia/Dhaka", label: "Bangladesh — Asia/Dhaka (BST)" },
  { value: "Asia/Kabul", label: "Afghanistan — Asia/Kabul (AFT)" },
  { value: "Europe/London", label: "UK — Europe/London" },
  { value: "America/New_York", label: "US Eastern — America/New_York" },
  { value: "UTC", label: "UTC" },
];

type SchoolForm = InstitutionSettings["school"];
type CampusForm = InstitutionSettings["campuses"][number];
type Tr = ReturnType<typeof useUiText>;

// SKO-402: a save sends only the fields that changed (the server keeps every omitted field) and is reviewed
// first as a before/after list; the record's history shows who changed what.
const FIELD_LABEL = (tr: Tr, key: string) => ({ name: tr("Name"), tagline: tr("Tagline / Motto"), city: tr("City"), address: tr("Address"), phone: tr("Phone"), website: tr("Website"), email: tr("Campus Email"), principalName: tr("Head of Campus"), board: tr("Examination Board"), logoUrl: tr("Logo"), establishedYear: tr("Established"), timezone: tr("Time Zone") } as Record<string, string>)[key] ?? key;
const clean = (value: unknown) => (typeof value === "string" ? value.trim() : value ?? "");
function changedFields<T extends Record<string, unknown>>(baseline: T, form: T, keys: (keyof T)[]) {
  return keys.filter(key => String(clean(form[key])) !== String(clean(baseline[key])));
}
function ChangeSummary({ keys, baseline, form }: { keys: string[]; baseline: Record<string, unknown>; form: Record<string, unknown> }) {
  const tr = useUiText();
  const show = (key: string, value: unknown) => key === "logoUrl" ? (value ? tr("New logo") : tr("No logo")) : String(clean(value)) || tr("(empty)");
  return <section aria-label={tr("Review changes")} className="space-y-2 rounded-2xl border border-edge/40 bg-card p-4" data-change-summary>
    <p className="text-2xs font-semibold text-primary">{tr("Review changes")}</p>
    {keys.length ? <ul className="space-y-1.5 text-sm">{keys.map(key => <li key={key} data-changed-field={key}><span className="font-bold">{FIELD_LABEL(tr, key)}</span>: <s className="text-ink-muted"><bdi>{key === "logoUrl" ? show(key, baseline[key]) : show(key, baseline[key])}</bdi></s> → <bdi className="font-semibold">{show(key, form[key])}</bdi></li>)}</ul> : <p className="text-sm text-ink-muted">{tr("Nothing has changed yet.")}</p>}
    <p className="text-2xs text-ink-muted">{tr("Only these fields are saved. Documents already issued keep the details they were issued with.")}</p>
  </section>;
}

function HistoryDialog({ level, campusId, title, onClose }: { level: "school" | "campus"; campusId?: string; title: string; onClose: () => void }) {
  const tr = useUiText();
  // R7: when a change happened, in the school's language, calendar, numbering system and timezone.
  const { dateTime } = useLocaleFormat();
  const [rows, setRows] = useState<InstitutionHistoryEntry[] | null>(null), [error, setError] = useState("");
  useEffect(() => { let cancelled = false; getInstitutionHistory({ level, campusId }).then(data => { if (!cancelled) setRows(data); }).catch(failure => { if (!cancelled) setError(tr(failure instanceof Error ? failure.message : "History could not be loaded.")); }); return () => { cancelled = true; }; }, [level, campusId, tr]);
  const kind = (entry: InstitutionHistoryEntry) => entry.kind === "ARCHIVED" ? tr("Archived") : entry.kind === "RESTORED" ? tr("Restored") : tr("Details changed");
  return <Modal title={tr("Change history")} eyebrow={title} icon={Clock} size="lg" onClose={onClose}>
    {error ? <Alert tone="danger" compact>{error}</Alert> : !rows ? <SkeletonList rows={3} label={tr("Loading history…")} /> : !rows.length ? <p className="text-sm text-ink-muted">{tr("No changes have been recorded yet.")}</p>
      : <ol className="space-y-2" data-institution-history>{rows.map(entry => <li key={entry.id} className="rounded-xl bg-brand-50/60 px-3 py-2 text-sm" data-history-kind={entry.kind}>
        <p className="font-bold">{kind(entry)} · <bdi>{dateTime(entry.at)}</bdi>{entry.actor ? <> · <bdi>{entry.actor}</bdi></> : null}</p>
        {Object.entries(entry.fields).map(([key, change]) => <p key={key} className="text-xs">{FIELD_LABEL(tr, key)}: <s className="text-ink-muted"><bdi>{String(change.from ?? "") || tr("(empty)")}</bdi></s> → <bdi>{String(change.to ?? "") || tr("(empty)")}</bdi></p>)}
        {entry.reason ? <p className="text-xs">{tr("Reason")}: <bdi>{entry.reason}</bdi></p> : null}
      </li>)}</ol>}
  </Modal>;
}

/**
 * The institution record, cut to the screen it sits on (M17, M33):
 *  - "all"               school card + campus list + archived campuses (default; older screens)
 *  - "school"            the school identity card only (group admin Settings › Profile)
 *  - "campus"            one campus card — `campusId`, else the first campus this user may edit
 *                        (campus admin Campus setup › Profile; the group admin's campus detail)
 *  - "school-and-campus" one merged card for a single school: the school and its campus are one entity to its
 *                        admin (School settings › Profile)
 *  - "campuses"          the campus list and archived campuses, no school card
 *  - "archived"          only the archived campuses, each with Restore (the group admin's Campuses view);
 *                        renders nothing when there are none
 * `readOnly` hides the card's own Edit/Archive/History buttons when the screen's PageHeader owns them; the
 * screen then opens the dialogs by bumping `requestEdit` / `requestArchive` (counters, 0 = none).
 *
 * Shared settings-save contract (the console's per-tab Save, §4.4): a new `command` `{ id: "save" | "edit" }` opens
 * the reviewed editor for the record this card shows (the school, or the one campus) — the record is saved from that
 * dialog after its before/after review, so there is no form-level Save on the card and `hideSave` changes nothing
 * here. `onDirtyChange(dirty, saving)` reports the open editor's unsaved changes and save state.
 */
export type InstitutionSection = "all" | "school" | "campus" | "school-and-campus" | "campuses" | "archived";

export function InstitutionSettingsPanel({
  /** "editable" hides campuses this user cannot touch — used on the campus console. */
  scope = "all",
  section = "all",
  campusId,
  readOnly = false,
  requestEdit = 0,
  requestArchive = 0,
  onSaved,
  command,
  onDirtyChange,
}: {
  scope?: "all" | "editable";
  section?: InstitutionSection;
  campusId?: string;
  readOnly?: boolean;
  requestEdit?: number;
  requestArchive?: number;
  onSaved?: () => void;
  /** Accepted for the shared settings-save contract; the editor dialog keeps its own reviewed Save. */
  hideSave?: boolean;
  command?: { id: string; nonce: number } | null;
  onDirtyChange?: (dirty: boolean, saving: boolean) => void;
}) {
  const tr = useUiText();
  const locale = useLocale();
  const [data, setData] = useState<InstitutionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editingSchool, setEditingSchool] = useState(false);
  const [editingCampus, setEditingCampus] = useState<CampusForm | null>(null);
  const [archiving, setArchiving] = useState<CampusForm | null>(null);
  const [history, setHistory] = useState<{ level: "school" | "campus"; campusId?: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setData(await getInstitutionSettings());
    } catch {
      // R4: a load failure is an inline ErrorState with retry, never a toast.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const afterSave = useCallback(async () => {
    await load();
    onSaved?.();
  }, [load, onSaved]);

  const campuses = useMemo(() => {
    if (!data) return [];
    return scope === "editable"
      ? data.campuses.filter((c) => data.editableCampusIds.includes(c.id))
      : data.campuses.filter((c) => !c.archivedAt);
  }, [data, scope]);

  /** The one campus a "campus" / "school-and-campus" card shows. */
  const focusCampus = useMemo(() => {
    if (!data) return null;
    if (campusId) return data.campuses.find((c) => c.id === campusId) ?? null;
    return data.campuses.find((c) => !c.archivedAt && data.editableCampusIds.includes(c.id)) ?? data.campuses.find((c) => !c.archivedAt) ?? null;
  }, [data, campusId]);

  // The screen's PageHeader asked for the edit / archive dialog.
  const openEditor = () => {
    if (!data) return;
    if (section === "school") { if (data.canEditSchool) setEditingSchool(true); return; }
    // A single school's merged card edits the school record first; its campus row keeps its own Edit.
    if (section === "school-and-campus" && data.canEditSchool) { setEditingSchool(true); return; }
    if (focusCampus && data.editableCampusIds.includes(focusCampus.id)) setEditingCampus(focusCampus);
  };
  useEffect(() => {
    if (!requestEdit || !data) return;
    openEditor();
    // Only a new request opens the dialog; data refreshes must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestEdit, data]);
  usePanelCommand(command, { save: openEditor, edit: openEditor }, Boolean(data));
  useEffect(() => {
    if (!requestArchive || !data || !focusCampus || !data.canArchiveCampuses) return;
    setArchiving(focusCampus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestArchive, data, focusCampus]);

  if (section === "archived") {
    // A secondary list under the campus grid: nothing while loading, nothing when empty.
    if (loading) return null;
    if (loadFailed || !data) return <Alert tone="warning" compact live="off" actions={<Button variant="outline" size="sm" type="button" onClick={() => { setLoading(true); void load(); }}>{tr("Try again")}</Button>}>{tr("Archived campuses did not load.")}</Alert>;
    const archived = data.campuses.filter((c) => c.archivedAt);
    if (!data.canArchiveCampuses || !archived.length) return null;
    return <section className="sk-panel p-5 sm:p-6 [&>[data-archived-campuses]]:mt-0" data-archived-section><ArchivedCampusList campuses={archived} onDone={afterSave} /></section>;
  }
  if (loading) return <SkeletonCards count={section === "all" || section === "campuses" ? 3 : 1} label={tr("Loading institution settings")} />;
  if (loadFailed || !data) {
    return <div className="sk-panel"><ErrorState title={tr("Institution settings did not load")} description={tr("Could not load institution settings.")} onRetry={() => { setLoading(true); void load(); }} /></div>;
  }

  const showSchool = section === "all" || section === "school" || section === "school-and-campus";
  const showCampusList = section === "all" || section === "campuses";
  const showOneCampus = section === "campus" || section === "school-and-campus";

  const campusRow = (campus: CampusForm) => {
    const editable = data.editableCampusIds.includes(campus.id);
    return (
      <div key={campus.id} className="rounded-[24px] border border-edge/20 bg-brand-50/40 p-4 transition-colors hover:bg-brand-50/70" data-campus-record={campus.id}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm">
              <Building2 aria-hidden="true" className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink-strong"><bdi>{campus.name}</bdi></p>
              <p className="mt-0.5 truncate text-2xs font-bold text-ink-subtle">
                <bdi>{campus.city}</bdi> · <bdi dir="ltr">{campus.regId}</bdi>
                {campus.board ? <> · <bdi>{campus.board}</bdi></> : null}
              </p>
              {campus.principalName || campus.phone || campus.email ? (
                <p className="mt-0.5 truncate text-2xs font-semibold text-ink-muted">
                  <bdi>{[campus.principalName, campus.phone, campus.email].filter(Boolean).join(" · ")}</bdi>
                </p>
              ) : null}
            </div>
          </div>
          {readOnly ? null : (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {editable || data.canArchiveCampuses ? <Button variant="ghost" type="button" onClick={() => setHistory({ level: "campus", campusId: campus.id, title: campus.name })} aria-label={tr("Change history for {0}", [campus.name])}><Clock aria-hidden="true" className="h-3 w-3" /></Button> : null}
              {data.canArchiveCampuses && section !== "school-and-campus" ? <CampusArchiveButton campus={campus} onDone={afterSave} /> : null}
              {editable ? (
                <Button variant="default" type="button" onClick={() => setEditingCampus(campus)} className="flex shrink-0 items-center gap-1.5 px-3">
                  <Pencil aria-hidden="true" className="h-3 w-3" /><UiText>{"Edit"}</UiText></Button>
              ) : (
                <span className="flex h-9 shrink-0 items-center gap-1.5 px-2 text-2xs font-semibold text-ink-subtle">
                  <Lock aria-hidden="true" className="h-3 w-3" /><UiText>{"View only"}</UiText></span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── School identity ── */}
      {showSchool ? (
      <section className="sk-panel p-6 sm:p-7" data-school-record>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 text-primary">
              {(() => {
                const logoSrc = resolveMediaUrl(data.school.logoUrl);
                return logoSrc ? (
                  <Image src={logoSrc} alt="" width={56} height={56} className="h-full w-full object-cover" unoptimized />
                ) : (
                  <Building aria-hidden="true" className="h-6 w-6" />
                );
              })()}
            </div>
            <div className="min-w-0">
              <p className="text-2xs font-semibold text-primary"><UiText>{"Institution"}</UiText></p>
              <h3 className="mt-0.5 truncate text-xl font-bold tracking-tight text-ink-strong"><bdi>{data.school.name}</bdi></h3>
              {data.school.tagline ? (
                <p className="mt-0.5 truncate text-xs font-semibold italic text-ink-muted"><bdi>“{data.school.tagline}”</bdi></p>
              ) : null}
            </div>
          </div>
          {readOnly ? null : (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="ghost" type="button" onClick={() => setHistory({ level: "school", title: data.school.name })} data-history-school><Clock aria-hidden="true" className="h-3.5 w-3.5" /><UiText>{"Change history"}</UiText></Button>
              {data.canEditSchool ? (
                <Button variant="default" type="button" onClick={() => setEditingSchool(true)} className="flex shrink-0 items-center gap-2 px-4">
                  <Pencil aria-hidden="true" className="h-3.5 w-3.5" /><UiText>{"Edit"}</UiText></Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReadRow icon={Hash} label={tr("School ID")} value={data.school.regId} locked reason={tr("This ID is used in links and records, so it can't be edited. Contact support to change it.")} />
          <ReadRow icon={Mail} label={tr("Contact Email")} value={data.school.contactEmail} locked />
          <ReadRow icon={MapPin} label={tr("City")} value={data.school.city} />
          <ReadRow icon={Phone} label={tr("Phone")} value={data.school.phone} />
          <ReadRow icon={Globe} label={tr("Website")} value={data.school.website} />
          <ReadRow icon={CalendarDays} label={tr("Established")} value={data.school.establishedYear} />
          <ReadRow icon={Clock} label={tr("Time Zone")} value={data.school.timezone} />
          <ReadRow icon={MapPin} label={tr("Address")} value={data.school.address} />
        </div>

        {!data.canEditSchool && section !== "school-and-campus" ? (
          <p className="mt-5 flex items-start gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-2xs font-bold leading-snug text-ink-muted">
            <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><UiText>{"School details are managed by the institution owner. You can edit the campus you administer below."}</UiText></p>
        ) : null}

        {/* A single school and its campus are one entity to its admin: the campus sits inside the school card. */}
        {section === "school-and-campus" && focusCampus ? (
          <div className="mt-6 border-t border-border-subtle pt-5">
            <p className="mb-3 text-2xs font-semibold text-primary"><UiText>{"Campus"}</UiText></p>
            {campusRow(focusCampus)}
          </div>
        ) : null}
      </section>
      ) : null}

      {/* ── One campus ── */}
      {section === "campus" ? (
        <section className="sk-panel p-6 sm:p-7" data-campus-card>
          <p className="mb-4 text-2xs font-semibold text-primary"><UiText>{"Campus"}</UiText></p>
          {focusCampus ? campusRow(focusCampus) : <p className="py-6 text-center text-xs font-bold text-ink-subtle"><UiText>{"No campuses to show."}</UiText></p>}
        </section>
      ) : null}

      {/* ── Campuses ── */}
      {showCampusList ? (
      <section className="sk-panel p-6 sm:p-7">
        <div className="mb-5">
          <p className="text-2xs font-semibold text-primary"><UiText>{"Campuses"}</UiText></p>
          <h3 className="mt-0.5 text-xl font-bold tracking-tight text-ink-strong">
            {tr(campuses.length === 1 ? "{0} campus" : "{0} campuses", [new Intl.NumberFormat(localeTag(locale)).format(campuses.length)])}
          </h3>
        </div>

        <div className="space-y-3">
          {campuses.map(campusRow)}
          {campuses.length === 0 ? (
            <p className="py-8 text-center text-xs font-bold text-ink-subtle"><UiText>{"No campuses to show."}</UiText></p>
          ) : null}
        </div>
        {scope === "all" && data.canArchiveCampuses ? <ArchivedCampusList campuses={data.campuses.filter((c) => c.archivedAt)} onDone={afterSave} /> : null}
      </section>
      ) : null}

      {editingSchool ? (
        <SchoolDialog school={data.school} standalone={section === "school-and-campus"} onClose={() => setEditingSchool(false)} onSaved={afterSave} onDirtyChange={onDirtyChange} />
      ) : null}
      {editingCampus ? (
        <CampusDialog campus={editingCampus} country={data.school.country} onClose={() => setEditingCampus(null)} onSaved={afterSave} onDirtyChange={onDirtyChange} />
      ) : null}
      {archiving ? (
        <CampusArchiveDialog campus={archiving} open onClose={() => setArchiving(null)} onDone={afterSave} />
      ) : null}
      {history ? <HistoryDialog {...history} onClose={() => setHistory(null)} /> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

/** Reports an editor's unsaved changes and save state to the console (and "nothing pending" once it closes). */
function useReportDirty(dirty: boolean, saving: boolean, report?: (dirty: boolean, saving: boolean) => void) {
  const latest = useRef(report);
  useEffect(() => { latest.current = report; });
  useEffect(() => { latest.current?.(dirty, saving); }, [dirty, saving]);
  useEffect(() => () => latest.current?.(false, false), []);
}

function SchoolDialog({
  school, standalone = false, onClose, onSaved, onDirtyChange,
}: { school: SchoolForm; standalone?: boolean; onClose: () => void; onSaved: () => Promise<void>; onDirtyChange?: (dirty: boolean, saving: boolean) => void }) {
  const tr = useUiText();
  const [form, setForm] = useState<SchoolForm>(school);
  const draft = useFormDraft({ record: "settings:school", schema: 1, values: form, baseline: school,
    fields: ["name", "tagline", "city", "address", "phone", "website", "establishedYear", "timezone"], apply: setForm, current: async () => {
      const latest = await getInstitutionSettings();
      if (!latest.canEditSchool) throw new Error("Access revoked");
      return latest.school;
    } });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof SchoolForm>(key: K, value: SchoolForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const dirty = useMemo(
    () => (Object.keys(school) as (keyof SchoolForm)[]).some((k) => form[k] !== school[k]),
    [form, school],
  );
  useReportDirty(dirty, saving, onDirtyChange);

  // Anything already stored has to stay selectable, or saving an unlisted zone
  // would quietly move the school to a different one.
  const zones = useMemo(() => {
    const known = TIMEZONES.some((t) => t.value === school.timezone);
    return known ? TIMEZONES : [{ value: school.timezone, label: school.timezone }, ...TIMEZONES];
  }, [school.timezone]);

  const blockedReason =
    !form.name.trim() ? "Enter the school name."
    : !form.city.trim() ? "Enter the city."
    : null;

  const [reviewing, setReviewing] = useState(false);
  const changes = changedFields(school as unknown as Record<string, unknown>, form as unknown as Record<string, unknown>, ["name", "tagline", "city", "address", "phone", "website", "logoUrl", "establishedYear"]);
  const save = async () => {
    if (!changes.length) { toast.info(tr("Nothing changed.")); onClose(); return; }
    setSaving(true);
    try {
      const payload = Object.fromEntries(changes.map(key => [key, (form as unknown as Record<string, unknown>)[key] ?? ""]));
      await updateSchoolDetails({ expectedRevision: form.revision, ...payload });
      toast.success(tr("School details updated. Current screens now use the new information."));
      draft.markSaved();
      await onSaved();
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message.includes("changed")) { try { await draft.reviewCurrent(); } catch { /* Keep the local draft while the server is unavailable. */ } }
      toast.error(tr(error instanceof Error ? error.message : "Could not save school details."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={tr("Edit school details")}
      eyebrow={tr("Institution")}
      subtitle={standalone ? tr("You are editing your school: {0}.", [school.name]) : tr("You are editing the whole school group: {0}.", [school.name])}
      icon={Building}
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel={tr("Saving")}
          actionLabel={reviewing ? tr("Save changes") : tr("Review changes")}
          onCancel={onClose}
          onAction={reviewing ? save : () => setReviewing(true)}
          blockedReason={blockedReason ? tr(blockedReason) : null}
          secondary={reviewing ? <Button variant="ghost" type="button" onClick={() => setReviewing(false)}>{tr("Back to editing")}</Button> : undefined}
        />
      }
    >
      <DraftRecovery recordLabel={form.name} draft={draft} saving={saving} excluded={tr("Logo files are not stored in device drafts.")} />
      {reviewing ? <ChangeSummary keys={changes as string[]} baseline={school as unknown as Record<string, unknown>} form={form as unknown as Record<string, unknown>} /> : null}
      {blockedReason && <FormErrorSummary errors={{ settings: blockedReason }} onFocusField={() => document.querySelector<HTMLInputElement>("[role=dialog] input:not([type=file])")?.focus()} />}
      <div className="space-y-5">
        <LogoPicker
          value={form.logoUrl}
          inputRef={fileRef}
          onChange={(v) => set("logoUrl", v)}
          hint={tr("Shown on report cards, emails and receipts.")}
          kind="school-logo"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="s-name" label={tr("School Name")} required icon={GraduationCap} value={form.name} placeholder={tr("e.g. Horizon Academy")} onChange={(v) => set("name", v)} />
          <Field id="s-tagline" label={tr("Tagline / Motto")} icon={Tag} value={form.tagline} placeholder={tr("Optional")} onChange={(v) => set("tagline", v)} />
          <Field id="s-city" label={tr("City")} required icon={MapPin} value={form.city} placeholder={tr("e.g. Lahore")} onChange={(v) => set("city", v)} />
          <Field id="s-phone" label={tr("Phone")} icon={Phone} value={form.phone} placeholder="+92 300 0000000" onChange={(v) => set("phone", v)} />
          <Field id="s-website" label={tr("Website")} icon={Globe} value={form.website} placeholder={tr("www.school.edu.pk")} onChange={(v) => set("website", v)} />
          <Field id="s-year" label={tr("Established")} icon={CalendarDays} value={form.establishedYear} placeholder="e.g. 1998" onChange={(v) => set("establishedYear", v.replace(/[^\d]/g, "").slice(0, 4))} />
        </div>

        <Field id="s-address" label={tr("Address")} icon={MapPin} value={form.address} placeholder={tr("Street address")} onChange={(v) => set("address", v)} />

        <div className="space-y-1.5">
          <Label htmlFor="s-tz" className="sk-field-label"><UiText>{"Original Time Zone"}</UiText></Label>
          <InputGroup surfaceClassName="bg-brand-50" className="min-w-0">
            <Clock data-field-affix="start" className="pointer-events-none absolute start-3.5 h-4 w-4 text-ink-subtle" />
            <SystemSelect
              id="s-tz"
              disabled
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="w-full ps-10 pe-4"
            >
              {zones.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SystemSelect>
          </InputGroup>
          {form.timezone !== school.timezone ? (
            <p className="px-1 text-2xs font-bold leading-snug text-status-warning-text"><UiText>{"Changing the time zone moves the boundary of \"today\", so attendance marks and fee cutoffs near midnight may fall on a different date from now on. Existing records are not rewritten."}</UiText></p>
          ) : (
            <p className="px-1 text-2xs font-bold text-ink-subtle"><UiText>{"Manage the effective timezone in Language and regional settings."}</UiText></p>
          )}
        </div>

        <LockedRows
          rows={[
            { icon: Hash, label: tr("School ID"), value: school.regId },
            { icon: Mail, label: tr("Contact Email"), value: school.contactEmail },
          ]}
          note="The school ID prints on report cards, invoices and receipts, and the contact email identifies the owner account. Neither can be changed here."
        />
      </div>
    </Modal>
  );
}

function CampusDialog({
  campus, country, onClose, onSaved, onDirtyChange,
}: { campus: CampusForm; country: string; onClose: () => void; onSaved: () => Promise<void>; onDirtyChange?: (dirty: boolean, saving: boolean) => void }) {
  const tr = useUiText();
  const [form, setForm] = useState<CampusForm>(campus);
  const draft = useFormDraft({ record: `settings:campus:${campus.id}`, schema: 1, values: form, baseline: campus,
    fields: ["name", "city", "address", "phone", "email", "website", "principalName", "board"], apply: setForm, current: async () => {
      const latest = await getInstitutionSettings();
      const row = latest.campuses.find(c => c.id === campus.id);
      if (!row || !latest.editableCampusIds.includes(campus.id)) throw new Error("Access revoked");
      return row;
    } });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof CampusForm>(key: K, value: CampusForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const dirty = useMemo(
    () => (Object.keys(campus) as (keyof CampusForm)[]).some((k) => form[k] !== campus[k]),
    [form, campus],
  );
  useReportDirty(dirty, saving, onDirtyChange);

  const blockedReason =
    !form.name.trim() ? "Enter the campus name."
    : !form.city.trim() ? "Enter the city."
    : form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? "Enter a valid email address."
    : form.phone && form.phone.trim() && form.phone.replace(/\D/g, '').length < 7 ? "Phone number is too short to be valid."
    : form.phone && form.phone.trim() && form.phone.replace(/\D/g, '').length > 15 ? "Phone number is too long to be valid."
    : null;

  const [reviewing, setReviewing] = useState(false);
  const changes = changedFields(campus as unknown as Record<string, unknown>, form as unknown as Record<string, unknown>, ["name", "city", "address", "phone", "email", "website", "principalName", "board", "logoUrl"]);
  const save = async () => {
    if (!changes.length) { toast.info(tr("Nothing changed.")); onClose(); return; }
    setSaving(true);
    try {
      const payload = Object.fromEntries(changes.map(key => [key, (form as unknown as Record<string, unknown>)[key] ?? ""]));
      await updateCampusDetails({ expectedRevision: form.revision, campusId: campus.id, ...payload });
      toast.success(tr("{0} updated. Current screens now use the new information.", [form.name.trim()]));
      draft.markSaved();
      await onSaved();
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message.includes("changed")) { try { await draft.reviewCurrent(); } catch { /* Keep the local draft while the server is unavailable. */ } }
      toast.error(tr(error instanceof Error ? error.message : "Could not save campus details."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={tr("Edit campus")}
      eyebrow={tr("Campus")}
      subtitle={tr("You are editing {0}, not the whole school group.", [campus.name])}
      icon={Building2}
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel={tr("Saving")}
          actionLabel={reviewing ? tr("Save changes") : tr("Review changes")}
          onCancel={onClose}
          onAction={reviewing ? save : () => setReviewing(true)}
          blockedReason={blockedReason ? tr(blockedReason) : null}
          secondary={reviewing ? <Button variant="ghost" type="button" onClick={() => setReviewing(false)}>{tr("Back to editing")}</Button> : undefined}
        />
      }
    >
      <DraftRecovery recordLabel={form.name} draft={draft} saving={saving} excluded={tr("Logo files are not stored in device drafts.")} />
      {reviewing ? <ChangeSummary keys={changes as string[]} baseline={campus as unknown as Record<string, unknown>} form={form as unknown as Record<string, unknown>} /> : null}
      {blockedReason && <FormErrorSummary errors={{ settings: blockedReason }} onFocusField={() => document.querySelector<HTMLInputElement>("[role=dialog] input:not([type=file])")?.focus()} />}
      <div className="space-y-5">
        <LogoPicker
          value={form.logoUrl}
          inputRef={fileRef}
          onChange={(v) => set("logoUrl", v)}
          hint={tr("Used on this campus's report cards in place of the school logo.")}
          kind="campus-logo"
          campusId={form.id}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="c-name" label={tr("Campus Name")} required icon={Building2} value={form.name} placeholder={tr("e.g. Main Campus")} onChange={(v) => set("name", v)} />
          <Field id="c-city" label={tr("City")} required icon={MapPin} value={form.city} placeholder={tr("e.g. Lahore")} onChange={(v) => set("city", v)} />
          <Field id="c-phone" label={tr("Phone")} icon={Phone} value={form.phone} placeholder="+92 42 0000000" onChange={(v) => set("phone", v)} />
          <Field id="c-email" label={tr("Campus Email")} icon={Mail} value={form.email} placeholder={tr("campus@school.edu.pk")} onChange={(v) => set("email", v)} />
          <Field id="c-website" label={tr("Website")} icon={Globe} value={form.website} placeholder={tr("Optional")} onChange={(v) => set("website", v)} />
          <Field id="c-principal" label={tr("Head of Campus")} icon={UserRound} value={form.principalName} placeholder={tr("Principal / director name")} onChange={(v) => set("principalName", v)} />
        </div>

        <Field id="c-address" label={tr("Address")} icon={MapPin} value={form.address} placeholder={tr("Full street address")} onChange={(v) => set("address", v)} />

        <div className="space-y-1.5">
          <Label htmlFor="c-board" className="sk-field-label"><UiText>{"Board"}</UiText></Label>
          <BoardSelect
            id="c-board"
            country={country}
            value={form.board}
            onChange={(board) => set("board", board)}
            nameLabel={tr("Board name")}
            namePlaceholder={tr("Type your board or curriculum")}
            surfaceClassName="bg-brand-50"
          />
        </div>

        <LockedRows
          rows={[{ icon: Hash, label: tr("Campus ID"), value: campus.regId }]}
          note="The campus ID prints on report cards, invoices and receipts, so it stays fixed once the campus exists."
        />
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────

function LogoPicker({
  value, onChange, inputRef, hint, kind, campusId,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  hint: string;
  kind: "school-logo" | "campus-logo";
  campusId?: string;
}) {
  const tr = useUiText();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const displaySrc = previewUrl || resolveMediaUrl(value);

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(tr("Please choose an image file."));
    if (file.size > 1_500_000) return toast.error(tr("Use a logo image under 1.5 MB."));

    setUploading(true);
    const blobUrl = URL.createObjectURL(file);
    setPreviewUrl(blobUrl);
    try {
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, campusId, fileName: file.name, contentType: file.type, sizeBytes: file.size }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData?.data?.key || !presignData?.data?.uploadUrl) {
        throw new Error(presignData?.error || "Could not prepare upload");
      }
      const { key, uploadUrl } = presignData.data;

      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Upload failed");

      onChange(key);
      toast.success(tr("Logo uploaded"));
    } catch (error) {
      URL.revokeObjectURL(blobUrl);
      setPreviewUrl(null);
      toast.error(tr(error instanceof Error ? error.message : "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-5 rounded-[24px] border-2 border-dashed border-primary/25 p-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-50">
        {displaySrc ? (
          <Image src={displaySrc} alt="" width={64} height={64} className="h-full w-full object-cover" unoptimized />
        ) : (
          <ImageIcon className="h-6 w-6 text-primary/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-semibold text-ink-muted"><UiText>{"Logo"}</UiText></p>
        <p className="mb-2.5 text-2xs font-bold text-ink-subtle">{hint}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default"
            type="button"
            onClick={() => inputRef.current?.click()}
            loading={uploading}
            className="justify-start flex items-center gap-2 px-3.5"
          >
            {uploading ? null : <Upload aria-hidden="true" className="h-3.5 w-3.5" />}
            {uploading ? tr("Uploading") : value ? tr("Replace") : tr("Choose")}
          </Button>
          {value ? (
            <Button variant="outline"
              type="button"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                onChange("");
              }}
              disabled={uploading}
              className="px-3.5"
            >
              <UiText>{"Remove"}</UiText>
            </Button>
          ) : null}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}

function Field({
  id, label, value, placeholder, onChange, icon: Icon, required,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  icon: React.ComponentType<{ className?: string }>;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="sk-field-label">
        {label} {required ? <span aria-hidden="true" className="text-destructive">*</span> : null}
      </Label>
      <InputGroup surfaceClassName="bg-brand-50" className="group relative flex items-center">
        <Icon data-field-affix="start" className="pointer-events-none absolute start-3.5 h-4 w-4 text-ink-subtle transition-all group-focus-within:text-primary" />
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full ps-10 pe-4 placeholder:text-ink-subtle"
        />
      </InputGroup>
    </div>
  );
}

function ReadRow({
  icon: Icon, label, value, locked, reason,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  locked?: boolean;
  /** Why the value cannot be edited here; shown and announced with the field. */
  reason?: string;
}) {
  return (
    <div className="rounded-2xl bg-brand-50/55 px-4 py-3">
      <div className="flex items-center gap-2 text-2xs font-semibold text-ink-muted">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
        {locked ? <Lock className="h-2.5 w-2.5 text-ink-subtle" /> : null}
      </div>
      <p className="mt-1 truncate text-[13px] font-bold text-ink-strong"><bdi dir={locked ? "ltr" : undefined}>{value || "—"}</bdi></p>
      {reason ? <p className="mt-1 text-2xs font-semibold text-ink-muted">{reason}</p> : null}
    </div>
  );
}

function LockedRows({
  rows, note,
}: {
  rows: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[];
  note: string;
}) {
  return (
    <div className="rounded-[24px] border border-edge/25 bg-muted p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center gap-1.5 text-2xs font-semibold text-ink-muted">
              <row.icon className="h-3 w-3" /> {row.label} <Lock className="h-2.5 w-2.5" />
            </div>
            <p className="mt-1 truncate text-[13px] font-bold text-ink-strong">{row.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-edge/25 pt-3 text-2xs font-bold leading-snug text-ink-subtle">
        {note}
      </p>
    </div>
  );
}
