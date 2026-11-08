"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Lock, Mail, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { AnnouncementPreferencesPanel } from "@/components/school-ai/announcement-preferences-panel";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { AvatarImage } from "@/components/ui/avatar-image";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskStatus } from "@/components/ui/task-patterns";
import type { EditableProfile } from "@/components/profile/editable-profile-card";
import { securityCardClass } from "@/components/account-security/TwoFactorCard";

type Form = { fullName: string; phone: string; profileImageUrl: string };
const toForm = (profile: EditableProfile): Form => ({ fullName: profile.fullName || "", phone: profile.phone || "", profileImageUrl: profile.profileImageUrl || "" });
const MAX_IMAGE_BYTES = 5_000_000;

/**
 * Profile inside the Settings modal: photo, name and phone (GET/PATCH /api/profile).
 * Role and email are shown read-only because the school manages them.
 */
export function ProfileSettingsSection({ onSaved, onDirtyChange }: {
  onSaved?: (profile: EditableProfile) => void;
  /** Reports unsaved edits so the modal can ask before discarding them. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useUiText(), { language } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<EditableProfile | null>(null);
  const [form, setForm] = useState<Form>({ fullName: "", phone: "", profileImageUrl: "" });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/profile", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then(data => {
        if (!active || !data?.profile) return;
        setProfile(data.profile);
        setForm(toForm(data.profile));
        setState("ready");
      })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [attempt]);

  const baseline = profile ? toForm(profile) : null;
  const dirty = Boolean(baseline) && (form.fullName !== baseline!.fullName || form.phone !== baseline!.phone || form.profileImageUrl !== baseline!.profileImageUrl);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  function update(patch: Partial<Form>) {
    setForm(current => ({ ...current, ...patch }));
    setMessage(null);
  }

  function pickImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage({ kind: "error", text: t("Please choose an image file") }); return; }
    if (file.size > MAX_IMAGE_BYTES) { setMessage({ kind: "error", text: t("Use an image under 5 MB") }); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") update({ profileImageUrl: reader.result }); };
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!form.fullName.trim()) { setNameError(t("Full name is required")); return; }
    setNameError("");
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.fullName.trim(), phone: form.phone.trim() || null, profileImageUrl: form.profileImageUrl.trim() || null }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.profile) throw new Error("save");
      setProfile(result.profile);
      setForm(toForm(result.profile));
      onSaved?.(result.profile);
      setMessage({ kind: "saved", text: t("Profile updated") });
    } catch {
      setMessage({ kind: "error", text: t("Profile could not be saved") });
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") {
    return (
      <div role="status" aria-busy="true" className={`${securityCardClass} space-y-5`}>
        <span className="sr-only">{t("Loading…")}</span>
        <div className="flex items-center gap-4"><Skeleton className="size-20 rounded-3xl" /><Skeleton className="h-5 w-40 rounded-full" delay={60} /></div>
        <Skeleton className="h-12 w-full rounded-2xl" delay={120} />
        <Skeleton className="h-12 w-full rounded-2xl" delay={180} />
      </div>
    );
  }

  if (state === "error" || !profile) {
    return (
      <div role="alert" className={securityCardClass}>
        <p className="text-sm font-bold text-ink-strong">{t("Couldn't load your profile.")}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>
          <RotateCcw aria-hidden="true" />{t("Try again")}
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
      <section aria-labelledby="settings-photo-heading" className={securityCardClass}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="size-20 shrink-0 overflow-hidden rounded-3xl border-4 border-white bg-brand-100 shadow-[0_8px_24px_-12px_rgba(55,27,77,0.45)]">
            <AvatarImage src={form.profileImageUrl || undefined} name={form.fullName || profile.fullName} initialsClassName="text-xl" className="size-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 id="settings-photo-heading" className="text-base font-bold tracking-tight text-ink-strong">{t("Profile photo")}</h4>
            <p className="mt-1 text-sm font-semibold text-ink-muted">{t("PNG or JPG, up to 5 MB.")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={event => { pickImage(event.target.files?.[0]); event.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={saving}>
                <Camera aria-hidden="true" />{t("Change photo")}
              </Button>
              {form.profileImageUrl ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => update({ profileImageUrl: "" })} disabled={saving}>
                  <Trash2 aria-hidden="true" />{t("Remove photo")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="settings-details-heading" className={securityCardClass}>
        <h4 id="settings-details-heading" className="text-base font-bold tracking-tight text-ink-strong">{t("Personal details")}</h4>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField name="fullName" id="settings-full-name" label={t("Full name")} required error={nameError || undefined}>
            <Input id="settings-full-name" autoComplete="name" value={form.fullName} readOnly={saving}
              onChange={event => { update({ fullName: event.target.value }); if (nameError) setNameError(""); }} />
          </FormField>
          <FormField name="phone" id="settings-phone" label={t("Phone")}>
            <Input id="settings-phone" type="tel" dir="ltr" autoComplete="tel" inputMode="tel" value={form.phone} readOnly={saving}
              placeholder="+92…" onChange={event => update({ phone: event.target.value })} />
          </FormField>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <ReadOnly icon={ShieldCheck} label={t("Role")} value={profile.roleLabel ? t(profile.roleLabel) : "—"} />
          <ReadOnly icon={Mail} label={t("Email")} value={profile.email || "—"} ltr />
        </dl>
        <p className="mt-3 flex items-start gap-2 text-xs font-semibold leading-relaxed text-ink-muted">
          <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{t("Role, email and permissions are managed by your school administrator.")}
        </p>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div role="status" aria-live="polite" className="min-w-0 sm:me-auto">
          {message?.kind === "saved" ? <TaskStatus>{message.text}</TaskStatus> : null}
        </div>
        {dirty ? (
          <Button type="button" variant="ghost" disabled={saving} onClick={() => { setForm(baseline!); setMessage(null); setNameError(""); }}>{t("Discard changes")}</Button>
        ) : null}
        <Button type="submit" disabled={!dirty} loading={saving}>
          {saving ? null : <Save aria-hidden="true" />}
          {t(saving ? "Saving…" : "Save changes")}
        </Button>
      </div>
      {profile.role === "PARENT" && <AnnouncementPreferencesPanel language={language} parent />}
      {message?.kind === "error" ? <p role="alert" className="text-sm font-semibold text-destructive">{message.text}</p> : null}
    </form>
  );
}

function ReadOnly({ icon: Icon, label, value, ltr }: { icon: typeof Mail; label: string; value: string; ltr?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border-subtle bg-surface-subtle px-4 py-3">
      <dt className="flex items-center gap-1.5 text-xs font-bold text-ink-muted"><Icon aria-hidden="true" className="size-3.5 text-primary" />{label}</dt>
      <dd className="mt-1 text-sm font-bold text-ink-strong [overflow-wrap:anywhere]">{ltr ? <bdi dir="ltr">{value}</bdi> : value}</dd>
    </div>
  );
}
