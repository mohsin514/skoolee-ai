'use client';
import { Button } from "@/components/ui/button";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";
import { FormErrorSummary, FormField } from "@/components/ui/form-field";
import { InputGroup } from "@/components/ui/input-group";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { Progress } from "@/components/ui/progress";
import { GuideCompanion } from "@/components/onboarding/GuideCompanion";
import { launchCopy } from "@/components/onboarding/launch-copy";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";


import { useCallback, useEffect, useMemo, useRef, useState, FormEvent, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  MapPin,
  Phone,
  Plus,
  Shield,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthCover } from "@/components/auth/AuthCover";
import { AuthColophon } from "@/components/auth/AuthColophon";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { getTeacherOnboardingSession, completeTeacherOnboarding, type TeacherReadiness } from '@/app/actions/completeTeacherOnboarding';
import { dashboardPathForRole } from '@/lib/roles';
import { useLocale, useUiText } from '@/components/locale/LocaleProvider';
import { Input } from '@/components/ui/input';
import { Select as SystemSelect } from "@/components/ui/select";

const STEPS = ["Personal Info", "Professional", "Address & Emergency", "Review"] as const;

/** Only these two are needed to start teaching; everything else can follow later. */
const REQUIRED_TO_START = ["fullName", "phone"] as const;

const FIELD_STEP: Record<string, number> = { fullName: 0, phone: 0, cnic: 0, dateOfBirth: 0, gender: 0, qualification: 1, experience: 1, joiningDate: 1, specialization: 1, subjectSpecialties: 1, address: 2, city: 2, province: 2, postalCode: 2, emergencyContact: 2, emergencyPhone: 2 };

const FAILURE_MESSAGE: Record<string, string> = {
  INVALID: "Some details need correcting before your profile can be saved.",
  NOT_TEACHER: "This setup is only for teacher accounts.",
  SCHOOL_UNAVAILABLE: "Your school account is not available right now. Contact your school office.",
  FAILED: "Your profile could not be saved. Your answers are still here — try again.",
};

const GENDER_LABEL: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

const delay = (ms: number) => ({ "--sk-delay": `${ms}ms` }) as CSSProperties;

/** Same digit rule as the server: 7–15 digits, with +, spaces, dashes, dots or brackets. */
function validPhone(value: string) {
  const digits = value.match(/\d/g)?.length ?? 0;
  return /^\+?[\d\s().-]+$/.test(value.trim()) && digits >= 7 && digits <= 15;
}

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

