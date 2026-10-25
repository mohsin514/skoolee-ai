"use client";

// ─────────────────────────────────────────────────────────────────
// Owner provisioning modals
//
// Two deliberately separate flows, because a plan belongs to a SCHOOL
// and not to a person:
//   ProvisionSchoolModal — School + Campus + owner account + plan. The kind
//                          (school group or single school) is an explicit,
//                          required choice (G22): a group's owner is its group
//                          admin across every campus; a single school's owner
//                          is its school admin. Both own billing.
//   AddUserModal         — a support tool (D10): a user inside an existing
//                          school, no plan. Schools normally invite their own
//                          people, and the dialog says so.
//
// Both end on the same CredentialHandoff panel, which is the only time
// the generated password is ever visible.
// ─────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useId, useState } from "react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { Alert } from "@/components/ui/alert";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { roleLabel, roleLabelFor, type UserRole } from "@/lib/roles";
import { localeTag } from "@/lib/locale/package";
import {
  Check, Copy, RefreshCw, Building2, UserPlus, Sparkles,
  AlertCircle, ShieldCheck, KeyRound, ArrowRight, Eye, EyeOff, Users,
  GraduationCap, Layers, Zap,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { PLANS, PLAN_ORDER, getPlanLimits } from "@/config/plans";
import type { PlanType } from "@/types";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";


// ─── shared bits ─────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole; hint: string }[] = [
  { value: "SUPER_ADMIN", hint: "A school group's admin: every campus and the subscription" },
  { value: "ADMIN", hint: "Runs a single school" },
  { value: "ACCOUNTANT", hint: "Manages campus fees and accounts" },
  { value: "LIBRARIAN", hint: "Manages campus books and lending" },
  { value: "RECEPTIONIST", hint: "Manages the campus front desk" },
  { value: "CAMPUS_ADMIN", hint: "Runs operations on one campus" },
  { value: "PRINCIPAL", hint: "Leads academics on one campus" },
  { value: "TEACHER", hint: "Assigned classes only · uses a seat" },
];

const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function makePassword(len = 14) {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[a[i] % PW_ALPHABET.length];
  return out.slice(0, -1) + "23456789"[Math.floor(Math.random() * 8)];
}

/**
 * The shell for every owner provisioning dialog.
 *
 * Delegates to the shared `Modal`. Its own version pinned itself at `z-[100]`,
 * which put it under the account menus at `z-[999]`, and it set
 * `document.body.style.overflow = ""` on close rather than restoring the
 * previous value — so closing a provisioning dialog that had been opened from
 * another dialog unlocked the page underneath both of them.
 */
function Shell({
  title, subtitle, icon: Icon, onClose, children, wide,
}: {
  title: string; subtitle: string; icon: LucideIcon; onClose: () => void;
  children: React.ReactNode; wide?: boolean;
}) {
  const t = useUiText();
  return (
    <Modal
      title={t(title)}
      subtitle={t(subtitle)}
      icon={Icon}
      eyebrow={t("Provisioning")}
      size={wide ? "md" : "sm"}
      onClose={onClose}
      bodyClassName="px-0 py-0 sm:px-0"
    >
      {children}
    </Modal>
  );
}

