"use client";

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
import { resolveMediaUrl } from "@/lib/storage/s3";

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
  const [data, setData] = useState<InstitutionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSchool, setEditingSchool] = useState(false);
  const [editingCampus, setEditingCampus] = useState<CampusForm | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getInstitutionSettings());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load institution settings.");
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
      <div className="flex items-center justify-center rounded-[34px] border border-[#cfc2d6]/20 bg-white p-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* ── School identity ── */}
      <section className="rounded-[34px] border border-[#cfc2d6]/20 bg-white p-6 shadow-lg sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
              {(() => {
                const logoSrc = resolveMediaUrl(data.school.logoUrl);
                return logoSrc ? (
                  <Image src={logoSrc} alt="" width={56} height={56} className="h-full w-full object-cover" unoptimized />
                ) : (
                  <Building className="h-6 w-6" />
                );
              })()}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">Institution</p>
              <h3 className="mt-0.5 truncate text-xl font-black tracking-tight text-[#1f1a23]">{data.school.name}</h3>
              {data.school.tagline ? (
                <p className="mt-0.5 truncate text-[12px] font-semibold italic text-ink-muted">
                  &ldquo;{data.school.tagline}&rdquo;
                </p>
              ) : null}
            </div>
          </div>
          {data.canEditSchool ? (
            <button
              type="button"
              onClick={() => setEditingSchool(true)}
              className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-2xl bg-[#fbf0fe] px-4 text-[11px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReadRow icon={Hash} label="School ID" value={data.school.regId} locked />
          <ReadRow icon={Mail} label="Contact Email" value={data.school.contactEmail} locked />
          <ReadRow icon={MapPin} label="City" value={data.school.city} />
          <ReadRow icon={Phone} label="Phone" value={data.school.phone} />
          <ReadRow icon={Globe} label="Website" value={data.school.website} />
          <ReadRow icon={CalendarDays} label="Established" value={data.school.establishedYear} />
          <ReadRow icon={Clock} label="Time Zone" value={data.school.timezone} />
          <ReadRow icon={MapPin} label="Address" value={data.school.address} />
        </div>

        {!data.canEditSchool ? (
          <p className="mt-5 flex items-start gap-2 rounded-2xl bg-[#fbf0fe] px-4 py-3 text-[11px] font-bold leading-snug text-ink-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8127cf]" />
            School details are managed by the institution owner. You can edit the campus you administer below.
          </p>
        ) : null}
      </section>

      {/* ── Campuses ── */}
      <section className="rounded-[34px] border border-[#cfc2d6]/20 bg-white p-6 shadow-lg sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">Campuses</p>
            <h3 className="mt-0.5 text-xl font-black tracking-tight text-[#1f1a23]">
              {campuses.length} {campuses.length === 1 ? "campus" : "campuses"}
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
                    <button
                      type="button"
                      onClick={() => setEditingCampus(campus)}
                      className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 text-[10px] font-black uppercase tracking-wider text-[#8127cf] shadow-sm transition-all hover:bg-[#8127cf] hover:text-white"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  ) : (
                    <span className="flex h-9 shrink-0 items-center gap-1.5 px-2 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
                      <Lock className="h-3 w-3" /> View only
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {campuses.length === 0 ? (
            <p className="py-8 text-center text-[12px] font-bold text-ink-subtle">No campuses to show.</p>
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
  const [form, setForm] = useState<SchoolForm>(school);
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
      toast.success("School details updated.");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save school details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit school details"
      eyebrow="Institution"
      subtitle="Name, branding and contact details for the whole institution."
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
      <div className="space-y-5">
        <LogoPicker
          value={form.logoUrl}
          inputRef={fileRef}
          onChange={(v) => set("logoUrl", v)}
          hint="Shown on report cards, emails and receipts."
          kind="school-logo"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="s-name" label="School Name" required icon={GraduationCap} value={form.name} placeholder="e.g. Horizon Academy" onChange={(v) => set("name", v)} />
          <Field id="s-tagline" label="Tagline / Motto" icon={Tag} value={form.tagline} placeholder="Optional" onChange={(v) => set("tagline", v)} />
          <Field id="s-city" label="City" required icon={MapPin} value={form.city} placeholder="e.g. Lahore" onChange={(v) => set("city", v)} />
          <Field id="s-phone" label="Phone" icon={Phone} value={form.phone} placeholder="+92 300 0000000" onChange={(v) => set("phone", v)} />
          <Field id="s-website" label="Website" icon={Globe} value={form.website} placeholder="www.school.edu.pk" onChange={(v) => set("website", v)} />
          <Field id="s-year" label="Established" icon={CalendarDays} value={form.establishedYear} placeholder="e.g. 1998" onChange={(v) => set("establishedYear", v.replace(/[^\d]/g, "").slice(0, 4))} />
        </div>

        <Field id="s-address" label="Address" icon={MapPin} value={form.address} placeholder="Street address" onChange={(v) => set("address", v)} />

        <div className="space-y-1.5">
          <Label htmlFor="s-tz" className="ml-1 text-[10px] font-black uppercase tracking-wider text-ink">Time Zone</Label>
          <div className="group relative flex items-center">
            <Clock className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle" />
            <select
              id="s-tz"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="h-12 w-full cursor-pointer rounded-2xl border-0 bg-[#fbf0fe] pl-10 pr-4 text-sm font-bold text-[#1f1a23] outline-none transition-all focus:bg-white focus:ring-2 focus:ring-[#8127cf]/25"
            >
              {zones.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {form.timezone !== school.timezone ? (
            <p className="px-1 text-[11px] font-bold leading-snug text-amber-700">
              Changing the time zone moves the boundary of &ldquo;today&rdquo;, so attendance marks and fee
              cutoffs near midnight may fall on a different date from now on. Existing records are not rewritten.
            </p>
          ) : (
            <p className="px-1 text-[10px] font-bold text-ink-subtle">
              Decides which calendar day an attendance mark or fee cutoff falls on.
            </p>
          )}
        </div>

        <LockedRows
          rows={[
            { icon: Hash, label: "School ID", value: school.regId },
            { icon: Mail, label: "Contact Email", value: school.contactEmail },
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
  const [form, setForm] = useState<CampusForm>(campus);
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
    : null;

  const save = async () => {
    setSaving(true);
    try {
      await updateCampusDetails({
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
      toast.success(`${form.name.trim()} updated.`);
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save campus details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit campus"
      eyebrow="Campus"
      subtitle={`Details for ${campus.name}.`}
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
      <div className="space-y-5">
        <LogoPicker
          value={form.logoUrl}
          inputRef={fileRef}
          onChange={(v) => set("logoUrl", v)}
          hint="Used on this campus's report cards in place of the school logo."
          kind="campus-logo"
          campusId={form.id}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="c-name" label="Campus Name" required icon={Building2} value={form.name} placeholder="e.g. Main Campus" onChange={(v) => set("name", v)} />
          <Field id="c-city" label="City" required icon={MapPin} value={form.city} placeholder="e.g. Lahore" onChange={(v) => set("city", v)} />
          <Field id="c-phone" label="Phone" icon={Phone} value={form.phone} placeholder="+92 42 0000000" onChange={(v) => set("phone", v)} />
          <Field id="c-email" label="Campus Email" icon={Mail} value={form.email} placeholder="campus@school.edu.pk" onChange={(v) => set("email", v)} />
          <Field id="c-website" label="Website" icon={Globe} value={form.website} placeholder="Optional" onChange={(v) => set("website", v)} />
          <Field id="c-principal" label="Head of Campus" icon={UserRound} value={form.principalName} placeholder="Principal / director name" onChange={(v) => set("principalName", v)} />
        </div>

        <Field id="c-address" label="Address" icon={MapPin} value={form.address} placeholder="Full street address" onChange={(v) => set("address", v)} />

        <div className="space-y-1.5">
          <Label htmlFor="c-board" className="ml-1 text-[10px] font-black uppercase tracking-wider text-ink">Board</Label>
          <div className="relative flex items-center">
            <GraduationCap className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle" />
            <select
              id="c-board"
              value={form.board}
              onChange={(e) => set("board", e.target.value)}
              className="h-12 w-full cursor-pointer rounded-2xl border-0 bg-[#fbf0fe] pl-10 pr-4 text-sm font-bold text-[#1f1a23] outline-none transition-all focus:bg-white focus:ring-2 focus:ring-[#8127cf]/25"
            >
              {EXAM_BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <LockedRows
          rows={[{ icon: Hash, label: "Campus ID", value: campus.regId }]}
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
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const displaySrc = previewUrl || resolveMediaUrl(value);

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    if (file.size > 1_500_000) return toast.error("Use a logo image under 1.5 MB.");

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
      toast.success("Logo uploaded");
    } catch (error) {
      URL.revokeObjectURL(blobUrl);
      setPreviewUrl(null);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-5 rounded-[24px] border-2 border-dashed border-[#8127cf]/25 p-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#fbf0fe]">
        {displaySrc ? (
          <Image src={displaySrc} alt="" width={64} height={64} className="h-full w-full object-cover" unoptimized />
        ) : (
          <ImageIcon className="h-6 w-6 text-[#8127cf]/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted">Logo</p>
        <p className="mb-2.5 text-[10px] font-bold text-ink-subtle">{hint}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-[#8127cf] px-3.5 text-[10px] font-black uppercase tracking-wider text-white transition-all hover:bg-[#9c48ea] disabled:cursor-wait disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Uploading" : value ? "Replace" : "Choose"}
          </button>
          {value ? (
            <button
              type="button"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                onChange("");
              }}
              disabled={uploading}
              className="h-9 cursor-pointer rounded-xl border border-[#cfc2d6]/30 px-3.5 text-[10px] font-black uppercase tracking-wider text-ink-muted transition-all hover:border-rose-200 hover:text-rose-500 disabled:opacity-60"
            >
              Remove
            </button>
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
      <Label htmlFor={id} className="ml-1 text-[10px] font-black uppercase tracking-wider text-ink">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </Label>
      <div className="group relative flex items-center">
        <Icon className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle transition-all group-focus-within:text-[#8127cf]" />
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full rounded-2xl border-0 bg-[#fbf0fe] pl-10 pr-4 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-ink-subtle focus:bg-white focus:ring-2 focus:ring-[#8127cf]/25"
        />
      </div>
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
