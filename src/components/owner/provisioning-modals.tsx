"use client";

// ─────────────────────────────────────────────────────────────────
// Owner provisioning modals
//
// Two deliberately separate flows, because a plan belongs to a SCHOOL
// and not to a person:
//   ProvisionSchoolModal — School + Campus + SUPER_ADMIN owner + plan
//   AddUserModal         — a user inside an existing school, no plan
//
// Both end on the same CredentialHandoff panel, which is the only time
// the generated password is ever visible.
// ─────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  X, Loader2, Check, Copy, RefreshCw, Building2, UserPlus, Sparkles,
  AlertCircle, ShieldCheck, KeyRound, ArrowRight, Eye, EyeOff, Users,
  GraduationCap, Layers, Zap,
} from "lucide-react";
import { PLANS, PLAN_ORDER, getPlanLimits } from "@/config/plans";
import type { PlanType } from "@/types";

// ─── shared bits ─────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "Super Admin", hint: "Whole school, every campus" },
  { value: "CAMPUS_ADMIN", label: "Campus Admin", hint: "Full operations, one campus" },
  { value: "PRINCIPAL", label: "Principal", hint: "Academic oversight, one campus" },
  { value: "TEACHER", label: "Teacher", hint: "Assigned classes only · uses a seat" },
];

const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function makePassword(len = 14) {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[a[i] % PW_ALPHABET.length];
  return out.slice(0, -1) + "23456789"[Math.floor(Math.random() * 8)];
}

