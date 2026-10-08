'use client'
import { FieldAction, InputGroup } from "@/components/ui/input-group";


import React, { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Mail, Lock,
  User as UserIcon, Loader2,
  CheckCircle, ShieldCheck, XCircle,
  ArrowRight, Hash, Building,
  LucideIcon, Network, ChevronLeft, Sparkles,
  Eye, EyeOff, AlertCircle, Phone, Check, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import SkooleeLogo from "@/components/SkooleeLogo";
import AvatarOrbit from "@/components/auth/AvatarOrbit";
import LiveActivityTicker from "@/components/auth/LiveActivityTicker";
import { COUNTRIES, currencyForCountry, type Country } from "@/lib/locale/country";

type RegistrationType = 'school_group' | 'single_campus';

interface FormState {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  schoolName: string;
  country: Country;
  regId: string;
  autoId: boolean;
  acceptedTerms: boolean;
}

interface InputFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  icon: LucideIcon;
  type?: string;
  className?: string;
  required?: boolean;
  autoComplete?: string;
  error?: string;
  hint?: string;
  descriptionId?: string;
}

interface TypeOptionProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  title: string;
  desc: string;
}

const STEP_LABELS = ["Institution", "Your account", "Verify"];

/**
 * The brand panel says something different depending on what is being set up,
 * so the left half stays relevant to the choice rather than repeating one
 * generic pitch through the whole flow.
 */
const PANEL_COPY: Record<RegistrationType, { headline: string; accent: string; body: string; caption: string }> = {
  school_group: {
    headline: "Run every campus",
    accent: "from one login.",
    body: "Each branch keeps its own classes, fees and staff — sealed from the others — while the group office sees all of it in one roll-up.",
    caption: "Campus-level isolation, group-level visibility.",
  },
  single_campus: {
    headline: "Set up your school",
    accent: "with a clear plan.",
    body: "Start with up to 50 students, 2 teacher accounts, one campus and 100 AI credits per month. Compare the current plan limits before you register.",
    caption: "Unused AI credits expire at the calendar month reset.",
  },
};

