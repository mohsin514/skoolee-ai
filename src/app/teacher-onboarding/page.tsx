'use client';

import { useCallback, useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  GraduationCap,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Shield,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import SkooleeLogo from "@/components/SkooleeLogo";
import AvatarOrbit from "@/components/auth/AvatarOrbit";
import { getTeacherOnboardingSession, completeTeacherOnboarding } from '@/app/actions/completeTeacherOnboarding';
import { dashboardPathForRole } from '@/lib/roles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STEPS = ["Personal Info", "Professional", "Address & Emergency"] as const;

/**
 * Starting points for the specialities picker — not a closed list. Anything
 * typed in is kept, because a school teaching Quran, Sindhi or Robotics should
 * not have to pick "Other".
 */
const SUGGESTED_SUBJECTS = [
  "Mathematics", "English", "Urdu", "Physics", "Chemistry", "Biology",
  "Computer Science", "Islamiyat", "Pakistan Studies", "General Science",
  "Social Studies", "Arts", "Physical Education",
];

const QUALIFICATIONS = ["Matric", "Intermediate", "Bachelors", "Masters", "MPhil", "PhD", "B.Ed", "M.Ed"];

const PROVINCES = ["Punjab", "Sindh", "KPK", "Balochistan", "Islamabad", "AJK", "Gilgit-Baltistan"];

interface TeacherForm {
  fullName: string;
  phone: string;
  cnic: string;
  dateOfBirth: string;
  gender: string;
  qualification: string;
  specialization: string;
  experience: string;
  joiningDate: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContact: string;
  emergencyPhone: string;
}

const EMPTY_FORM: TeacherForm = {
  fullName: '',
  phone: '',
  cnic: '',
  dateOfBirth: '',
  gender: '',
  qualification: '',
  specialization: '',
  experience: '',
  joiningDate: '',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  emergencyContact: '',
  emergencyPhone: '',
};

export default function TeacherOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<TeacherForm>(EMPTY_FORM);

  // Structured teaching subjects. Free-text `specialization` reads nicely on a
  // profile but nothing can match on it — these drive the mismatch warning when
  // a teacher is booked onto a subject they don't teach.
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [teachesAll, setTeachesAll] = useState(false);
  const [draft, setDraft] = useState("");

  const brandRef = useRef<HTMLElement>(null);

  const set = useCallback(
    <K extends keyof TeacherForm>(field: K, value: TeacherForm[K]) =>
      setForm((p) => ({ ...p, [field]: value })),
    [],
  );

  const handleBrandMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = brandRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", String((e.clientX - rect.left) / rect.width - 0.5));
    el.style.setProperty("--my", String((e.clientY - rect.top) / rect.height - 0.5));
  }, []);
  const resetBrandParallax = useCallback(() => {
    const el = brandRef.current;
    el?.style.setProperty("--mx", "0");
    el?.style.setProperty("--my", "0");
  }, []);

  useEffect(() => {
    const load = async () => {
      const session = await getTeacherOnboardingSession();
      if (!session) { router.replace('/login'); return; }
      if (session.redirect) { router.replace(dashboardPathForRole(session.role)); return; }
      if (session.error) { router.replace('/login'); return; }
      if (session.user) {
        setForm((p) => ({
          ...p,
          fullName: session.user!.fullName || '',
          phone: session.user!.phone || '',
        }));
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const addSpecialty = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setSpecialties((cur) =>
      cur.some((x) => x.toLowerCase() === clean.toLowerCase()) ? cur : [...cur, clean],
    );
    setDraft("");
  };

  const canStep0 = form.fullName.trim().length >= 2 && form.phone.trim().length >= 7;
  const canSubmit = canStep0;

  // How complete the profile is — counts the fields colleagues actually look
  // for, so the bar means something rather than tracking screens visited.
  const completeness = useMemo(() => {
    const tracked = [
      form.fullName.trim().length >= 2,
      form.phone.trim().length >= 7,
      !!form.cnic.trim(),
      !!form.dateOfBirth,
      !!form.gender,
      !!form.qualification,
      teachesAll || specialties.length > 0,
      !!form.experience.trim(),
      !!form.city.trim(),
      !!form.emergencyPhone.trim(),
    ];
    return Math.round((tracked.filter(Boolean).length / tracked.length) * 100);
  }, [form, specialties, teachesAll]);

  const goNext = () => {
    if (step === 0 && !canStep0) {
      toast.error("Your name and phone number are required.");
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setStep(0);
      toast.error("Your name and phone number are required.");
      return;
    }
    setSaving(true);
    try {
      await completeTeacherOnboarding({
        ...form,
        // Keep the readable line in step with the structured list, so the
        // profile header and the matching logic never disagree.
        specialization: teachesAll
          ? "All subjects"
          : specialties.join(", ") || form.specialization.trim(),
        subjectSpecialties: teachesAll ? [] : specialties,
        teachesAllSubjects: teachesAll,
      });
      toast.success('Profile completed! Welcome to Skoolee.');
      router.push('/teacher');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#fff7fe]">
        <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
        <p className="text-xs font-bold text-ink">Loading your profile…</p>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen w-full grid-cols-1 bg-[#fff7fe] font-sans text-[#1f1a23] lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)]">
      <style>{`
        @keyframes skDrift {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          33%     { transform: translate3d(4%,-6%,0) scale(1.12); }
          66%     { transform: translate3d(-5%,4%,0) scale(0.95); }
        }
        @keyframes skRise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sk-blob { animation: skDrift 22s ease-in-out infinite; will-change: transform; }
        .sk-blob-2 { animation-duration: 28s; animation-delay: -8s; }
        .sk-parallax { transition: transform .35s ease-out; will-change: transform; }
        .sk-rise { animation: skRise .6s cubic-bezier(.2,.7,.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .sk-blob, .sk-rise { animation: none !important; }
          .sk-parallax { transition: none !important; }
        }
      `}</style>

      {/* ─── BRAND PANEL ─────────────────────────────── */}
      <section
        ref={brandRef}
        onMouseMove={handleBrandMouseMove}
        onMouseLeave={resetBrandParallax}
        className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8127cf] via-[#6f1fb8] to-[#4f1487] p-12 lg:flex xl:p-14"
      >
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <div
            className="sk-parallax absolute -top-1/4 -left-1/5 h-[72%] w-[72%]"
            style={{ transform: "translate3d(calc(var(--mx, 0) * 26px), calc(var(--my, 0) * 26px), 0)" }}
          >
            <div className="sk-blob h-full w-full rounded-full bg-[#9c48ea] opacity-70 blur-[90px]" />
          </div>
          <div
            className="sk-parallax absolute top-1/4 -right-1/4 h-[68%] w-[68%]"
            style={{ transform: "translate3d(calc(var(--mx, 0) * -34px), calc(var(--my, 0) * -34px), 0)" }}
          >
            <div className="sk-blob sk-blob-2 h-full w-full rounded-full bg-[#b073f0] opacity-45 blur-[100px]" />
          </div>
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
        </div>

        <div
          className="sk-parallax absolute -bottom-16 -right-16 z-0"
          style={{ transform: "translate3d(calc(var(--mx, 0) * -12px), calc(var(--my, 0) * -12px), 0)" }}
        >
          <AvatarOrbit size={320} duration={50} className="opacity-90" />
        </div>

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="h-8 w-1 rounded-full bg-white/70" />
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">Skoolee AI</p>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="sk-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-[#e9d5ff]" />
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#e9d5ff]">Almost there</span>
          </div>

          <h1
            className="sk-rise mt-7 text-[2.6rem] font-black leading-[1.04] tracking-[-0.035em] text-white text-balance xl:text-[3.1rem]"
            style={{ animationDelay: "80ms" }}
          >
            Your classroom
            <br />
            <span className="bg-gradient-to-r from-[#e9d5ff] to-[#f0abfc] bg-clip-text text-transparent">
              is ready for you.
            </span>
          </h1>

          {/* Live preview of the profile card colleagues and the timetable
              builder will see — the form's payoff, visible while filling it in. */}
          <div className="sk-rise mt-9 rounded-3xl border border-white/25 bg-[#3d0f6b]/40 p-6 shadow-xl backdrop-blur-xl" style={{ animationDelay: "160ms" }}>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20 text-lg font-black text-white">
                {form.fullName.trim().charAt(0).toUpperCase() || "T"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-black text-white">
                  {form.fullName.trim() || "Your name"}
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-[#e4c9f7]">
                  Teacher{form.qualification ? ` · ${form.qualification}` : ""}
                  {form.experience.trim() ? ` · ${form.experience.trim()}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {teachesAll ? (
                    <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black text-white">
                      All subjects
                    </span>
                  ) : specialties.length > 0 ? (
                    specialties.slice(0, 5).map((s) => (
                      <span key={s} className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black text-white">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-dashed border-white/30 px-2.5 py-1 text-[10px] font-bold text-white/60">
                      Subjects you teach
                    </span>
                  )}
                  {!teachesAll && specialties.length > 5 && (
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black text-white/70">
                      +{specialties.length - 5}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-white/15 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#e4c9f7]">Profile completeness</span>
                <span className="text-[10px] font-black text-white">{completeness}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#e9d5ff] to-white transition-all duration-500"
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>
          </div>

          <p className="sk-rise mt-6 text-[12px] font-semibold leading-relaxed text-white/70" style={{ animationDelay: "240ms" }}>
            The subjects you list here are what the timetable builder matches against, so you are never quietly booked onto a class outside your field.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[11px] font-bold text-white/75">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Your details stay inside your school</span>
        </div>
      </section>

      {/* ─── FORM PANEL ──────────────────────────────── */}
      <section className="flex min-h-screen items-center justify-center overflow-y-auto p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-lg">
          <div className="sk-rise mb-7 flex flex-col items-center">
            <SkooleeLogo size="2.1rem" weight="heavy" />
            <div className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
          </div>

          {/* Step rail */}
          <div className="mb-6 flex items-center gap-2 px-1">
            {STEPS.map((label, i) => {
              const done = step > i;
              const active = step === i;
              const reachable = i <= step || canStep0;
              return (
                <div key={label} className="flex flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { if (reachable) setStep(i); }}
                    disabled={!reachable}
                    className={`flex items-center gap-2 transition-all ${reachable ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black transition-all duration-300 ${
                        done
                          ? "bg-emerald-500 text-white"
                          : active
                          ? "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-md shadow-[#8127cf]/25"
                          : "bg-[#cfc2d6]/25 text-ink-subtle"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" strokeWidth={3.5} /> : i + 1}
                    </span>
                    <span
                      className={`hidden whitespace-nowrap text-[10px] font-black uppercase tracking-wider transition-colors sm:block ${
                        active ? "text-[#1f1a23]" : done ? "text-emerald-600" : "text-ink-subtle"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className="h-px flex-1 rounded-full bg-[#cfc2d6]/30">
                      <span className={`block h-px rounded-full bg-gradient-to-r from-[#8127cf] to-emerald-500 transition-all duration-500 ${done ? "w-full" : "w-0"}`} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sk-rise rounded-[30px] border border-[#cfc2d6]/30 bg-white p-7 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9">
            <div className="mb-6">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#fbf0fe] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#8127cf]">
                <Sparkles className="h-3.5 w-3.5" />
                Step {step + 1} of {STEPS.length}
              </div>
              <h1 className="text-[1.6rem] font-black tracking-[-0.03em] text-[#1f1a23]">{STEPS[step]}</h1>
              <p className="mt-1.5 text-[13px] font-semibold text-ink-muted">
                {step === 0
                  ? "How your name and number appear to staff and parents."
                  : step === 1
                  ? "What you're qualified to teach — used when subjects are assigned."
                  : "Where you are, and who to call if something happens at school."}
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {/* Step 0 — Personal Info */}
              {step === 0 && (
                <div className="space-y-4">
                  <Field
                    label="Full Name" id="fullName" required icon={UserRound}
                    value={form.fullName} placeholder="Your official name"
                    onChange={(v) => set("fullName", v)}
                    error={form.fullName && form.fullName.trim().length < 2 ? "Name must be at least 2 characters" : undefined}
                  />
                  <Field
                    label="Phone Number" id="phone" required type="tel" icon={Phone}
                    value={form.phone} placeholder="03XX-XXXXXXX"
                    onChange={(v) => set("phone", v)}
                    error={form.phone && form.phone.trim().length < 7 ? "Phone must be at least 7 digits" : undefined}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="CNIC" id="cnic" value={form.cnic} placeholder="12345-1234567-1" onChange={(v) => set("cnic", v)} />
                    <Field label="Date of Birth" id="dob" value={form.dateOfBirth} placeholder="" onChange={(v) => set("dateOfBirth", v)} type="date" />
                  </div>
                  <SelectField label="Gender" id="gender" value={form.gender} onChange={(v) => set("gender", v)}>
                    <option value="">Not specified</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </SelectField>
                </div>
              )}

              {/* Step 1 — Professional */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="Qualification" id="qualification" value={form.qualification} onChange={(v) => set("qualification", v)}>
                      <option value="">Select qualification</option>
                      {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                    </SelectField>
                    <Field label="Experience" id="experience" value={form.experience} placeholder="e.g. 5 years" onChange={(v) => set("experience", v)} />
                  </div>

                  <Field
                    label="Joining Date" id="joiningDate" type="date" icon={GraduationCap}
                    value={form.joiningDate} placeholder=""
                    onChange={(v) => set("joiningDate", v)}
                    hint="The date your service at this school starts. Used for leave allocation and payroll."
                  />

                  {/* ── Teaching specialities ── */}
                  <div className="space-y-3 rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe] p-5">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5 text-[#8127cf]" />
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">Subjects you teach</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTeachesAll((v) => !v)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-white p-3 text-left transition-all hover:shadow-sm"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                          teachesAll ? "border-emerald-500 bg-emerald-500" : "border-[#cfc2d6]/50 bg-white"
                        }`}
                      >
                        {teachesAll ? <Check className="h-3 w-3 text-white" strokeWidth={3.5} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11.5px] font-black text-[#1f1a23]">I can teach all subjects</span>
                        <span className="block text-[10px] font-bold text-ink-muted">
                          Generalist — never warned about a subject mismatch.
                        </span>
                      </span>
                    </button>

                    {!teachesAll && (
                      <>
                        {specialties.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {specialties.map((s) => (
                              <span
                                key={s}
                                className="inline-flex items-center gap-1.5 rounded-full bg-[#8127cf] px-3 py-1.5 text-[10px] font-black text-white shadow-sm shadow-[#8127cf]/25"
                              >
                                {s}
                                <button
                                  type="button"
                                  onClick={() => setSpecialties((cur) => cur.filter((x) => x !== s))}
                                  className="cursor-pointer text-white/70 transition-colors hover:text-white"
                                  aria-label={`Remove ${s}`}
                                >
                                  <X className="h-2.5 w-2.5" strokeWidth={3.5} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              // Enter adds a subject; it must not submit the form.
                              if (e.key === "Enter") { e.preventDefault(); addSpecialty(draft); }
                            }}
                            placeholder="Type a subject and press Enter"
                            className="h-11 flex-1 rounded-xl border-0 bg-white px-4 text-xs font-bold shadow-none focus:ring-2 focus:ring-[#8127cf]/20"
                          />
                          <button
                            type="button"
                            onClick={() => addSpecialty(draft)}
                            disabled={!draft.trim()}
                            aria-label="Add subject"
                            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/20 transition-all hover:bg-[#9c48ea] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 border-t border-[#cfc2d6]/20 pt-3">
                          {SUGGESTED_SUBJECTS
                            .filter((s) => !specialties.some((x) => x.toLowerCase() === s.toLowerCase()))
                            .map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => addSpecialty(s)}
                                className="cursor-pointer rounded-full border border-[#cfc2d6]/40 bg-white px-2.5 py-1 text-[10px] font-bold text-ink-muted transition-all hover:border-[#8127cf]/40 hover:text-[#8127cf]"
                              >
                                + {s}
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2 — Address & Emergency */}
              {step === 2 && (
                <div className="space-y-4">
                  <Field label="Address" id="address" icon={MapPin} value={form.address} placeholder="Street address" onChange={(v) => set("address", v)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="City" id="city" value={form.city} placeholder="City" onChange={(v) => set("city", v)} />
                    <SelectField label="Province" id="province" value={form.province} onChange={(v) => set("province", v)}>
                      <option value="">Select</option>
                      {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </SelectField>
                  </div>
                  <Field label="Postal Code" id="postalCode" value={form.postalCode} placeholder="Postal code" onChange={(v) => set("postalCode", v)} />

                  <div className="space-y-4 rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe] p-5">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-[#8127cf]" />
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">Emergency contact</p>
                    </div>
                    <Field label="Contact Person" id="emergencyContact" value={form.emergencyContact} placeholder="Who should we call?" onChange={(v) => set("emergencyContact", v)} inputClassName="bg-white" />
                    <Field label="Contact Phone" id="emergencyPhone" type="tel" value={form.emergencyPhone} placeholder="Emergency phone number" onChange={(v) => set("emergencyPhone", v)} inputClassName="bg-white" />
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="mt-7 flex items-center justify-between gap-3">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="flex h-12 cursor-pointer items-center gap-2 rounded-2xl bg-[#f3f4f9] px-5 text-sm font-black text-ink transition-all hover:bg-[#e8e0ec]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                ) : <div />}

                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    disabled={step === 0 && !canStep0}
                    onClick={goNext}
                    className="flex h-12 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] px-6 text-sm font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canSubmit || saving}
                    className="flex h-12 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] px-6 text-sm font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                    ) : (
                      <>Complete Profile <CheckCircle2 className="h-4 w-4" /></>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Mobile completeness readout — the brand panel is hidden here. */}
          <div className="mt-5 flex items-center gap-3 px-1 lg:hidden">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#cfc2d6]/25">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-all duration-500"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-ink-muted">{completeness}% complete</span>
          </div>
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────
// Field components live at module scope on purpose. Defined inside the
// page component they become a new component type on every render, so
// React unmounts and remounts each input — which drops focus after every
// single keystroke.
// ─────────────────────────────────────────────────────────────────

function Field({
  label, id, value, placeholder, onChange, required, type = "text",
  icon: Icon, error, hint, inputClassName = "",
}: {
  label: string;
  id: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  icon?: React.ComponentType<{ className?: string }>;
  error?: string;
  hint?: string;
  inputClassName?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="ml-1 text-[10px] font-black uppercase tracking-wider text-ink">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <div className="group relative flex items-center">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-subtle transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-[#8127cf]" />
        )}
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={!!error}
          className={`h-12 w-full rounded-2xl border-0 font-bold text-[#1f1a23] shadow-none transition-all placeholder:text-ink-subtle focus:bg-white focus:ring-2 ${
            Icon ? "pl-10" : "pl-4"
          } pr-4 ${error ? "bg-rose-50 focus:ring-rose-200" : "bg-[#fbf0fe] focus:ring-[#8127cf]/25"} ${inputClassName}`}
        />
      </div>
      {error
        ? <p className="px-1 text-xs font-bold text-rose-500">{error}</p>
        : hint
        ? <p className="px-1 text-[10px] font-bold text-ink-subtle">{hint}</p>
        : null}
    </div>
  );
}

function SelectField({ label, id, value, onChange, children }: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="ml-1 text-[10px] font-black uppercase tracking-wider text-ink">{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-12 w-full cursor-pointer rounded-2xl border-0 bg-[#fbf0fe] px-4 text-sm font-bold text-[#1f1a23] shadow-none outline-none transition-all focus:bg-white focus:ring-2 focus:ring-[#8127cf]/25"
      >
        {children}
      </select>
    </div>
  );
}