function Shell({
  title, subtitle, icon: Icon, onClose, children, wide,
}: {
  title: string; subtitle: string; icon: any; onClose: () => void;
  children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="animate-backdrop-enter fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[#1f1a23]/50 p-4 backdrop-blur-sm sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-modal-enter my-auto w-full ${wide ? "max-w-3xl" : "max-w-xl"} rounded-[28px] border border-[#cfc2d6]/20 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#cfc2d6]/15 p-6">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-lg shadow-[#8127cf]/25">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-[#1f1a23]">{title}</h3>
              <p className="mt-0.5 text-[13px] font-semibold leading-snug text-[#4d4354]/60">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 cursor-pointer rounded-xl p-2 text-[#4d4354]/40 transition-colors hover:bg-[#f3f4f9] hover:text-[#1f1a23]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label, hint, required, error, children,
}: {
  label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <label className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]">
          {label}{required && <span className="ml-0.5 text-[#8127cf]">*</span>}
        </label>
        {hint && <span className="text-[10px] font-bold text-[#4d4354]/35">{hint}</span>}
      </div>
      {children}
      {error && <p className="px-1 text-[11px] font-bold text-rose-500">{error}</p>}
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border-0 bg-[#f3f4f9] px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-[#4d4354]/30 focus:bg-white focus:ring-2 focus:ring-[#8127cf]/25";

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
      <p className="text-[13px] font-bold leading-snug text-rose-600">{message}</p>
    </div>
  );
}

// ─── credential handoff ──────────────────────────────────

interface Handoff {
  heading: string;
  email: string;
  password: string;
  lines: { label: string; value: string }[];
}

function CredentialHandoff({ data, onDone }: { data: Handoff; onDone: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [reveal, setReveal] = useState(true);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      toast.success("Copied");
      setTimeout(() => setCopied(null), 1800);
    });
  }, []);

  const bundle = `Skoolee sign-in
Email: ${data.email}
Temporary password: ${data.password}

You will be asked to set your own password on first sign-in.`;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </div>
        <div>
          <p className="text-[13px] font-black text-emerald-800">{data.heading}</p>
          <p className="text-[11px] font-bold text-emerald-700/70">The account is active and ready to use.</p>
        </div>
      </div>

      <dl className="mb-5 space-y-2 rounded-2xl bg-[#f9f7fb] p-4">
        {data.lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-[11px] font-black uppercase tracking-wider text-[#4d4354]/45">{l.label}</dt>
            <dd className="truncate text-[13px] font-bold text-[#1f1a23]">{l.value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-2xl border-2 border-dashed border-[#8127cf]/25 bg-[#fbf0fe] p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 text-[#8127cf]" />
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">
            Shown once — copy it now
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl bg-white px-3 py-2.5 font-mono text-[13px] font-bold text-[#1f1a23]">
              {data.email}
            </code>
            <button
              onClick={() => copy(data.email, "email")}
              className="cursor-pointer rounded-xl bg-white p-2.5 text-[#4d4354]/50 transition-colors hover:text-[#8127cf]"
              aria-label="Copy email"
            >
              {copied === "email" ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl bg-white px-3 py-2.5 font-mono text-[13px] font-black tracking-wide text-[#1f1a23]">
              {reveal ? data.password : "•".repeat(data.password.length)}
            </code>
            <button
              onClick={() => setReveal((v) => !v)}
              className="cursor-pointer rounded-xl bg-white p-2.5 text-[#4d4354]/50 transition-colors hover:text-[#8127cf]"
              aria-label={reveal ? "Hide password" : "Show password"}
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={() => copy(data.password, "pw")}
              className="cursor-pointer rounded-xl bg-white p-2.5 text-[#4d4354]/50 transition-colors hover:text-[#8127cf]"
              aria-label="Copy password"
            >
              {copied === "pw" ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          onClick={() => copy(bundle, "all")}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#8127cf]/20 bg-white py-2.5 text-[12px] font-black text-[#8127cf] transition-colors hover:bg-[#8127cf] hover:text-white"
        >
          {copied === "all" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy both as a message
        </button>
      </div>

      <p className="mt-4 flex items-start gap-2 px-1 text-[11px] font-semibold leading-relaxed text-[#4d4354]/55">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8127cf]" />
        This password is not stored anywhere in readable form and cannot be shown again.
        The user must replace it the first time they sign in.
      </p>

      <button
        onClick={onDone}
        className="mt-5 h-11 w-full cursor-pointer rounded-xl bg-[#1f1a23] font-black text-white transition-opacity hover:opacity-90"
      >
        Done
      </button>
    </div>
  );
}

// ─── provision school ────────────────────────────────────

export function ProvisionSchoolModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    schoolName: "", city: "", contactEmail: "",
    ownerName: "", ownerEmail: "", phone: "",
    campusName: "", campusCity: "", board: "", address: "",
    plan: "FREE" as PlanType, status: "TRIAL",
  });
  const [password, setPassword] = useState(makePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Handoff | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const planDef = PLANS[form.plan];

  const valid = form.schoolName.trim() && form.city.trim() && form.ownerName.trim()
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/owner/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not provision school");

      const d = json.data;
      setDone({
        heading: `${d.schoolName} is live`,
        email: d.ownerEmail,
        password: d.tempPassword,
        lines: [
          { label: "School", value: d.schoolName },
          { label: "Subdomain", value: d.slug },
          { label: "First campus", value: d.campusName },
          { label: "Plan", value: `${getPlanLimits(d.plan).name} · ${d.status}` },
          { label: "Limits", value: `${d.limits.maxStudents < 0 ? "∞" : d.limits.maxStudents} students · ${d.limits.maxTeachers < 0 ? "∞" : d.limits.maxTeachers} teachers` },
        ],
      });
      onCreated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not provision school";
      setError(msg);
      toast.error(msg);
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

        <section className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">1 · Institution</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="School / group name" required>
              <input className={inputCls} value={form.schoolName} autoFocus
                onChange={(e) => set("schoolName", e.target.value)} placeholder="Beaconhouse Garden Town" />
            </Field>
            <Field label="City" required>
              <input className={inputCls} value={form.city}
                onChange={(e) => set("city", e.target.value)} placeholder="Lahore" />
            </Field>
            <Field label="Contact email" hint="defaults to owner email">
              <input className={inputCls} type="email" value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)} placeholder="info@school.edu.pk" />
            </Field>
            <Field label="Phone">
              <input className={inputCls} value={form.phone}
                onChange={(e) => set("phone", e.target.value)} placeholder="+92 300 1234567" />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">2 · First campus</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Campus name" hint="auto">
              <input className={inputCls} value={form.campusName}
                onChange={(e) => set("campusName", e.target.value)}
                placeholder={form.schoolName ? `${form.schoolName} — Main` : "Main Campus"} />
            </Field>
            <Field label="Campus city" hint="auto">
              <input className={inputCls} value={form.campusCity}
                onChange={(e) => set("campusCity", e.target.value)} placeholder={form.city || "Lahore"} />
            </Field>
            <Field label="Board">
              <input className={inputCls} value={form.board}
                onChange={(e) => set("board", e.target.value)} placeholder="FBISE" />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">3 · Owner account</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <input className={inputCls} value={form.ownerName}
                onChange={(e) => set("ownerName", e.target.value)} placeholder="Ayesha Khan" />
            </Field>
            <Field label="Login email" required>
              <input className={inputCls} type="email" value={form.ownerEmail}
                onChange={(e) => set("ownerEmail", e.target.value)} placeholder="ayesha@school.edu.pk" />
            </Field>
          </div>
          <Field label="Temporary password" hint="user must change it on first sign-in">
            <div className="flex gap-2">
              <input className={`${inputCls} font-mono`} value={password}
                onChange={(e) => setPassword(e.target.value)} />
              <button onClick={() => setPassword(makePassword())} type="button"
                aria-label="Regenerate password"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[#f3f4f9] text-[#4d4354]/50 transition-colors hover:bg-[#8127cf] hover:text-white">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </Field>
          <p className="rounded-xl bg-[#f9f7fb] px-3 py-2 text-[11px] font-bold text-[#4d4354]/55">
            Role is <span className="text-[#8127cf]">SUPER_ADMIN</span> — full control of this school across every campus.
          </p>
        </section>

        <section className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">4 · Plan</p>
          <div className="grid gap-2.5 sm:grid-cols-4">
            {PLAN_ORDER.map((p) => {
              const def = PLANS[p];
              const on = form.plan === p;
              return (
                <button key={p} type="button" onClick={() => set("plan", p)}
                  className={`cursor-pointer rounded-2xl border-2 p-3.5 text-left transition-all ${
                    on ? "border-[#8127cf] bg-[#fbf0fe] shadow-md shadow-[#8127cf]/10" : "border-[#cfc2d6]/30 hover:border-[#8127cf]/40"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[13px] font-black ${on ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{def.name}</span>
                    {on && <Check className="h-3.5 w-3.5 text-[#8127cf]" strokeWidth={3} />}
                  </div>
                  <p className="mt-0.5 text-[10px] font-bold text-[#4d4354]/45">{def.priceLabel}</p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2.5 rounded-2xl bg-[#f9f7fb] p-4 sm:grid-cols-4">
            {[
              { icon: GraduationCap, label: "Students", v: planDef.maxStudents },
              { icon: Users, label: "Teachers", v: planDef.maxTeachers },
              { icon: Layers, label: "Campuses", v: planDef.maxCampuses },
              { icon: Zap, label: "AI credits", v: planDef.aiCredits },
            ].map(({ icon: I, label, v }) => (
              <div key={label}>
                <div className="flex items-center gap-1.5 text-[#4d4354]/40">
                  <I className="h-3 w-3" />
                  <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
                </div>
                <p className="mt-1 text-lg font-black tabular-nums text-[#1f1a23]">
                  {v < 0 ? "∞" : v.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <Field label="Initial status">
            <div className="flex gap-2">
              {["TRIAL", "ACTIVE"].map((s) => (
                <button key={s} type="button" onClick={() => set("status", s)}
                  className={`h-10 flex-1 cursor-pointer rounded-xl text-[12px] font-black transition-all ${
                    form.status === s ? "bg-[#8127cf] text-white" : "bg-[#f3f4f9] text-[#4d4354]/60 hover:bg-[#e9e5ee]"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
        </section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#cfc2d6]/15 p-5">
        <p className="text-[11px] font-bold text-[#4d4354]/40">
          {valid ? "Ready to provision" : "Fill the required fields"}
        </p>
        <div className="flex gap-2.5">
          <button onClick={onClose}
            className="h-11 cursor-pointer rounded-xl px-5 text-[13px] font-black text-[#4d4354]/60 transition-colors hover:bg-[#f3f4f9]">
            Cancel
          </button>
          <button onClick={submit} disabled={!valid || busy}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] px-6 text-[13px] font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Provisioning…" : "Provision school"}
          </button>
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
  const [form, setForm] = useState({
    schoolId: "", campusId: "", fullName: "", email: "", phone: "", role: "TEACHER",
  });
  const [password, setPassword] = useState(makePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Handoff | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not create user");

      const d = json.data;
      setDone({
        heading: `${d.fullName} can now sign in`,
        email: d.email,
        password: d.tempPassword,
        lines: [
          { label: "Name", value: d.fullName },
          { label: "Role", value: d.role },
          { label: "School", value: d.school?.name || "—" },
          { label: "Campus", value: d.campus?.name || "All campuses" },
        ],
      });
      onCreated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create user";
      setError(msg);
      toast.error(msg);
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
      subtitle="Creates a staff account inside an existing school. The plan comes from that school."
      icon={UserPlus}
      onClose={onClose}
    >
      <div className="max-h-[calc(100vh-16rem)] space-y-5 overflow-y-auto p-6">
        {error && <ErrorBanner message={error} />}

        <Field label="School" required>
          <select className={`${inputCls} cursor-pointer`} value={form.schoolId}
            onChange={(e) => set("schoolId", e.target.value)}>
            <option value="">Select a school…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.plan ? ` · ${getPlanLimits(s.plan).name}` : ""}</option>
            ))}
          </select>
        </Field>

        <Field label="Role" required>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLE_OPTIONS.map((r) => {
              const on = form.role === r.value;
              return (
                <button key={r.value} type="button" onClick={() => set("role", r.value)}
                  className={`cursor-pointer rounded-2xl border-2 p-3 text-left transition-all ${
                    on ? "border-[#8127cf] bg-[#fbf0fe]" : "border-[#cfc2d6]/30 hover:border-[#8127cf]/40"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[12.5px] font-black ${on ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{r.label}</span>
                    {on && <Check className="h-3.5 w-3.5 text-[#8127cf]" strokeWidth={3} />}
                  </div>
                  <p className="mt-0.5 text-[10px] font-bold leading-snug text-[#4d4354]/45">{r.hint}</p>
                </button>
              );
            })}
          </div>
        </Field>

        {needsCampus && (
          <Field
            label="Campus"
            required
            hint={!form.schoolId ? "pick a school first" : undefined}
            error={form.schoolId && campuses.length === 0 ? "This school has no campuses yet." : undefined}
          >
            <select className={`${inputCls} cursor-pointer disabled:opacity-50`} value={form.campusId}
              disabled={!form.schoolId || campuses.length === 0}
              onChange={(e) => set("campusId", e.target.value)}>
              <option value="">Select a campus…</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}

        {!needsCampus && (
          <p className="rounded-xl bg-[#f9f7fb] px-3 py-2.5 text-[11px] font-bold text-[#4d4354]/55">
            A Super Admin spans every campus in the school, so no campus is assigned.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <input className={inputCls} value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)} placeholder="Bilal Ahmed" />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.phone}
              onChange={(e) => set("phone", e.target.value)} placeholder="+92 300 1234567" />
          </Field>
        </div>

        <Field label="Login email" required>
          <input className={inputCls} type="email" value={form.email}
            onChange={(e) => set("email", e.target.value)} placeholder="bilal@school.edu.pk" />
        </Field>

        <Field label="Temporary password" hint="user must change it on first sign-in">
          <div className="flex gap-2">
            <input className={`${inputCls} font-mono`} value={password}
              onChange={(e) => setPassword(e.target.value)} />
            <button onClick={() => setPassword(makePassword())} type="button"
              aria-label="Regenerate password"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[#f3f4f9] text-[#4d4354]/50 transition-colors hover:bg-[#8127cf] hover:text-white">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </Field>

        {form.role === "TEACHER" && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] font-bold leading-snug text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Teacher accounts consume a seat. If the school is at its plan limit the request will be rejected.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#cfc2d6]/15 p-5">
        <p className="text-[11px] font-bold text-[#4d4354]/40">
          {valid ? "Ready to create" : "Fill the required fields"}
        </p>
        <div className="flex gap-2.5">
          <button onClick={onClose}
            className="h-11 cursor-pointer rounded-xl px-5 text-[13px] font-black text-[#4d4354]/60 transition-colors hover:bg-[#f3f4f9]">
            Cancel
          </button>
          <button onClick={submit} disabled={!valid || busy}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] px-6 text-[13px] font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </div>
    </Shell>
  );
}
