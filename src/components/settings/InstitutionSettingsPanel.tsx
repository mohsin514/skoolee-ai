"use client";

import { Button } from "@/components/ui/button";
import { UiText, useUiText } from "@/components/locale/LocaleProvider";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { FormErrorSummary } from "@/components/ui/form-field";
import { DraftRecovery } from "@/components/ui/draft-recovery";
import { InputGroup } from "@/components/ui/input-group";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Building,
  Building2,
  CalendarDays,
  Clock,
  Globe,
  GraduationCap,
  Hash,
  ImageIcon,
  Loader2,
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
import { EXAM_BOARDS } from "@/config/boards";
import {
  getInstitutionSettings,
  updateCampusDetails,
  updateSchoolDetails,
  type InstitutionSettings,
} from "@/app/actions/settings";
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

export function InstitutionSettingsPanel({
  /** "editable" hides campuses this user cannot touch — used on the campus console. */
  scope = "all",
  onSaved,
}: {
  scope?: "all" | "editable";
  onSaved?: () => void;
}) {
  const tr = useUiText();
  const [data, setData] = useState<InstitutionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSchool, setEditingSchool] = useState(false);
  const [editingCampus, setEditingCampus] = useState<CampusForm | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getInstitutionSettings());
    } catch (error) {
      toast.error(tr(error instanceof Error ? error.message : "Could not load institution settings."));
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
      : data.campuses;
  }, [data, scope]);

  if (loading) {
    return (
      <div className="sk-panel flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* ── School identity ── */}
      <section className="sk-panel p-6 sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
              {data.school.logoUrl ? (
                <Image src={data.school.logoUrl} alt="" width={56} height={56} className="h-full w-full object-cover" />
              ) : (
                <Building className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]"><UiText>{"Institution"}</UiText></p>
              <h3 className="mt-0.5 truncate text-xl font-black tracking-tight text-[#1f1a23]">{data.school.name}</h3>
              {data.school.tagline ? (
                <p className="mt-0.5 truncate text-[12px] font-semibold italic text-ink-muted"><UiText>{"\""}</UiText>{data.school.tagline}<UiText>{"\""}</UiText></p>
              ) : null}
            </div>
          </div>
          {data.canEditSchool ? (
            <Button variant="default"
              type="button"
              onClick={() => setEditingSchool(true)}
              className="justify-start flex shrink-0 items-center gap-2 px-4"
            >
              <Pencil className="h-3.5 w-3.5" /><UiText>{"Edit"}</UiText></Button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReadRow icon={Hash} label={tr("School ID")} value={data.school.regId} locked />
          <ReadRow icon={Mail} label={tr("Contact Email")} value={data.school.contactEmail} locked />
          <ReadRow icon={MapPin} label={tr("City")} value={data.school.city} />
          <ReadRow icon={Phone} label={tr("Phone")} value={data.school.phone} />
          <ReadRow icon={Globe} label={tr("Website")} value={data.school.website} />
          <ReadRow icon={CalendarDays} label={tr("Established")} value={data.school.establishedYear} />
          <ReadRow icon={Clock} label={tr("Time Zone")} value={data.school.timezone} />
          <ReadRow icon={MapPin} label={tr("Address")} value={data.school.address} />
        </div>

        {!data.canEditSchool ? (
          <p className="mt-5 flex items-start gap-2 rounded-2xl bg-[#fbf0fe] px-4 py-3 text-[11px] font-bold leading-snug text-ink-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8127cf]" /><UiText>{"School details are managed by the institution owner. You can edit the campus you administer below."}</UiText></p>
        ) : null}
      </section>

      {/* ── Campuses ── */}
      <section className="sk-panel p-6 sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]"><UiText>{"Campuses"}</UiText></p>
            <h3 className="mt-0.5 text-xl font-black tracking-tight text-[#1f1a23]">
              {campuses.length} {campuses.length === 1 ? tr("campus") : tr("campuses")}
            </h3>
          </div>
        </div>

        <div className="space-y-3">
          {campuses.map((campus) => {
            const editable = data.editableCampusIds.includes(campus.id);
            return (
              <div
                key={campus.id}
                className="rounded-[24px] border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 p-4 transition-all hover:bg-[#fbf0fe]/70"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8127cf] shadow-sm">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#1f1a23]">{campus.name}</p>
                      <p className="mt-0.5 truncate text-[11px] font-bold text-ink-subtle">
                        {campus.city} · {campus.regId}
                        {campus.board ? ` · ${campus.board}` : ""}
                      </p>
                      {campus.principalName || campus.phone || campus.email ? (
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-ink-muted">
                          {[campus.principalName, campus.phone, campus.email].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {editable ? (
                    <Button variant="default"
                      type="button"
                      onClick={() => setEditingCampus(campus)}
                      className="justify-start flex shrink-0 items-center gap-1.5 px-3"
                    >
                      <Pencil className="h-3 w-3" /><UiText>{"Edit"}</UiText></Button>
                  ) : (
                    <span className="flex h-9 shrink-0 items-center gap-1.5 px-2 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
                      <Lock className="h-3 w-3" /><UiText>{"View only"}</UiText></span>
                  )}
                </div>
              </div>
            );
          })}
          {campuses.length === 0 ? (
            <p className="py-8 text-center text-[12px] font-bold text-ink-subtle"><UiText>{"No campuses to show."}</UiText></p>
          ) : null}
        </div>
      </section>

      {editingSchool ? (
        <SchoolDialog school={data.school} onClose={() => setEditingSchool(false)} onSaved={afterSave} />
      ) : null}
      {editingCampus ? (
        <CampusDialog campus={editingCampus} onClose={() => setEditingCampus(null)} onSaved={afterSave} />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

function SchoolDialog({
  school, onClose, onSaved,
}: { school: SchoolForm; onClose: () => void; onSaved: () => Promise<void> }) {
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

  const save = async () => {
    setSaving(true);
    try {
      await updateSchoolDetails({
        expectedRevision: form.revision,
        name: form.name,
        tagline: form.tagline,
        city: form.city,
        address: form.address,
        phone: form.phone,
        website: form.website,
        logoUrl: form.logoUrl,
        establishedYear: form.establishedYear,
        timezone: form.timezone,
      });
      toast.success(tr("School details updated."));
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
      subtitle={tr("Name, branding and contact details for the whole institution.")}
      icon={Building}
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel="Saving"
          actionLabel="Save changes"
          onCancel={onClose}
          onAction={save}
          blockedReason={blockedReason}
        />
      }
    >
      <DraftRecovery draft={draft} saving={saving} excluded="Logo files are not stored in device drafts." />
      {blockedReason && <FormErrorSummary errors={{ settings: blockedReason }} onFocusField={() => document.querySelector<HTMLInputElement>("[role=dialog] input:not([type=file])")?.focus()} />}
      <div className="space-y-5">
        <LogoPicker
          value={form.logoUrl}
          inputRef={fileRef}
          onChange={(v) => set("logoUrl", v)}
          hint="Shown on report cards, emails and receipts."
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
          <InputGroup surfaceClassName="bg-[#fbf0fe]" className="min-w-0">
            <Clock data-field-affix="start" className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle" />
            <SystemSelect
              id="s-tz"
              disabled
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="w-full pl-10 pr-4"
            >
              {zones.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SystemSelect>
          </InputGroup>
          {form.timezone !== school.timezone ? (
            <p className="px-1 text-[11px] font-bold leading-snug text-amber-700"><UiText>{"Changing the time zone moves the boundary of \"today\", so attendance marks and fee cutoffs near midnight may fall on a different date from now on. Existing records are not rewritten."}</UiText></p>
          ) : (
            <p className="px-1 text-[10px] font-bold text-ink-subtle"><UiText>{"Manage the effective timezone in Language and regional settings."}</UiText></p>
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
  campus, onClose, onSaved,
}: { campus: CampusForm; onClose: () => void; onSaved: () => Promise<void> }) {
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

  const blockedReason =
    !form.name.trim() ? "Enter the campus name."
    : !form.city.trim() ? "Enter the city."
    : form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? "Enter a valid email address."
    : form.phone && form.phone.trim() && form.phone.replace(/\D/g, '').length < 7 ? "Phone number is too short to be valid."
    : form.phone && form.phone.trim() && form.phone.replace(/\D/g, '').length > 15 ? "Phone number is too long to be valid."
    : null;

  const save = async () => {
    setSaving(true);
    try {
      await updateCampusDetails({
        expectedRevision: form.revision,
        campusId: campus.id,
        name: form.name,
        city: form.city,
        address: form.address,
        phone: form.phone,
        email: form.email,
        website: form.website,
        principalName: form.principalName,
        board: form.board,
        logoUrl: form.logoUrl,
      });
      toast.success(tr("{0} updated.", [form.name.trim()]));
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
      subtitle={tr("Details for {0}.", [campus.name])}
      icon={Building2}
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel="Saving"
          actionLabel="Save changes"
          onCancel={onClose}
          onAction={save}
          blockedReason={blockedReason}
        />
      }
    >
      <DraftRecovery draft={draft} saving={saving} excluded="Logo files are not stored in device drafts." />
      {blockedReason && <FormErrorSummary errors={{ settings: blockedReason }} onFocusField={() => document.querySelector<HTMLInputElement>("[role=dialog] input:not([type=file])")?.focus()} />}
      <div className="space-y-5">
        <LogoPicker
          value={form.logoUrl}
          inputRef={fileRef}
          onChange={(v) => set("logoUrl", v)}
          hint="Used on this campus's report cards in place of the school logo."
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
          <InputGroup surfaceClassName="bg-[#fbf0fe]" className="min-w-0">
            <GraduationCap data-field-affix="start" className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle" />
            <SystemSelect
              id="c-board"
              value={form.board}
              onChange={(e) => set("board", e.target.value)}
              className="w-full pl-10 pr-4"
            >
              {EXAM_BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </SystemSelect>
          </InputGroup>
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
  value, onChange, inputRef, hint,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  hint: string;
}) {
  const tr = useUiText();
  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(tr("Please choose an image file."));
    if (file.size > 1_500_000) return toast.error(tr("Use a logo image under 1.5 MB."));
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") onChange(reader.result); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-5 rounded-[24px] border-2 border-dashed border-[#8127cf]/25 p-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#fbf0fe]">
        {value ? (
          <Image src={value} alt="" width={64} height={64} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-6 w-6 text-[#8127cf]/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted"><UiText>{"Logo"}</UiText></p>
        <p className="mb-2.5 text-[10px] font-bold text-ink-subtle">{hint}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default"
            type="button"
            onClick={() => inputRef.current?.click()}
            className="justify-start flex items-center gap-2 px-3.5"
          >
            <Upload className="h-3.5 w-3.5" /> {value ? tr("Replace") : tr("Choose")}
          </Button>
          {value ? (
            <Button variant="outline"
              type="button"
              onClick={() => onChange("")}
              className="px-3.5"
            ><UiText>{"Remove"}</UiText></Button>
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
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </Label>
      <InputGroup surfaceClassName="bg-[#fbf0fe]" className="group relative flex items-center">
        <Icon data-field-affix="start" className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle transition-all group-focus-within:text-[#8127cf]" />
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-4 placeholder:text-ink-subtle"
        />
      </InputGroup>
    </div>
  );
}

function ReadRow({
  icon: Icon, label, value, locked,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  locked?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/55 px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-ink-muted">
        <Icon className="h-3.5 w-3.5 text-[#8127cf]" />
        {label}
        {locked ? <Lock className="h-2.5 w-2.5 text-ink-subtle" /> : null}
      </div>
      <p className="mt-1 truncate text-[13px] font-bold text-[#1f1a23]">{value || "—"}</p>
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
    <div className="rounded-[24px] border border-[#cfc2d6]/25 bg-[#f3f4f9] p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-ink-muted">
              <row.icon className="h-3 w-3" /> {row.label} <Lock className="h-2.5 w-2.5" />
            </div>
            <p className="mt-1 truncate text-[13px] font-black text-[#1f1a23]">{row.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-[#cfc2d6]/25 pt-3 text-[10px] font-bold leading-snug text-ink-subtle">
        {note}
      </p>
    </div>
  );
}