function Field({
  label, hint, required, error, children,
}: {
  label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  const t = useUiText();
  const fieldName = useId();
  return <FormField name={fieldName} label={t(label)} hint={hint ? t(hint) : undefined} required={required} error={error ? t(error) : undefined}>{children}</FormField>;
}


const inputCls =
  "w-full";

function ErrorBanner({ message }: { message: string }) {
  return <Alert tone="danger" compact>{message}</Alert>;
}

// ─── credential handoff ──────────────────────────────────

interface Handoff {
  heading: string;
  email: string;
  password: string;
  lines: { label: string; value: string }[];
}

function CredentialHandoff({ data, onDone }: { data: Handoff; onDone: () => void }) {
  const t = useUiText();
  const [copied, setCopied] = useState<string | null>(null);
  const [reveal, setReveal] = useState(true);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      toast.success(t("Copied"));
      setTimeout(() => setCopied(null), 1800);
    }, () => toast.error(t("Could not copy. Select the text and copy it manually.")));
  }, [t]);

  const bundle = `${t("SkooleeAI sign-in")}
${t("Email")}: ${data.email}
${t("Temporary password")}: ${data.password}

${t("You will be asked to set your own password on first sign-in.")}`;

  return (
    <div className="p-6">
      <Alert tone="success" live="polite" icon={Check} title={data.heading} className="mb-5">
        {t("The account is active and ready to use.")}
      </Alert>

      <dl className="mb-5 space-y-2 rounded-2xl bg-surface-subtle p-4">
        {data.lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-2xs font-semibold text-ink-subtle">{l.label}</dt>
            <dd className="truncate text-sm font-bold text-ink-strong"><bdi>{l.value}</bdi></dd>
          </div>
        ))}
      </dl>

      <div className="rounded-2xl border-2 border-dashed border-primary/25 bg-brand-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
          <p className="text-2xs font-semibold text-primary">{t("Shown once — copy it now")}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 truncate rounded-xl bg-card px-3 py-2.5 font-mono text-sm font-bold text-ink-strong">
              {data.email}
            </code>
            <Button variant="outline" size="icon" type="button" onClick={() => copy(data.email, "email")} aria-label={t("Copy email")}>
              {copied === "email" ? <Check aria-hidden="true" className="h-4 w-4 text-status-success-text" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 truncate rounded-xl bg-card px-3 py-2.5 font-mono text-sm font-bold tracking-wide text-ink-strong">
              {reveal ? data.password : "•".repeat(data.password.length)}
            </code>
            <Button variant="outline" size="icon" type="button" onClick={() => setReveal((v) => !v)} aria-label={reveal ? t("Hide password") : t("Show password")}>
              {reveal ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" type="button" onClick={() => copy(data.password, "pw")} aria-label={t("Copy password")}>
              {copied === "pw" ? <Check aria-hidden="true" className="h-4 w-4 text-status-success-text" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Button variant="outline" size="sm" type="button" onClick={() => copy(bundle, "all")} className="mt-3 flex w-full items-center justify-center gap-2">
          {copied === "all" ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
          {t("Copy both as a message")}
        </Button>
      </div>

      <p className="mt-4 flex items-start gap-2 px-1 text-2xs font-semibold leading-relaxed text-ink-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        {t("This password is not stored anywhere in readable form and cannot be shown again. The user must replace it the first time they sign in.")}
      </p>

      <Button type="button" onClick={onDone} className="mt-5 w-full">
        {t("Done")}
      </Button>
    </div>
  );
}

// ─── provision school ────────────────────────────────────

type InstitutionKindChoice = "GROUP" | "STANDALONE";
const KIND_CHOICES: { value: InstitutionKindChoice; title: string; hint: string }[] = [
  { value: "GROUP", title: "School group", hint: "Several campuses. The owner is the group admin: every campus and the subscription." },
  { value: "STANDALONE", title: "Single school", hint: "One campus. The owner is the school admin: daily running and the subscription." },
];

export interface SchoolProvisionPrefill {
  schoolName?: string; city?: string; ownerName?: string; ownerEmail?: string; contactEmail?: string;
  campusName?: string; kind?: "GROUP" | "STANDALONE"; plan?: PlanType;
}
export function ProvisionSchoolModal({ onClose, onCreated, prefill, workflowHandoffId }: { onClose: () => void; onCreated: () => void; prefill?: SchoolProvisionPrefill; workflowHandoffId?: string }) {
  const t = useUiText();
  const locale = useLocale();
  const [form, setForm] = useState({
    schoolName: prefill?.schoolName ?? "", city: prefill?.city ?? "", contactEmail: prefill?.contactEmail ?? "",
    ownerName: prefill?.ownerName ?? "", ownerEmail: prefill?.ownerEmail ?? "", phone: "",
    campusName: prefill?.campusName ?? "", campusCity: "", board: "", address: "",
    plan: prefill?.plan && prefill.plan in PLANS ? prefill.plan : "FREE" as PlanType, status: "TRIAL",
  });
  // G22: no default — the operator states whether this is a school group or a single school.
  const [kind, setKind] = useState<InstitutionKindChoice | null>(prefill?.kind === "GROUP" || prefill?.kind === "STANDALONE" ? prefill.kind : null);
  const [password, setPassword] = useState(makePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Handoff | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const planDef = PLANS[form.plan];
  // R7: numbers in the viewer's language and numbering system (locale tag), never the bare language.
  const number = (value: number) => (value < 0 ? "∞" : new Intl.NumberFormat(localeTag(locale)).format(value));

  const valid = Boolean(kind) && form.schoolName.trim() && form.city.trim() && form.ownerName.trim()
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim());

  const submit = async () => {
    if (!valid || busy || !kind) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/owner/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kind, password, ...(workflowHandoffId ? { workflowHandoffId } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "");

      const d = json.data;
      setDone({
        heading: t("{0} is live", [d.schoolName]),
        email: d.ownerEmail,
        password: d.tempPassword,
        lines: [
          { label: t("School"), value: d.schoolName },
          { label: t("Kind"), value: t(d.kind === "GROUP" ? "School group" : "Single school") },
          // §1.5: the owner is the group admin of a school group, the school admin of a single school.
          { label: t("Owner role"), value: roleLabelFor({ role: d.ownerRole as UserRole, institutionKind: d.kind === "GROUP" ? "GROUP" : "STANDALONE" }, locale.language) },
          { label: t("Subdomain"), value: d.slug },
          { label: t("First campus"), value: d.campusName },
          { label: t("Plan"), value: `${getPlanLimits(d.plan).name} · ${t(d.status === "ACTIVE" ? "Active" : "Trial")}` },
          { label: t("Limits"), value: t("{0} students · {1} teachers", [number(d.limits.maxStudents), number(d.limits.maxTeachers)]) },
        ],
      });
      onCreated();
    } catch (e) {
      setError(friendlyErrorMessage(e, t("Could not provision the school. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Shell title="School provisioned" subtitle="Hand these credentials to the school owner." icon={Building2} onClose={onClose}>
        <CredentialHandoff data={done} onDone={onClose} />
      </Shell>
    );
  }

  return (
    <Shell
      title="Provision a school"
      subtitle="Creates the school, its first campus and the owner account in one step."
      icon={Building2}
      onClose={onClose}
      wide
    >
      <div className="max-h-[calc(100vh-16rem)] space-y-6 overflow-y-auto p-6">
        {error && <ErrorBanner message={error} />}

        <fieldset className="space-y-3">
          <legend className="text-2xs font-semibold text-primary">{t("1 · Kind of institution")}</legend>
          <div role="radiogroup" aria-label={t("Kind of institution")} className="grid gap-2.5 sm:grid-cols-2">
            {KIND_CHOICES.map((choice) => {
              const on = kind === choice.value;
              return (
                <Button key={choice.value} role="radio" aria-checked={on} variant="choice" type="button" onClick={() => setKind(choice.value)} className="block h-auto text-start">
                  <span className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${on ? "text-primary" : "text-ink-strong"}`}>{t(choice.title)}</span>
                    {on && <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" strokeWidth={3} />}
                  </span>
                  <span className="mt-0.5 block text-2xs font-semibold leading-snug text-ink-subtle">{t(choice.hint)}</span>
                </Button>
              );
            })}
          </div>
          {!kind ? <p className="text-2xs font-semibold text-ink-muted">{t("Choose one. A single school cannot add campuses later without SkooleeAI support converting it to a group.")}</p> : null}
        </fieldset>

        <section className="space-y-4">
          <p className="text-2xs font-semibold text-primary">{t("2 · Institution")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={kind === "STANDALONE" ? "School name" : "School group name"} required>
              <SystemInput className={inputCls} value={form.schoolName} autoFocus dir="auto"
                onChange={(e) => set("schoolName", e.target.value)} />
            </Field>
            <Field label="City" required>
              <SystemInput className={inputCls} value={form.city} dir="auto"
                onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Contact email" hint="Defaults to the owner's email.">
              <SystemInput className={inputCls} type="email" dir="ltr" value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)} />
            </Field>
            <Field label="Phone">
              <SystemInput className={inputCls} type="tel" dir="ltr" value={form.phone}
                onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-2xs font-semibold text-primary">{t(kind === "STANDALONE" ? "3 · The school's campus" : "3 · First campus")}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Campus name" hint="Optional. The school name is used when blank.">
              <SystemInput className={inputCls} value={form.campusName} dir="auto"
                onChange={(e) => set("campusName", e.target.value)} />
            </Field>
            <Field label="Campus city" hint="Optional. The school's city is used when blank.">
              <SystemInput className={inputCls} value={form.campusCity} dir="auto"
                onChange={(e) => set("campusCity", e.target.value)} />
            </Field>
            <Field label="Board">
              <SystemInput className={inputCls} value={form.board} dir="auto"
                onChange={(e) => set("board", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-2xs font-semibold text-primary">{t("4 · Owner account")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <SystemInput className={inputCls} value={form.ownerName} dir="auto"
                onChange={(e) => set("ownerName", e.target.value)} />
            </Field>
            <Field label="Sign-in email" required>
              <SystemInput className={inputCls} type="email" dir="ltr" value={form.ownerEmail}
                onChange={(e) => set("ownerEmail", e.target.value)} />
            </Field>
          </div>
          <Field label="Temporary password" hint="They must change it at their first sign-in.">
            <div className="flex gap-2">
              <SystemInput className={inputCls} dir="ltr" value={password}
                onChange={(e) => setPassword(e.target.value)} />
              <Button variant="outline" size="icon" onClick={() => setPassword(makePassword())} type="button"
                aria-label={t("Make a new password")}
                className="flex shrink-0 items-center justify-center">
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          {kind ? (
            <p className="rounded-xl bg-surface-subtle px-3 py-2 text-2xs font-semibold text-ink-muted">
              {kind === "GROUP"
                ? t("The owner becomes the group admin: every campus, people and access, and the SkooleeAI subscription.")
                : t("The owner becomes the school admin: the school's daily running, its settings and the SkooleeAI subscription.")}
            </p>
          ) : null}
        </section>

        <section className="space-y-4">
          <p className="text-2xs font-semibold text-primary">{t("5 · Plan")}</p>
          <div className="grid gap-2.5 sm:grid-cols-4">
            {PLAN_ORDER.map((p) => {
              const def = PLANS[p];
              const on = form.plan === p;
              return (
                <Button aria-pressed={on} variant="choice" key={p} type="button" onClick={() => set("plan", p)}
                  className="block h-auto text-start">
                  <span className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${on ? "text-primary" : "text-ink-strong"}`}><bdi>{def.name}</bdi></span>
                    {on && <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" strokeWidth={3} />}
                  </span>
                  <span className="mt-0.5 block text-2xs font-semibold text-ink-subtle"><bdi>{def.priceLabel}</bdi></span>
                </Button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2.5 rounded-2xl bg-surface-subtle p-4 sm:grid-cols-4">
            {[
              { icon: GraduationCap, label: "Students", v: planDef.maxStudents },
              { icon: Users, label: "Teachers", v: planDef.maxTeachers },
              { icon: Layers, label: "Campuses", v: planDef.maxCampuses },
              { icon: Zap, label: "AI credits", v: planDef.aiCredits },
            ].map(({ icon: I, label, v }) => (
              <div key={label}>
                <div className="flex items-center gap-1.5 text-ink-subtle">
                  <I aria-hidden="true" className="h-3 w-3" />
                  <span className="text-2xs font-semibold">{t(label)}</span>
                </div>
                <p className="mt-1 text-lg font-bold tabular-nums text-ink-strong"><bdi>{number(v)}</bdi></p>
              </div>
            ))}
          </div>
          {kind === "STANDALONE" && planDef.maxCampuses !== 1 ? (
            <p className="text-2xs font-semibold text-ink-muted">{t("A single school uses one campus whatever the plan allows.")}</p>
          ) : null}

          <Field label="Initial status">
            <div role="radiogroup" aria-label={t("Initial status")} className="flex gap-2">
              {(["TRIAL", "ACTIVE"] as const).map((status) => (
                <Button role="radio" aria-checked={form.status === status} variant="choice" size="sm" key={status} type="button" onClick={() => set("status", status)}
                  className="flex-1">
                  {t(status === "TRIAL" ? "Trial" : "Active")}
                </Button>
              ))}
            </div>
          </Field>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle p-5">
        <p className="text-2xs font-semibold text-ink-subtle">
          {valid ? t("Ready to provision") : t("Fill in the required fields")}
        </p>
        <div className="flex gap-2.5">
          <Button variant="outline" type="button" onClick={onClose}>
            {t("Keep editing")}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!valid || busy} loading={busy}
            className="flex items-center gap-2">
            {busy ? null : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {t("Provision school")}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

// ─── add user ────────────────────────────────────────────

interface SchoolLite {
  id: string;
  name: string;
  plan?: string;
  campuses?: { id: string; name: string }[];
}

export function AddUserModal({
  schools, onClose, onCreated,
}: {
  schools: SchoolLite[]; onClose: () => void; onCreated: () => void;
}) {
  const t = useUiText();
  const { language } = useLocale();
  const [form, setForm] = useState({
    schoolId: "", campusId: "", fullName: "", email: "", phone: "", role: "TEACHER" as UserRole,
  });
  const [password, setPassword] = useState(makePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Handoff | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const school = useMemo(() => schools.find((s) => s.id === form.schoolId), [schools, form.schoolId]);
  const campuses = school?.campuses ?? [];
  const needsCampus = form.role !== "SUPER_ADMIN";

  // Reset campus whenever the school changes so a stale id can't submit.
  useEffect(() => { set("campusId", ""); }, [form.schoolId]);

  const valid = form.schoolId && form.fullName.trim()
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    && (!needsCampus || form.campusId);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/owner/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "");

      const d = json.data;
      setDone({
        heading: t("{0} can now sign in", [d.fullName]),
        email: d.email,
        password: d.tempPassword,
        lines: [
          { label: t("Name"), value: d.fullName },
          { label: t("Role"), value: roleLabel(d.role, language) },
          { label: t("School"), value: d.school?.name || "—" },
          { label: t("Campus"), value: d.campus?.name || t("Every campus") },
        ],
      });
      onCreated();
    } catch (e) {
      setError(friendlyErrorMessage(e, t("Could not create the user. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Shell title="User created" subtitle="Hand these credentials over securely." icon={UserPlus} onClose={onClose}>
        <CredentialHandoff data={done} onDone={onClose} />
      </Shell>
    );
  }

  return (
    <Shell
      title="Add a user"
      subtitle="Creates an account inside an existing school. The plan comes from that school."
      icon={UserPlus}
      onClose={onClose}
    >
      <div className="max-h-[calc(100vh-16rem)] space-y-5 overflow-y-auto p-6">
        {/* D10: a platform-side account is a support action; the school normally invites its own people. */}
        <Alert tone="warning" live="off" compact title={t("Use this only for support")}>
          {t("Schools invite their own people from People & access. Add an account here only when the school asks SkooleeAI support to; the school's administrator sees it in their member list.")}
        </Alert>
        {error && <ErrorBanner message={error} />}

        <Field label="School" required>
          <SystemSelect className={inputCls} value={form.schoolId}
            onChange={(e) => set("schoolId", e.target.value)}>
            <option value="">{t("Choose a school")}</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.plan ? ` · ${getPlanLimits(s.plan).name}` : ""}</option>
            ))}
          </SystemSelect>
        </Field>

        <Field label="Role" required>
          <div role="radiogroup" aria-label={t("Role")} className="grid gap-2 sm:grid-cols-2">
            {ROLE_OPTIONS.map((r) => {
              const on = form.role === r.value;
              return (
                <Button role="radio" aria-checked={on} variant="choice" key={r.value} type="button" onClick={() => set("role", r.value)}
                  className="block h-auto text-start">
                  <span className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${on ? "text-primary" : "text-ink-strong"}`}>{roleLabel(r.value, language)}</span>
                    {on && <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" strokeWidth={3} />}
                  </span>
                  <span className="mt-0.5 block text-2xs font-semibold leading-snug text-ink-subtle">{t(r.hint)}</span>
                </Button>
              );
            })}
          </div>
        </Field>

        {needsCampus && (
          <Field
            label="Campus"
            required
            hint={!form.schoolId ? "Choose a school first." : undefined}
            error={form.schoolId && campuses.length === 0 ? "This school has no campuses yet." : undefined}
          >
            <SystemSelect className={inputCls} value={form.campusId}
              disabled={!form.schoolId || campuses.length === 0}
              onChange={(e) => set("campusId", e.target.value)}>
              <option value="">{t("Choose a campus")}</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SystemSelect>
          </Field>
        )}

        {!needsCampus && (
          <p className="rounded-xl bg-surface-subtle px-3 py-2.5 text-2xs font-semibold text-ink-muted">
            {t("A group admin works across every campus, so no campus is assigned.")}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <SystemInput className={inputCls} value={form.fullName} dir="auto"
              onChange={(e) => set("fullName", e.target.value)} />
          </Field>
          <Field label="Phone">
            <SystemInput className={inputCls} type="tel" dir="ltr" value={form.phone}
              onChange={(e) => set("phone", e.target.value)} />
          </Field>
        </div>

        <Field label="Sign-in email" required>
          <SystemInput className={inputCls} type="email" dir="ltr" value={form.email}
            onChange={(e) => set("email", e.target.value)} />
        </Field>

        <Field label="Temporary password" hint="They must change it at their first sign-in.">
          <div className="flex gap-2">
            <SystemInput className={inputCls} dir="ltr" value={password}
              onChange={(e) => setPassword(e.target.value)} />
            <Button variant="outline" size="icon" onClick={() => setPassword(makePassword())} type="button"
              aria-label={t("Make a new password")}
              className="flex shrink-0 items-center justify-center">
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        </Field>

        {form.role === "TEACHER" && (
          <Alert tone="warning" live="off" compact icon={AlertCircle}>
            {t("Teacher accounts use a seat. If the school is at its plan limit the request is refused.")}
          </Alert>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle p-5">
        <p className="text-2xs font-semibold text-ink-subtle">
          {valid ? t("Ready to create") : t("Fill in the required fields")}
        </p>
        <div className="flex gap-2.5">
          <Button variant="outline" type="button" onClick={onClose}>
            {t("Keep editing")}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!valid || busy} loading={busy}
            className="flex items-center gap-2">
            {busy ? null : <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />}
            {t("Create user")}
          </Button>
        </div>
      </div>
    </Shell>
  );
}