/** Four-character suffix, uppercase, for a generated identity code. */
function randomSuffix() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function generateRegId(type: RegistrationType) {
  return `${type === 'school_group' ? 'SKL' : 'SC'}-${randomSuffix()}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<RegistrationType>('school_group');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const brandRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Subtle cursor-parallax on the brand panel's blobs and avatar orbit —
  // written straight to the DOM so it doesn't trigger React re-renders.
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

  const [formData, setFormData] = useState<FormState>({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    schoolName: '',
    country: "PK",
    regId: '',
    autoId: true,
    acceptedTerms: false,
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const passwordRequirements = useMemo(() => [
    { label: "Min 8 characters", met: formData.password.length >= 8 },
    { label: "One uppercase", met: /[A-Z]/.test(formData.password) },
    { label: "One number", met: /[0-9]/.test(formData.password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(formData.password) },
    { label: "Passwords match", met: formData.password === formData.confirmPassword && formData.password !== '' },
  ], [formData.password, formData.confirmPassword]);

  /**
   * Strength is scored on the four composition rules plus a length bonus, so a
   * long passphrase is not punished for skipping a symbol. "Passwords match" is
   * excluded — it says nothing about how strong the password is.
   */
  const strength = useMemo(() => {
    const composition = passwordRequirements.slice(0, 4).filter((r) => r.met).length;
    const lengthBonus = formData.password.length >= 14 ? 1 : 0;
    const score = formData.password ? Math.min(5, composition + lengthBonus) : 0;
    const labels = ["", "Very weak", "Weak", "Fair", "Strong", "Excellent"];
    const tones = [
      "bg-[#cfc2d6]/30",
      "bg-rose-400",
      "bg-orange-400",
      "bg-amber-400",
      "bg-emerald-400",
      "bg-emerald-500",
    ];
    return { score, label: labels[score], tone: tones[score] };
  }, [passwordRequirements, formData.password]);

  const emailError = touched.email && !EMAIL_PATTERN.test(formData.email)
    ? "Enter a valid email address"
    : undefined;
  const nameError = touched.name && formData.name.trim().length < 3
    ? "Enter your full name"
    : undefined;
  const schoolNameError = touched.schoolName && formData.schoolName.trim().length < 3
    ? "Institution name must be at least 3 characters"
    : undefined;
  const regIdError = touched.regId && formData.regId.trim().length < 3 ? "An institution ID is required." : undefined;
  const passwordError = touched.password && !passwordRequirements.slice(0, 4).every((rule) => rule.met)
    ? "Please meet all password requirements." : undefined;
  const confirmPasswordError = touched.confirmPassword && (!formData.confirmPassword || formData.password !== formData.confirmPassword)
    ? "Passwords must match." : undefined;

  const canSubmit =
    formData.name.trim().length >= 3 &&
    EMAIL_PATTERN.test(formData.email) &&
    formData.schoolName.trim().length >= 3 &&
    formData.regId.trim().length >= 3 &&
    passwordRequirements.every((r) => r.met) &&
    formData.acceptedTerms;

  const handleStep1 = () => {
    setStep(2);
    // Give the identity code a value the moment the type is known, so step 2
    // never opens with an empty required field.
    if (!formData.regId) set('regId', generateRegId(type));
  };

  const handleTypeChange = (next: RegistrationType) => {
    setType(next);
    // The prefix encodes the kind of institution, so a switch has to re-issue
    // the code rather than leave an SC- id on a school group.
    if (formData.autoId) set('regId', generateRegId(next));
  };

  const handleAutoId = (auto: boolean) => {
    setFormData((prev) => ({
      ...prev,
      autoId: auto,
      regId: auto ? generateRegId(type) : '',
    }));
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    setTouched({ name: true, email: true, schoolName: true, regId: true, password: true, confirmPassword: true });

    if (!canSubmit) {
      const firstProblem =
        formData.name.trim().length < 3 ? "Please enter your full name."
        : !EMAIL_PATTERN.test(formData.email) ? "Please enter a valid email address."
        : formData.schoolName.trim().length < 3 ? "Please enter your institution's name."
        : formData.regId.trim().length < 3 ? "An institution ID is required."
        : !passwordRequirements.every((r) => r.met) ? "Please meet all password requirements."
        : "Please accept the Terms of Service and Privacy Policy.";
      setFormError(firstProblem);
      const firstInvalidId =
        formData.name.trim().length < 3 ? "name"
        : !EMAIL_PATTERN.test(formData.email) ? "email"
        : formData.schoolName.trim().length < 3 ? "schoolName"
        : formData.regId.trim().length < 3 ? "regId"
        : !passwordRequirements.slice(0, 4).every((rule) => rule.met) ? "password"
        : formData.password !== formData.confirmPassword ? "confirmPassword"
        : "acceptedTerms";
      e.currentTarget.querySelector<HTMLElement>(`#${firstInvalidId}`)?.focus();
      return;
    }

    setLoading(true);
    try {
      const step1Res = await fetch("/api/auth/signup-step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.trim(),
          registrationType: type,
        }),
      });
      const step1 = await step1Res.json();
      if (!step1.success) throw new Error(step1.error || "Could not start registration");

      const step2Res = await fetch("/api/auth/signup-step2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.trim(),
          fullName: formData.name.trim(),
          phone: formData.phone.trim(),
          password: formData.password,
          schoolName: formData.schoolName.trim(),
          country: formData.country,
          regId: formData.regId.trim(),
        }),
      });
      const step2 = await step2Res.json();
      if (!step2.success) throw new Error(step2.error || "Registration failed");
      if (step2.warning) toast.warning(step2.warning, { duration: 15000 });

      setStep(3);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
      setFormError(message);
      requestAnimationFrame(() => errorRef.current?.focus());
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const panel = PANEL_COPY[type];

  /**
   * Step 2 is the long one. It gets a wider shell and a two-column layout so the
   * whole form lands on one laptop screen instead of scrolling; the brand panel
   * gives up some of its share to pay for it. Steps 1 and 3 stay narrow — two
   * radio cards and a success message stretched to 860px look broken.
   */
  const wide = step === 2;

  return (
    <main
      className={`sk-shell w-full min-h-screen grid grid-cols-1 bg-[#fff7fe] font-sans ${
        wide
          ? "lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,0.52fr)_minmax(0,1fr)]"
          : "lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)]"
      }`}
    >

      {/* ─── BRAND PANEL ─────────────────────────────── */}
      <section
        ref={brandRef}
        onMouseMove={handleBrandMouseMove}
        onMouseLeave={resetBrandParallax}
        className={`relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8127cf] via-[#6f1fb8] to-[#4f1487] ${
          wide ? "p-10 xl:p-12" : "p-12 xl:p-14"
        }`}
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
            className="sk-parallax absolute -bottom-1/3 left-1/5 h-[62%] w-[62%]"
            style={{ transform: "translate3d(calc(var(--mx, 0) * 16px), calc(var(--my, 0) * 16px), 0)" }}
          >
            <div className="sk-blob sk-blob-3 h-full w-full rounded-full bg-[#fbf0fe] opacity-[0.14] blur-[110px]" />
          </div>
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#fff7fe]/12 to-transparent" />
        </div>

        {/* Orbiting user avatars — echoes the "one login, every role" story
            with motion instead of another static line. */}
        <div
          className="sk-parallax absolute -top-14 -right-14 z-0"
          style={{ transform: "translate3d(calc(var(--mx, 0) * -12px), calc(var(--my, 0) * -12px), 0)" }}
        >
          <AvatarOrbit size={300} duration={44} className="opacity-90" />
        </div>

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="h-8 w-1 rounded-full bg-white/70" />
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">
            Skoolee AI
          </p>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="sk-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-[#e9d5ff]" />
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#e9d5ff]">
              Plan your account
            </span>
          </div>

          <h1
            key={`${type}-headline`}
            className={`sk-rise font-black leading-[1.04] tracking-[-0.035em] text-white text-balance ${
              wide ? "mt-6 text-[2.1rem] xl:text-[2.5rem]" : "mt-7 text-[2.6rem] xl:text-[3.1rem]"
            }`}
            style={{ animationDelay: "80ms" }}
          >
            {panel.headline}
            <br />
            <span className="bg-gradient-to-r from-[#e9d5ff] to-[#f0abfc] bg-clip-text text-transparent">
              {panel.accent}
            </span>
          </h1>

          <div
            key={`${type}-card`}
            className={`sk-rise rounded-3xl border border-white/25 bg-[#3d0f6b]/40 shadow-xl backdrop-blur-xl ${
              wide ? "mt-7 p-5" : "mt-9 p-6"
            }`}
            style={{ animationDelay: "160ms" }}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20">
                {type === 'school_group'
                  ? <Network className="h-5 w-5 text-white" />
                  : <Building2 className="h-5 w-5 text-white" />}
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-relaxed text-white">
                  {panel.body}
                </p>
                <p className="mt-2.5 text-xs font-bold text-[#e4c9f7]">
                  {panel.caption}
                </p>
              </div>
            </div>
          </div>

          <div className="sk-rise mt-6" style={{ animationDelay: "240ms" }}>
            <LiveActivityTicker />
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[11px] font-bold text-white/75">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Encrypted at rest &amp; in transit</span>
          <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5" /> Human-reviewed AI</span>
        </div>
      </section>

      {/* ─── FORM PANEL ──────────────────────────────── */}
      <section
        className={`relative flex flex-col items-center justify-center px-6 py-8 sm:px-10 sm:py-10 ${
          wide ? "lg:px-10 lg:py-6" : "lg:p-14"
        }`}
      >
        <div className={`sk-shell w-full ${wide ? "max-w-[860px]" : "max-w-lg"}`}>
          {wide ? (
            /* Share a row when there is room; stack on phones so the logo and
               progress rail do not set a minimum page width above the viewport. */
            <div className="sk-rise mb-4 flex flex-col items-center gap-3 sm:flex-row sm:gap-7">
              <SkooleeLogo size="1.85rem" weight="heavy" />
              <span aria-hidden className="hidden h-6 w-px shrink-0 bg-[#cfc2d6]/50 sm:block" />
              <StepRail step={step} className="mb-0 w-full flex-1" />
            </div>
          ) : (
            <>
              <div className="sk-rise mb-7 flex flex-col items-center">
                <SkooleeLogo size="2.35rem" weight="heavy" />
                <div className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
              </div>

              <StepRail step={step} />
            </>
          )}

          <AnimatePresence mode="wait">
            {/* ─── Step 1: Choose Type ─── */}
            {step === 1 && (
              <motion.div
                key="s1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-[30px] border border-[#cfc2d6]/30 bg-white p-8 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9"
              >
                <div className="mb-7 text-center">
                  <h2 className="text-[1.75rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23]">
                    How is your school set up?
                  </h2>
                  <p className="mt-2 text-[14.5px] font-semibold text-ink-muted">
                    Choose the option that best describes your institution.
                  </p>
                </div>

                <div className="space-y-3 mb-6" role="radiogroup" aria-label="Institution type" onKeyDown={(event) => {
                  const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                  if (!delta) return;
                  event.preventDefault();
                  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
                  const index = options.indexOf(document.activeElement as HTMLButtonElement);
                  const next = options[(index + delta + options.length) % options.length];
                  next?.focus();
                  next?.click();
                }}>
                  <TypeOption active={type === 'school_group'} onClick={() => handleTypeChange('school_group')} icon={Network} title="Multi-Campus School Group" desc="One school with multiple campuses or branches." />
                  <TypeOption active={type === 'single_campus'} onClick={() => handleTypeChange('single_campus')} icon={Building2} title="Single Campus School" desc="One school, one location — quick and simple." />
                </div>

                <p className="mb-5 flex items-start gap-2 rounded-2xl bg-[#fbf0fe] px-4 py-3 text-[11.5px] font-bold leading-snug text-ink-muted">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8127cf]" />
                  {type === 'school_group'
                    ? "You'll sign in as Super Admin and add each campus during setup."
                    : "You'll sign in as Campus Admin — your single campus is created for you."}
                </p>

                <Button
                  type="button"
                  onClick={handleStep1}
                  className="group mt-1 min-h-12 w-full"
                >
                  Continue <ArrowRight aria-hidden className="rtl:rotate-180" />
                </Button>

                <div className="mt-6 border-t border-[#cfc2d6]/20 pt-5 text-center">
                  <p className="text-sm font-semibold text-ink-muted">
                    Already have an account?{" "}
                    <Link href="/login" className="font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]">
                      Log in
                    </Link>
                  </p>
                </div>
              </motion.div>
            )}

            {/* ─── Step 2: Account Details ─── */}
            {step === 2 && (
              <motion.div
                key="s2"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="rounded-[30px] border border-[#cfc2d6]/30 bg-white p-6 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-7"
              >
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">
                      {type === 'school_group' ? 'Multi-Campus' : 'Single Campus'}
                    </p>
                    <h2 className="text-[1.6rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23] mt-0.5 sm:text-[1.75rem]">Create your account</h2>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => setStep(1)}
                    disabled={loading}
                    aria-label="Back to institution type"
                    className="shrink-0"
                  >
                    <ChevronLeft aria-hidden className="rtl:rotate-180" />
                  </Button>
                </div>

                {formError && (
                  <div
                    ref={errorRef}
                    role="alert"
                    tabIndex={-1}
                    className="sk-shake mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <p className="text-[13px] font-bold leading-snug text-rose-600">{formError}</p>
                  </div>
                )}

                {/* Four labelled groups laid out two-up once the card is wide
                    enough (container query, so it keys off the card and not the
                    viewport — the brand panel appearing at lg would otherwise
                    trigger columns with no room for them). The pairing is
                    deliberate: the two tall groups lead each row, so neither
                    row is padded out by a short neighbour. */}
                <form className="@container" onSubmit={handleStep2Submit} aria-busy={loading} noValidate>
                  <fieldset disabled={loading} className="min-w-0">
                  <div className="grid items-start gap-4 @2xl:grid-cols-2 @2xl:gap-x-7">

                    <FieldGroup icon={UserIcon} title="Your details">
                      <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
                        <InputField
                          id="name" label="Full Name" placeholder="Your full name" required
                          autoComplete="name" error={nameError}
                          onBlur={() => markTouched('name')}
                          value={formData.name} onChange={(v) => set('name', v)} icon={UserIcon}
                        />
                        <InputField
                          id="email" label="Work Email" placeholder="you@school.edu.pk" required type="email"
                          autoComplete="email" error={emailError}
                          onBlur={() => markTouched('email')}
                          value={formData.email} onChange={(v) => set('email', v)} icon={Mail}
                        />
                      </div>

                      <InputField
                        id="phone" label="Phone Number" placeholder="+92 300 0000000" type="tel"
                        autoComplete="tel" hint="Used for account recovery and parent-facing contact."
                        value={formData.phone} onChange={(v) => set('phone', v)} icon={Phone}
                      />
                    </FieldGroup>

                    {/* Institution identity. Previously the single-campus path
                        invented a name ("<your name> Academy") and a hidden ID,
                        which is not something a school can live with — both are
                        asked for here regardless of type. */}
                    <FieldGroup icon={Building} title="Your institution">
                      <InputField
                        id="schoolName"
                        label={type === 'school_group' ? "School Group Name" : "School Name"}
                        placeholder={type === 'school_group' ? "e.g. Beaconhouse School System" : "e.g. Horizon Academy"}
                        required error={schoolNameError} autoComplete="organization"
                        onBlur={() => markTouched('schoolName')}
                        value={formData.schoolName} onChange={(v) => set('schoolName', v)}
                        icon={Building}
                      />
                      <FormField name="country" id="country" label="Institution country" hint={`Default billing currency: ${currencyForCountry(formData.country)}. Prices keep their published currency; no conversion is applied.`}>
                        <Select
                          id="country"
                          value={formData.country}
                          onChange={(event) => set("country", event.target.value as Country)}
                        >
                          {COUNTRIES.map((country) => <option key={country} value={country}>{({ PK: "Pakistan", SA: "Saudi Arabia", AE: "United Arab Emirates", KW: "Kuwait", OTHER: "Other" })[country]}</option>)}
                        </Select>
                      </FormField>
                      <div className="space-y-1.5 rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe] p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                          <Label htmlFor="regId" className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">
                            {type === 'school_group' ? 'School Group ID' : 'School ID'}
                          </Label>
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant={formData.autoId ? "default" : "outline"}
                              onClick={() => handleAutoId(true)}
                              aria-pressed={formData.autoId}
                              className="min-w-11"
                            >
                              Auto
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={!formData.autoId ? "default" : "outline"}
                              onClick={() => handleAutoId(false)}
                              aria-pressed={!formData.autoId}
                              className="min-w-11"
                            >
                              Manual
                            </Button>
                          </div>
                        </div>
                        <FormField name="regId" id="regId" required error={regIdError} hint="Printed on report cards, invoices and receipts. It cannot be changed later.">
                        <InputGroup surfaceClassName="bg-white">
                          <Hash aria-hidden data-field-affix="start" className="h-4 w-4 text-[#8127cf]/40" />
                          <Input
                            id="regId"
                            readOnly={formData.autoId}
                            value={formData.regId}
                            placeholder={type === 'school_group' ? "SKL-XXXX" : "SC-XXXX"}
                            onChange={e => set('regId', e.target.value.toUpperCase())}
                            onBlur={() => markTouched('regId')}
                            className="font-bold tracking-wide"
                          />
                          {formData.autoId && (
                            <FieldAction data-field-affix="end"
                              type="button"
                              onClick={() => set('regId', generateRegId(type))}
                              aria-label="Generate a new ID"
                              className="text-ink-subtle"
                            >
                              <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                            </FieldAction>
                          )}
                        </InputGroup>
                        </FormField>
                      </div>
                    </FieldGroup>

                    <FieldGroup icon={Lock} title="Security">
                      <InputField
                        id="password" label="Password" placeholder="Min 8 characters" required
                        autoComplete="new-password"
                        error={passwordError} onBlur={() => markTouched('password')}
                        descriptionId="registration-password-rules"
                        type={showPass ? "text" : "password"}
                        value={formData.password} onChange={(v) => set('password', v)} icon={Lock}
                        onToggleReveal={() => setShowPass((v) => !v)}
                        revealed={showPass}
                        onCapsChange={setCapsOn}
                      />
                      <InputField
                        id="confirmPassword" label="Confirm Password" placeholder="Re-enter password" required
                        autoComplete="new-password"
                        error={confirmPasswordError} onBlur={() => markTouched('confirmPassword')}
                        descriptionId="registration-password-rules"
                        type={showConfirm ? "text" : "password"}
                        value={formData.confirmPassword} onChange={(v) => set('confirmPassword', v)} icon={ShieldCheck}
                        onToggleReveal={() => setShowConfirm((v) => !v)}
                        revealed={showConfirm}
                      />

                      {capsOn && (
                        <p className="flex items-center gap-1.5 px-1 text-xs font-bold text-amber-600">
                          <AlertCircle className="h-3.5 w-3.5" /> Caps Lock is on
                        </p>
                      )}
                    </FieldGroup>

                    {/* Sits beside the password fields rather than under them, so
                        the checklist is readable while the field is being typed
                        in instead of being pushed off the fold. */}
                    <FieldGroup icon={ShieldCheck} title="Password strength">
                      <div className="space-y-3 rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe] p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-1 gap-1.5" aria-hidden>
                            {[1, 2, 3, 4, 5].map((i) => (
                              <span
                                key={i}
                                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                                  i <= strength.score ? strength.tone : "bg-[#cfc2d6]/30"
                                }`}
                              />
                            ))}
                          </div>
                          <p className={`shrink-0 text-[10px] font-black uppercase tracking-wider ${
                            strength.score >= 4 ? "text-emerald-600" : strength.score >= 3 ? "text-amber-600" : strength.score > 0 ? "text-rose-500" : "text-ink-subtle"
                          }`}>
                            {strength.label || "—"}
                          </p>
                        </div>
                        <div id="registration-password-rules" className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {passwordRequirements.map((r) => (
                            <div key={r.label} className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors ${r.met ? 'text-emerald-600' : 'text-ink-subtle'}`}>
                              {r.met ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0 opacity-30" />} {r.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </FieldGroup>

                    {/* Consent and the actions share the closing line — a full
                        row each was ~50px of height for one checkbox. */}
                    <div className="flex flex-col gap-4 border-t border-[#cfc2d6]/20 pt-4 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-6 @2xl:col-span-2">
                      {/* Explicit consent. Required — a school signing up is agreeing
                          on behalf of its pupils' data, so it cannot be implied. */}
                      <label className="group flex cursor-pointer items-start gap-2.5 px-1 select-none">
                        <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                          <input
                            id="acceptedTerms"
                            type="checkbox"
                            checked={formData.acceptedTerms}
                            onChange={(e) => set('acceptedTerms', e.target.checked)}
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden
                            className={`flex h-[18px] w-[18px] items-center justify-center rounded-[7px] border-2 transition-all duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${
                              formData.acceptedTerms
                                ? "border-[#8127cf] bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-sm shadow-[#8127cf]/30"
                                : "border-[#cfc2d6]/70 bg-white group-hover:border-[#8127cf]/50"
                            }`}
                          >
                            <Check
                              className={`h-3 w-3 text-white transition-all duration-200 ${
                                formData.acceptedTerms ? "scale-100 opacity-100" : "scale-50 opacity-0"
                              }`}
                              strokeWidth={3.5}
                            />
                          </span>
                        </span>
                        <span className="text-[12px] font-semibold leading-snug text-ink-muted">
                          I agree to the{" "}
                          <Link href="/privacy" target="_blank" className="font-black text-[#8127cf] hover:text-[#9c48ea]">Privacy Policy</Link>
                          {" "}and{" "}
                          <Link href="/ai-governance" target="_blank" className="font-black text-[#8127cf] hover:text-[#9c48ea]">AI Governance policy</Link>
                          , and confirm I&apos;m authorised to register this institution.
                        </span>
                      </label>
                      <div className="flex shrink-0 gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setStep(1)}
                          aria-label="Back"
                          className="h-12 w-12 shrink-0"
                        >
                          <ChevronLeft aria-hidden className="rtl:rotate-180" />
                        </Button>
                        <Button
                          type="submit"
                          disabled={loading}
                          aria-busy={loading}
                          className="min-h-12 flex-1 @xl:flex-none @xl:w-52"
                        >
                          {loading
                            ? <><Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> Creating account…</>
                            : <>Create Account <ArrowRight aria-hidden className="rtl:rotate-180" /></>}
                        </Button>
                      </div>
                    </div>
                  </div>
                  </fieldset>
                </form>
              </motion.div>
            )}

            {/* ─── Step 3: Success ─── */}
            {step === 3 && (
              <motion.div
                key="s3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-[30px] border border-emerald-100/50 bg-white p-8 text-center shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9"
              >
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[24px] bg-emerald-50 text-emerald-500 shadow-inner">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h2 className="mb-2 text-2xl font-black tracking-tight text-[#1f1a23]">Account created!</h2>
                <p className="mb-6 px-2 text-sm font-semibold leading-relaxed text-ink-muted">
                  We&apos;ve sent a verification link to{" "}
                  <span className="font-black text-[#1f1a23]">{formData.email}</span>.
                  Click it to activate your account, then log in to finish setting up{" "}
                  <span className="font-black text-[#1f1a23]">{formData.schoolName}</span>.
                </p>

                {/* What actually happens next, so the wait is not a black box. */}
                <div className="mb-7 space-y-2.5 rounded-3xl border border-[#cfc2d6]/20 bg-[#fbf0fe] p-5 text-left">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">What happens next</p>
                  {[
                    "Verify your email address",
                    type === 'school_group'
                      ? "Add your campuses, session dates and working days"
                      : "Add your campus details, session dates and working days",
                    "Invite staff and import your student roster",
                  ].map((line, i) => (
                    <div key={line} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-black text-[#8127cf] shadow-sm">
                        {i + 1}
                      </span>
                      <span className="text-[12px] font-bold text-ink-muted">{line}</span>
                    </div>
                  ))}
                </div>

                <Link href="/login" className={buttonVariants({ className: "min-h-12 w-full" })}>
                  Go to Login <ArrowRight aria-hidden className="rtl:rotate-180" />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`flex items-center justify-center gap-5 text-[11px] font-bold text-ink-subtle ${wide ? "mt-4" : "mt-6"}`}>
            <Link href="/privacy" className="transition-colors hover:text-[#8127cf]">Privacy</Link>
            <span className="h-3 w-px bg-[#cfc2d6]/50" />
            <Link href="/security" className="transition-colors hover:text-[#8127cf]">Security</Link>
            <span className="h-3 w-px bg-[#cfc2d6]/50" />
            <Link href="/ai-governance" className="transition-colors hover:text-[#8127cf]">AI Governance</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

/** Three-stop progress rail above the card, so the flow's length is visible. */
function StepRail({ step, className = "mb-6" }: { step: number; className?: string }) {
  return (
    <div role="list" aria-label="Registration progress" className={`flex items-center gap-2 px-1 ${className}`}>
      {STEP_LABELS.map((label, i) => {
        const num = i + 1;
        const done = step > num;
        const active = step === num;
        return (
          <React.Fragment key={label}>
            <div role="listitem" aria-current={active ? "step" : undefined} aria-label={`Step ${num} of ${STEP_LABELS.length}: ${label}`} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black transition-all duration-300 ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                    ? "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-md shadow-[#8127cf]/25"
                    : "bg-[#cfc2d6]/25 text-ink-subtle"
                }`}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3.5} /> : num}
              </span>
              <span
                className={`hidden text-[10px] font-black uppercase tracking-wider transition-colors sm:block ${
                  active ? "text-[#1f1a23]" : done ? "text-emerald-600" : "text-ink-subtle"
                }`}
              >
                {label}
              </span>
            </div>
            {num < STEP_LABELS.length && (
              <span className="h-px flex-1 rounded-full bg-[#cfc2d6]/30">
                <span
                  className={`block h-px rounded-full bg-gradient-to-r from-[#8127cf] to-emerald-500 transition-all duration-500 ${
                    done ? "w-full" : "w-0"
                  }`}
                />
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * A titled block of related fields. Two-up, a bare 2x2 grid of inputs reads as
 * noise, so each half announces what it is asking for. Its own `@container` lets
 * the fields inside react to the column width rather than the whole card's — a
 * name/email pair splits when the group is full-width and stacks when it is a
 * column.
 */
function FieldGroup({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  // The heading is only a visual cue unless it names the group, and side-by-side
  // columns are exactly where a screen reader loses the thread.
  const headingId = `grp-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section role="group" aria-labelledby={headingId} className="@container space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#8127cf]" />
        <h3 id={headingId} className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8127cf]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function TypeOption({ active, onClick, icon: Icon, title, desc }: TypeOptionProps) {
  return (
    <Button variant="choice"
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className="relative group flex w-full items-center justify-start gap-5 overflow-hidden p-5 text-start"
    >
      <div className={`rounded-2xl p-3 transition-all duration-200 group-hover:scale-105 ${active ? 'bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-lg shadow-[#8127cf]/20' : 'bg-white text-ink-subtle group-hover:bg-[#8127cf]/5 group-hover:text-[#8127cf]'}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <h3 className="text-left text-sm font-black tracking-tight text-[#1f1a23]">{title}</h3>
        <p className="mt-1 text-left text-[11px] font-semibold leading-tight text-ink-muted">{desc}</p>
      </div>
      {active && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#8127cf] p-1 text-white shadow-md">
          <CheckCircle className="h-3 w-3" />
        </motion.div>
      )}
    </Button>
  );
}

function InputField({
  id, label, placeholder, value, onChange, icon: Icon, type = "text", className = "",
  required, autoComplete, error, hint, descriptionId, onBlur, onToggleReveal, revealed, onCapsChange,
}: InputFieldProps & {
  onToggleReveal?: () => void;
  revealed?: boolean;
  onCapsChange?: (on: boolean) => void;
}) {
  const trackCaps = onCapsChange
    ? (e: React.KeyboardEvent<HTMLInputElement>) => onCapsChange(e.getModifierState?.("CapsLock") ?? false)
    : undefined;

  return (
    <FormField name={id} id={id} label={label} required={required} error={error} hint={hint}>
      <InputGroup>
        <Icon aria-hidden data-field-affix="start" className="h-4 w-4 text-ink-subtle group-focus-within:text-primary" />
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          required={required}
          autoComplete={autoComplete}
          aria-describedby={descriptionId}
          onChange={e => onChange(e.target.value)}
          onKeyUp={trackCaps}
          onKeyDown={trackCaps}
          onBlur={() => { onBlur?.(); onCapsChange?.(false); }}
          className={className}
        />
        {onToggleReveal && (
          <FieldAction data-field-affix="end"
            type="button"
            onClick={onToggleReveal}
            aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-controls={id}
            aria-pressed={Boolean(revealed)}
            className="text-ink-subtle"
          >
            {revealed ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
          </FieldAction>
        )}
      </InputGroup>
    </FormField>
  );
}