/** Suggestions only — the field accepts any province, emirate or region. */
const PROVINCES = ["Punjab", "Sindh", "KPK", "Balochistan", "Islamabad", "AJK", "Gilgit-Baltistan", "Riyadh", "Makkah", "Eastern Province", "Dubai", "Abu Dhabi", "Sharjah"];

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
  const ui = useUiText();
  // The signed-in teacher's display language (SKO-458), not a pre-login choice: no language picker here.
  const { language } = useLocale();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<TeacherForm>(EMPTY_FORM);
  const [context, setContext] = useState<{ school: string; campus: string; email: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [done, setDone] = useState<{ readiness: TeacherReadiness; alreadyComplete: boolean } | null>(null);
  const submitting = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Structured teaching subjects. Free-text `specialization` reads nicely on a
  // profile but nothing can match on it — these drive the mismatch warning when
  // a teacher is booked onto a subject they don't teach.
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [teachesAll, setTeachesAll] = useState(false);
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Bumped on every failed save or validation pass, so the mascot reacts to a repeat too.
  const [errorSeq, setErrorSeq] = useState(0);
  const recovery = useFormDraft({ record: "onboarding:teacher", schema: 1, enabled: !loading && !done,
    values: { ...form, specialties, teachesAll }, baseline: { ...baseline, specialties: [] as string[], teachesAll: false },
    fields: ["fullName", "phone", "gender", "qualification", "specialization", "experience", "joiningDate", "city", "province", "specialties", "teachesAll"], section: String(step),
    apply: ({ specialties: nextSpecialties, teachesAll: nextAll, ...next }, savedStep) => { setForm(next); setSpecialties(nextSpecialties); setTeachesAll(nextAll); setStep(Math.min(STEPS.length - 1, Math.max(0, Number(savedStep) || 0))); },
  });

  const set = useCallback(
    <K extends keyof TeacherForm>(field: K, value: TeacherForm[K]) => {
      setForm((p) => ({ ...p, [field]: value }));
      setErrors((current) => {
        if (!current[field] && !current.profile) return current;
        const { [field]: _removed, profile: _summary, ...rest } = current;
        void _removed; void _summary;
        return rest;
      });
    },
    [],
  );

  useEffect(() => {
    const load = async () => {
      // A dropped request used to leave the spinner up for good; it now
      // offers a retry instead.
      let session: Awaited<ReturnType<typeof getTeacherOnboardingSession>>;
      try { session = await getTeacherOnboardingSession(); } catch {
        // Signed out mid-load: the proxy redirects the action, so it throws.
        const signedOut = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.status === 401 || r.status === 403).catch(() => false);
        if (signedOut) { router.replace('/login?redirect=/teacher-onboarding'); return; }
        setLoadFailed(true);
        return;
      }
      if (!session) { router.replace('/login?redirect=/teacher-onboarding'); return; }
      if (session.redirect) { router.replace(dashboardPathForRole(session.role)); return; }
      if (session.error || !session.user) { router.replace('/login?redirect=/teacher-onboarding'); return; }
      const initial = { ...EMPTY_FORM, fullName: session.user.fullName || '', phone: session.user.phone || '' };
      setForm(initial); setBaseline(initial);
      setContext({ school: session.school, campus: session.campus, email: session.user.email });
      setLoading(false);
    };
    load();
  }, [router, loadAttempt]);

  // Move focus to the new step's heading so keyboard and screen-reader users
  // land on what changed rather than on a button that no longer exists.
  const firstRender = useRef(true);
  useEffect(() => {
    if (loading) return;
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [step, loading, done]);

  const addSpecialty = (name: string) => {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    setSpecialties((cur) =>
      cur.some((x) => x.toLowerCase() === clean.toLowerCase()) || cur.length >= 30 ? cur : [...cur, clean],
    );
    setDraft("");
  };

  const fieldErrors = useMemo(() => {
    const next: Record<string, string> = {};
    if (form.fullName.trim().length < 2) next.fullName = "Name must be at least 2 characters";
    if (!validPhone(form.phone)) next.phone = "Enter a phone number with 7 to 15 digits";
    if (form.emergencyPhone.trim() && !validPhone(form.emergencyPhone)) next.emergencyPhone = "Enter a phone number with 7 to 15 digits";
    if (form.dateOfBirth && !(Date.parse(`${form.dateOfBirth}T00:00:00Z`) < Date.now())) next.dateOfBirth = "Enter a valid date in the past";
    return next;
  }, [form]);
  const canStep0 = !fieldErrors.fullName && !fieldErrors.phone;
  const canSubmit = Object.keys(fieldErrors).length === 0;

  // How complete the profile is — counts the fields colleagues actually look
  // for, so the bar means something rather than tracking screens visited.
  const completeness = useMemo(() => {
    const tracked = [
      form.fullName.trim().length >= 2,
      validPhone(form.phone),
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

  const showErrors = (next: Record<string, string>) => {
    const firstStep = Math.min(...Object.keys(next).map((field) => FIELD_STEP[field] ?? 0));
    setErrors({ profile: "Some details need correcting before your profile can be saved.", ...next });
    setErrorSeq((n) => n + 1);
    setStep(Number.isFinite(firstStep) ? firstStep : 0);
  };

  const goNext = () => {
    if (step === 0 && !canStep0) {
      showErrors({ ...(fieldErrors.fullName ? { fullName: fieldErrors.fullName } : {}), ...(fieldErrors.phone ? { phone: fieldErrors.phone } : {}) });
      return;
    }
    setErrors({});
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (step !== STEPS.length - 1) { goNext(); return; }
    // One submission in flight, whatever the number of clicks or Enter presses.
    if (saving || submitting.current) return;
    if (!canSubmit) { showErrors(fieldErrors); return; }
    submitting.current = true;
    setSaving(true);
    setFailure(null);
    try {
      const result = await completeTeacherOnboarding({
        ...form,
        // Keep the readable line in step with the structured list, so the
        // profile header and the matching logic never disagree.
        specialization: teachesAll
          ? "All subjects"
          : specialties.join(", ") || form.specialization.trim(),
        subjectSpecialties: teachesAll ? [] : specialties,
        teachesAllSubjects: teachesAll,
      });
      if (result.ok) {
        recovery.markSaved();
        setDone({ readiness: result.readiness, alreadyComplete: result.alreadyComplete });
        return;
      }
      if (result.code === "SESSION_EXPIRED") { setSessionExpired(true); return; }
      if (result.code === "INVALID" && result.fields) { showErrors(result.fields); return; }
      setFailure(FAILURE_MESSAGE[result.code] ?? FAILURE_MESSAGE.FAILED);
      setErrorSeq((n) => n + 1);
      requestAnimationFrame(() => statusRef.current?.focus());
    } catch {
      // Without a session the proxy redirects the action request, so it fails
      // here rather than returning SESSION_EXPIRED; ask the session endpoint.
      const signedOut = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.status === 401 || r.status === 403).catch(() => false);
      if (signedOut) { setSessionExpired(true); return; }
      // Network loss or a dropped response: nothing is known to have saved, and
      // a retry is safe because completion is idempotent on the server.
      setFailure(FAILURE_MESSAGE.FAILED);
      setErrorSeq((n) => n + 1);
      requestAnimationFrame(() => statusRef.current?.focus());
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  // One cover for loading and the form, so nothing jumps when the profile arrives.
  const cover = (
    <AuthCover
      eyebrow={ui("Almost there")}
      // Display line, not a heading: the step title in the form is the page's one h1.
      heading={{ light: ui("Your classroom"), strong: ui("is ready for you."), as: "p" }}
      body={ui("The subjects you list here are what the timetable builder matches against, so you are never quietly booked onto a class outside your field.")}
      art={<ProfilePreview form={form} specialties={specialties} teachesAll={teachesAll} completeness={completeness} />}
      footnote={ui("Your details stay inside your school")}
    />
  );
  const footer = <AuthColophon language={language} claims={["encrypted"]} />;

  if (loading && loadFailed) {
    return (
      <AuthShell language={language} layout="center" footer={footer}>
        <AuthMascot className="sk-enter mt-6" signals={{ error: `load:${loadAttempt}` }} />
        <div className="mt-7 flex justify-center">
          <ErrorState
            variant="page"
            title={ui("Your profile could not be opened")}
            onRetry={() => { setLoadFailed(false); setLoadAttempt((attempt) => attempt + 1); }}
          />
        </div>
      </AuthShell>
    );
  }

  if (loading) {
    // Same shape as the form beside the same cover, so nothing jumps when it arrives.
    return (
      <AuthShell language={language} cover={cover} footer={footer}>
        <AuthMascot className="sk-enter mt-6" signals={{ thinking: true }} />
        <SkeletonRegion label={ui("Loading your profile…")} className="mt-4 w-full">
          <Skeleton className="mx-auto h-4 w-56 rounded-full" />
          <div className="mb-6 mt-7 flex items-center gap-2 px-1">
            {STEPS.map((step) => <Skeleton key={step} className="h-6 flex-1 rounded-lg" />)}
          </div>
          <div className="sk-panel space-y-5 p-5 sm:p-9">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-8 w-2/3 rounded-xl" />
            <Skeleton className="h-4 w-full rounded-full" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="space-y-2">
                <Skeleton className="h-4 w-28 rounded-full" delay={row * 60} />
                <Skeleton className="h-12 w-full rounded-2xl" delay={row * 60} />
              </div>
            ))}
            <div className="flex justify-end pt-2"><Skeleton className="h-11 w-28 rounded-2xl" /></div>
          </div>
        </SkeletonRegion>
      </AuthShell>
    );
  }

  return (
    <AuthShell language={language} cover={cover} footer={footer}>
      {/* The one live face: watches the fields, thinks while saving, tosses its cap when the profile is saved. */}
      <AuthMascot
        className="sk-enter mt-6"
        signals={{
          error: errors.profile || failure ? `${errorSeq}:${failure ?? errors.profile}` : null,
          thinking: saving,
          celebrate: Boolean(done),
        }}
      />
      {context && (context.school || context.campus) ? (
        <p className="sk-enter mt-4 text-center text-sm font-medium text-ink-muted" style={delay(40)}>
          {ui("Teacher profile for {0}", [[context.school, context.campus].filter(Boolean).join(" · ")])}
        </p>
      ) : null}

      {sessionExpired ? (
        <div className="sk-panel sk-gradient-border sk-enter-scale mt-7 p-5 shadow-xl sm:p-9" role="alert" aria-labelledby="session-ended">
          <div aria-hidden="true" className="mb-5 grid size-12 place-items-center rounded-2xl border border-status-warning-border bg-status-warning-surface text-amber-700">
            <Shield className="size-5" />
          </div>
          <h1 id="session-ended" tabIndex={-1} ref={headingRef} className="text-2xl font-bold tracking-tight text-ink-strong outline-none">{ui("Your session has ended")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{ui("Nothing was saved. Sign in again to finish your profile.")}</p>
          <Button className="mt-6" onClick={() => window.location.assign("/login?redirect=/teacher-onboarding")}>{ui("Sign in again")}</Button>
        </div>
      ) : done ? (
        <ReadyPanel done={done} headingRef={headingRef} onOpen={(href) => { router.push(href); router.refresh(); }} />
      ) : (
      <>
      {/* Step rail */}
      {/* A container: in the Front Desk column only the current step is labelled (all four
          labels need ~42rem); every step button keeps its full "Step n of 4: …" name. */}
      <nav aria-label={ui("Profile steps")} className="@container sk-enter mb-6 mt-7 flex items-center gap-2 px-1" style={delay(70)}>
        {STEPS.map((label, i) => {
          const complete = step > i;
          const active = step === i;
          const reachable = i <= step || canStep0;
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <Button variant="ghost"
                type="button"
                onClick={() => { if (reachable) setStep(i); }}
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                aria-label={ui("Step {0} of {1}: {2}", [i + 1, STEPS.length, ui(label)])}
                className="justify-start px-1"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-2xs font-bold tabular-nums transition-all duration-300 ${
                    complete
                      ? "bg-emerald-500 text-white"
                      : active
                      ? "bg-gradient-to-br from-primary to-brand-400 text-white shadow-md shadow-primary/25"
                      : "bg-edge/25 text-ink-subtle"
                  }`}
                >
                  {complete ? <Check className="h-3 w-3" strokeWidth={3.5} /> : i + 1}
                </span>
                <span
                  className={`hidden whitespace-nowrap text-2xs font-semibold uppercase tracking-wider transition-colors ${
                    active ? "text-ink-strong @sm:block" : complete ? "text-emerald-600 @2xl:block" : "text-ink-subtle @2xl:block"
                  }`}
                >
                  {ui(label)}
                </span>
              </Button>
              {i < STEPS.length - 1 && (
                <span className="h-px flex-1 rounded-full bg-edge/30">
                  <span className={`block h-px rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500 ${complete ? "w-full" : "w-0"}`} />
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sk-enter sk-panel sk-gradient-border p-5 shadow-xl sm:p-9" style={delay(140)}>
        <div className="mb-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {ui("Step {0} of {1}", [step + 1, STEPS.length])}
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-ink-strong outline-none sm:text-3xl">{ui(STEPS[step])}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {ui(step === 0
              ? "How your name and number appear to staff and parents."
              : step === 1
              ? "What you're qualified to teach — used when subjects are assigned."
              : step === 2
              ? "Where you are, and who to call if something happens at school."
              : "Check your details. Only your name and phone are needed to start; the rest can be added later from your profile.")}
          </p>
          {step === 1 || step === 2 ? (
            <Badge variant="neutral" size="sm" className="mt-3">{ui("Optional — you can complete this later")}</Badge>
          ) : null}
        </div>

        <GuideCompanion language={language} role="TEACHER" title={launchCopy(language).journey("teacher")} hint={launchCopy(language).preparation("teacher")} />
        <form onSubmit={handleSubmit} noValidate aria-busy={saving}>
          <DraftRecovery recordLabel={ui("Teacher onboarding")} draft={recovery} saving={saving} excluded={ui("National ID, date of birth, home address and emergency contacts are not stored in device drafts.")} />
          <FormErrorSummary errors={Object.fromEntries(Object.entries(errors).map(([key, value]) => [key, ui(value)]))} onFocusField={(field) => { setStep(FIELD_STEP[field] ?? 0); requestAnimationFrame(() => document.getElementById(field === "dateOfBirth" ? "dob" : field)?.focus()); }} />
          {failure ? (
            <Alert ref={statusRef} tabIndex={-1} tone="danger" className="mb-4 outline-none">
              {ui(failure)}
            </Alert>
          ) : null}
          {/* Step 0 — Personal Info */}
          {step === 0 && (
            <div className="space-y-4">
              <Field
                label={ui("Full Name")} id="fullName" required icon={UserRound}
                value={form.fullName} placeholder={ui("Your official name")}
                onChange={(v) => set("fullName", v)}
                error={errors.fullName ? ui(errors.fullName) : form.fullName && fieldErrors.fullName ? ui(fieldErrors.fullName) : undefined}
              />
              <Field
                label={ui("Phone Number")} id="phone" required type="tel" icon={Phone}
                value={form.phone} placeholder="+92 300 1234567"
                onChange={(v) => set("phone", v)}
                hint={ui("Include the country code if you are outside the school's country.")}
                error={errors.phone ? ui(errors.phone) : form.phone && fieldErrors.phone ? ui(fieldErrors.phone) : undefined}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={ui("National ID")} id="cnic" value={form.cnic} placeholder={ui("CNIC, Emirates ID or Iqama")} onChange={(v) => set("cnic", v)}
                  tooltip={ui("Saved to your staff record only. It is not shown to parents and is not kept in device drafts.")} />
                <Field label={ui("Date of Birth")} id="dob" value={form.dateOfBirth} placeholder="" onChange={(v) => set("dateOfBirth", v)} type="date"
                  error={errors.dateOfBirth ? ui(errors.dateOfBirth) : fieldErrors.dateOfBirth ? ui(fieldErrors.dateOfBirth) : undefined} />
              </div>
              <SelectField label={ui("Gender")} id="gender" value={form.gender} onChange={(v) => set("gender", v)}>
                <option value="">{ui("Not specified")}</option>
                <option value="MALE">{ui("Male")}</option>
                <option value="FEMALE">{ui("Female")}</option>
                <option value="OTHER">{ui("Other")}</option>
              </SelectField>
            </div>
          )}

          {/* Step 1 — Professional */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SelectField label={ui("Qualification")} id="qualification" value={form.qualification} onChange={(v) => set("qualification", v)}>
                  <option value="">{ui("Select qualification")}</option>
                  {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                </SelectField>
                <Field label={ui("Experience")} id="experience" value={form.experience} placeholder={ui("e.g. 5 years")} onChange={(v) => set("experience", v)} />
              </div>

              <Field
                label={ui("Joining Date")} id="joiningDate" type="date" icon={GraduationCap}
                value={form.joiningDate} placeholder=""
                onChange={(v) => set("joiningDate", v)}
                hint={ui("The date your service at this school starts. Used for leave allocation and payroll.")}
              />

              {/* ── Teaching specialities ── */}
              <fieldset className="space-y-3 rounded-3xl border border-edge/25 bg-brand-50 p-4 sm:p-5">
                <legend className="sr-only">{ui("Subjects you teach")}</legend>
                <div className="flex items-center gap-2" aria-hidden>
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  <p className="text-2xs font-semibold uppercase tracking-wider text-primary">{ui("Subjects you teach")}</p>
                </div>
                <p className="text-xs leading-relaxed text-ink-muted">{ui("These record what you can teach. Classes and subjects are assigned by your school, not by this form.")}</p>

                <Button aria-pressed={teachesAll} variant="choice"
                  type="button"
                  onClick={() => setTeachesAll((v) => !v)}
                  className="w-full justify-start text-start"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                      teachesAll ? "border-emerald-500 bg-emerald-500" : "border-edge/50 bg-white"
                    }`}
                  >
                    {teachesAll ? <Check className="h-3 w-3 text-white" strokeWidth={3.5} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-strong">{ui("I can teach all subjects")}</span>
                    <span className="block text-xs font-normal text-ink-muted">
                      {ui("Generalist — never warned about a subject mismatch.")}
                    </span>
                  </span>
                </Button>

                {!teachesAll && (
                  <>
                    {specialties.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5" aria-label={ui("Subjects you teach")}>
                        {specialties.map((s) => (
                          <li
                            key={s}
                            className="sk-enter-scale inline-flex max-w-full items-center gap-1 rounded-full bg-primary py-0.5 ps-3 pe-0.5 text-xs font-semibold text-white shadow-sm shadow-primary/25"
                          >
                            <bdi className="min-w-0 truncate">{s}</bdi>
                            <IconButton
                              size="sm"
                              variant="ghost"
                              onClick={() => setSpecialties((cur) => cur.filter((x) => x !== s))}
                              className="focus-on-dark rounded-full text-white actionable-hover:bg-white/15 actionable-hover:text-white"
                              label={ui("Remove {0}", [s])}
                            >
                              <X aria-hidden="true" className="h-3 w-3" strokeWidth={3.5} />
                            </IconButton>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex gap-2">
                      <Input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter adds a subject; it must not submit the form.
                          if (e.key === "Enter") { e.preventDefault(); addSpecialty(draft); }
                        }}
                        aria-label={ui("Add a subject")}
                        placeholder={ui("Type a subject and press Enter")}
                        maxLength={60}
                        className={"flex-1"}
                      />
                      <IconButton
                        variant="default"
                        onClick={() => addSpecialty(draft)}
                        disabled={!draft.trim()}
                        label={ui("Add subject")}
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                      </IconButton>
                    </div>

                    <div className="flex flex-wrap gap-1.5 border-t border-edge/20 pt-3">
                      {SUGGESTED_SUBJECTS
                        .filter((s) => !specialties.some((x) => x.toLowerCase() === s.toLowerCase()))
                        .map((s) => (
                          <Button size="sm" variant="outline"
                            key={s}
                            type="button"
                            onClick={() => addSpecialty(s)}
                            aria-label={ui("Add {0}", [s])}
                            className="gap-1"
                          >
                            <Plus aria-hidden="true" />
                            {s}
                          </Button>
                        ))}
                    </div>
                  </>
                )}
              </fieldset>
            </div>
          )}

          {/* Step 2 — Address & Emergency */}
          {step === 2 && (
            <div className="space-y-4">
              <Field label={ui("Address")} id="address" icon={MapPin} value={form.address} placeholder={ui("Street address")} onChange={(v) => set("address", v)} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={ui("City")} id="city" value={form.city} placeholder={ui("City")} onChange={(v) => set("city", v)} />
                <Field label={ui("Province / region")} id="province" value={form.province} placeholder={ui("Province, emirate or region")} onChange={(v) => set("province", v)} list="province-options" />
                <datalist id="province-options">
                  {PROVINCES.map((p) => <option key={p} value={p} />)}
                </datalist>
              </div>
              <Field label={ui("Postal Code")} id="postalCode" value={form.postalCode} placeholder={ui("Postal code")} onChange={(v) => set("postalCode", v)} />

              <fieldset className="space-y-4 rounded-3xl border border-edge/25 bg-brand-50 p-4 sm:p-5">
                <legend className="sr-only">{ui("Emergency contact")}</legend>
                <div className="flex items-center gap-2" aria-hidden>
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  <p className="text-2xs font-semibold uppercase tracking-wider text-primary">{ui("Emergency contact")}</p>
                </div>
                <Field label={ui("Contact Person")} id="emergencyContact" value={form.emergencyContact} placeholder={ui("Who should we call?")} onChange={(v) => set("emergencyContact", v)} inputClassName="bg-white" />
                <Field label={ui("Contact Phone")} id="emergencyPhone" type="tel" value={form.emergencyPhone} placeholder={ui("Emergency phone number")} onChange={(v) => set("emergencyPhone", v)} inputClassName="bg-white"
                  error={errors.emergencyPhone ? ui(errors.emergencyPhone) : fieldErrors.emergencyPhone ? ui(fieldErrors.emergencyPhone) : undefined} />
              </fieldset>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <ReviewPanel
              rows={[
                { label: "Full Name", value: form.fullName.trim(), step: 0, required: true },
                { label: "Phone Number", value: form.phone.trim(), step: 0, required: true, ltr: true },
                { label: "Gender", value: form.gender ? ui(GENDER_LABEL[form.gender] ?? form.gender) : "", step: 0 },
                { label: "Qualification", value: form.qualification, step: 1 },
                { label: "Experience", value: form.experience.trim(), step: 1 },
                { label: "Subjects you teach", value: teachesAll ? ui("All subjects") : specialties.join(", "), step: 1 },
                { label: "City", value: form.city.trim(), step: 2 },
                { label: "Emergency contact", value: [form.emergencyContact.trim(), form.emergencyPhone.trim()].filter(Boolean).join(" · "), step: 2 },
              ]}
              privateCount={[form.cnic, form.dateOfBirth, form.address, form.postalCode].filter((v) => v.trim()).length}
              onEdit={(target) => setStep(target)}
            />
          )}

          {/* Navigation */}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            {step > 0 ? (
              <Button variant="secondary"
                type="button"
                onClick={() => { setErrors({}); setStep(step - 1); }}
                className="items-center gap-2 justify-start"
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
                {ui("Back")}
              </Button>
            ) : <div />}

            <div className="flex flex-wrap items-center gap-2">
              {step > 0 && step < STEPS.length - 1 ? (
                <Button variant="ghost" type="button" onClick={() => { setErrors({}); setStep(STEPS.length - 1); }}>
                  {ui("Skip to review")}
                </Button>
              ) : null}
              {step < STEPS.length - 1 ? (
                <Button variant="default"
                  key="next-step"
                  type="button"
                  onClick={goNext}
                  className="sk-nudge-trigger items-center gap-2 justify-start"
                >
                  {ui("Next")}
                  <ArrowRight className="sk-nudge h-4 w-4 rtl:rotate-180" aria-hidden />
                </Button>
              ) : (
                <Button variant="default"
                  key="complete-profile"
                  type="submit"
                  loading={saving}
                  className="items-center gap-2 justify-start"
                >
                  {ui("Complete Profile")}
                  {saving ? null : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Mobile completeness readout — the brand panel is hidden here. */}
      <div className="mt-5 flex items-center gap-3 px-1 lg:hidden">
        <Progress size="sm" value={completeness} label={ui("Profile completeness")} className="flex-1" />
        <span className="shrink-0 text-xs font-medium tabular-nums text-ink-muted">{ui("{0}% complete", [completeness])}</span>
      </div>
      </>
      )}
    </AuthShell>
  );
}

/**
 * The cover's payoff (lg+): a live preview of the profile card colleagues and
 * the timetable builder will see, on the Front Desk's white letterhead paper.
 * Plain text and one labelled meter: no focusables or live regions.
 */
function ProfilePreview({ form, specialties, teachesAll, completeness }: {
  form: TeacherForm;
  specialties: string[];
  teachesAll: boolean;
  completeness: number;
}) {
  const ui = useUiText();
  const name = form.fullName.trim();
  return (
    <div className="sk-letterhead">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-400 text-lg font-bold text-white shadow-sm shadow-primary/25">
          {name.charAt(0).toUpperCase() || "T"}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-lg font-semibold leading-snug ${name ? "text-ink-strong" : "text-ink-subtle"}`}>
            {name || ui("Your name")}
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-muted">
            {ui("Teacher")}{form.qualification ? ` · ${form.qualification}` : ""}
            {form.experience.trim() ? ` · ${form.experience.trim()}` : ""}
          </p>
        </div>
      </div>
      <div className="sk-letterhead-rule mt-5" />
      <div className="mt-4 flex flex-wrap gap-1.5">
        {teachesAll ? (
          <Badge variant="secondary" size="sm">{ui("All subjects")}</Badge>
        ) : specialties.length > 0 ? (
          specialties.slice(0, 5).map((s) => (
            <Badge key={s} variant="secondary" size="sm"><bdi className="min-w-0 truncate">{s}</bdi></Badge>
          ))
        ) : (
          <Badge variant="neutral" size="sm" className="border-dashed">{ui("Subjects you teach")}</Badge>
        )}
        {!teachesAll && specialties.length > 5 && (
          <Badge variant="neutral" size="sm" className="tabular-nums"><bdi>+{specialties.length - 5}</bdi></Badge>
        )}
      </div>
      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span id="brand-completeness-label" className="sk-eyebrow text-ink-muted">{ui("Profile completeness")}</span>
          <span className="text-xs font-semibold tabular-nums text-ink-strong"><bdi>{completeness}%</bdi></span>
        </div>
        {/* The lg+ meter; below lg the cover is hidden and the readout under the form takes over. */}
        <Progress size="sm" value={completeness} aria-labelledby="brand-completeness-label" />
      </div>
    </div>
  );
}

function ReviewPanel({ rows, privateCount, onEdit }: {
  rows: { label: string; value: string; step: number; required?: boolean; ltr?: boolean }[];
  privateCount: number;
  onEdit: (step: number) => void;
}) {
  const ui = useUiText();
  const later = rows.filter((row) => !row.required && !row.value).length;
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-edge/25 overflow-hidden rounded-3xl border border-edge/30 bg-white">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
            <div className="min-w-0">
              <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                {ui(row.label)} {row.required ? <span className="text-rose-500" aria-hidden>*</span> : null}
              </dt>
              <dd className="mt-0.5 break-words text-sm font-semibold text-ink-strong">
                {row.value ? <bdi dir={row.ltr ? "ltr" : undefined}>{row.value}</bdi> : <span className="font-medium text-ink-subtle">{ui("Add later")}</span>}
              </dd>
            </div>
            <Button variant="ghost" size="sm" type="button" onClick={() => onEdit(row.step)} aria-label={ui("Edit {0}", [ui(row.label)])} className="shrink-0">
              {ui("Edit")}
            </Button>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-ink-muted">
        {later > 0 ? ui("{0} optional details can be added later from your profile.", [later]) : ui("Every listed detail is filled in.")}
        {" "}
        {privateCount > 0 ? ui("{0} private details (ID, date of birth, address) are saved to your staff record and not shown to parents.", [privateCount]) : null}
      </p>
    </div>
  );
}

function ReadyPanel({ done, headingRef, onOpen }: {
  done: { readiness: TeacherReadiness; alreadyComplete: boolean };
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onOpen: (href: string) => void;
}) {
  const ui = useUiText();
  const { classTeacherOf, subjects, next } = done.readiness;
  const action = next.kind === "REGISTER" ? "Take today's register" : next.kind === "CLASSES" ? "Open your classes" : "Open your workspace";
  return (
    <div className="sk-panel sk-gradient-border sk-enter-scale mt-7 p-5 shadow-xl sm:p-9" role="status" aria-live="polite">
      <Badge variant="success" className="mb-3">
        <ClipboardCheck aria-hidden="true" />
        {ui(done.alreadyComplete ? "Already saved" : "Profile saved")}
      </Badge>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-ink-strong outline-none sm:text-3xl">{ui("You're ready to teach")}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        {ui(done.alreadyComplete ? "Your profile was already complete, so nothing was saved twice." : "Your profile is saved to your staff record.")}
      </p>

      <div className="mt-5 space-y-4">
        {classTeacherOf.length ? (
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{ui("Class teacher of")}</p>
            <p className="mt-1 text-sm font-semibold text-ink-strong"><bdi>{classTeacherOf.join(", ")}</bdi></p>
          </div>
        ) : null}
        {subjects.length ? (
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{ui("Subjects assigned to you")}</p>
            <ul className="mt-1 space-y-0.5 text-sm font-semibold text-ink-strong">
              {subjects.slice(0, 6).map((row) => <li key={`${row.className}:${row.subject}`}><bdi>{row.subject} · {row.className}</bdi></li>)}
            </ul>
            {subjects.length > 6 ? <p className="mt-1 text-xs text-ink-muted">{ui("And {0} more", [subjects.length - 6])}</p> : null}
          </div>
        ) : null}
        {next.kind === "UNASSIGNED" ? (
          <Alert tone="info" live="off">
            {ui("No classes are assigned to you yet. Your school office assigns classes and subjects; they will appear in your workspace as soon as they do.")}
          </Alert>
        ) : null}
      </div>

      <Button className="sk-nudge-trigger mt-6 items-center gap-2" onClick={() => onOpen(next.href)}>
        {ui(action)} <ArrowRight className="sk-nudge h-4 w-4 rtl:rotate-180" aria-hidden />
      </Button>
    </div>
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
  icon: Icon, error, hint, tooltip, inputClassName = "", list,
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
  tooltip?: string;
  inputClassName?: string;
  list?: string;
}) {
  // FormField owns the label, the error/hint ids and the aria wiring on the
  // nested input; the ids stay `id`, `${id}-error` and `${id}-hint`.
  return (
    <FormField name={id} id={id} label={label} required={required} error={error} hint={hint} tooltip={tooltip} className="min-w-0">
      <InputGroup surfaceClassName="bg-brand-50" className="group relative flex items-center">
        {Icon && (
          <Icon data-field-affix="start" className="pointer-events-none absolute start-3.5 h-4 w-4 text-ink-subtle transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-primary" />
        )}
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          list={list}
          dir={["email", "tel"].includes(type) ? "ltr" : undefined}
          className={`w-full ${inputClassName}`.trim()}
        />
      </InputGroup>
    </FormField>
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
    <FormField name={id} id={id} label={label} className="min-w-0">
      <SystemSelect
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={"w-full"}
      >
        {children}
      </SystemSelect>
    </FormField>
  );
}
