"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowRight, CheckCircle2, Info, KeyRound,
  Loader2, LockKeyhole, RotateCcw, ShieldCheck, Smartphone, Timer,
} from "lucide-react";
import { dashboardPathForRole } from "@/lib/roles";
import SkooleeLogo from "@/components/SkooleeLogo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { LanguageSelect } from "@/components/locale/LanguageSelect";
import { mfaCopy, mfaErrorText } from "@/components/auth/mfa/mfa-copy";
import { callMfaApi, toMfaRequestError } from "@/components/auth/mfa/mfa-client";
import { MfaStepper } from "@/components/auth/mfa/MfaStepper";
import { AuthenticatorSetup } from "@/components/auth/mfa/AuthenticatorSetup";
import { MfaCodeField } from "@/components/auth/mfa/MfaCodeField";
import { MfaMethodToggle } from "@/components/auth/mfa/MfaMethodToggle";
import { RecoveryCodesSheet, type RecoveryFeedback } from "@/components/auth/mfa/RecoveryCodesSheet";
import { directionFor } from "@/lib/locale/language-cookie";
import type { Language } from "@/lib/locale/package";
import { cn } from "@/lib/utils";

const en = {
  ...mfaCopy.en,
  language: "Language",
  brandEyebrow: "Account security",
  brandTitle: "Your school data, sealed with a second key.",
  brandBody: "Leaders handle fees, records and staff access. A code from your phone keeps that access yours, even if a password leaks.",
  brandPoints: ["Codes refresh every 30 seconds", "Each recovery code works once", "Works with any authenticator app"],
  brandFooter: "Encrypted at rest & in transit",
  title: "Protect your account",
  intro: "Add an authenticator app as a second step when you sign in. It takes about a minute.",
  challengeTitle: "Verify it's you",
  challengeIntro: "Enter the current code from your authenticator app to continue.",
  challengeRecoveryIntro: "Enter one of the unused recovery codes you saved to continue. Each code works once.",
  resumeNote: "You already started setup. Enter a code from your authenticator app, or a recovery code you saved, to finish.",
  progress: "Setup progress",
  steps: ["Scan or enter key", "Verify code", "Save recovery codes", "Done"],
  setup: "Set up authenticator",
  retry: "Start setup again",
  startOverHint: "Starting again replaces your authenticator entry and any recovery codes you saved.",
  finish: "Enter workspace",
  doneTitle: "Your account is protected",
  verifiedTitle: "Verified",
  doneBody: "Taking you to your workspace…",
  login: "Return to sign in",
  signInAgain: "Sign in again",
  checking: "Checking account…",
  tryAgain: "Try again",
  working: "Working…",
};
type Copy = typeof en;

const copy: Record<Language, Copy> = {
  en,
  ar: {
    ...mfaCopy.ar,
    language: "اللغة",
    brandEyebrow: "أمان الحساب",
    brandTitle: "بيانات مدرستك، محمية بمفتاح ثانٍ.",
    brandBody: "يدير القادة الرسوم والسجلات وصلاحيات الموظفين. رمز من هاتفك يُبقي هذا الوصول لك وحدك، حتى لو تسربت كلمة المرور.",
    brandPoints: ["تتجدد الرموز كل 30 ثانية", "يعمل كل رمز استرداد مرة واحدة", "يعمل مع أي تطبيق مصادقة"],
    brandFooter: "مشفّر أثناء التخزين والنقل",
    title: "حماية حسابك",
    intro: "أضف تطبيق مصادقة كخطوة ثانية عند تسجيل الدخول. يستغرق ذلك دقيقة تقريباً.",
    challengeTitle: "تأكيد هويتك",
    challengeIntro: "أدخل الرمز الحالي من تطبيق المصادقة للمتابعة.",
    challengeRecoveryIntro: "أدخل أحد رموز الاسترداد غير المستخدمة التي حفظتها للمتابعة. كل رمز يعمل مرة واحدة.",
    resumeNote: "لقد بدأت الإعداد مسبقاً. أدخل رمزاً من تطبيق المصادقة أو رمز استرداد حفظته لإكماله.",
    progress: "تقدم الإعداد",
    steps: ["امسح الرمز أو أدخل المفتاح", "تحقق من الرمز", "احفظ رموز الاسترداد", "تم"],
    setup: "إعداد تطبيق المصادقة",
    retry: "بدء الإعداد مجدداً",
    startOverHint: "البدء من جديد يستبدل حساب تطبيق المصادقة وأي رموز استرداد حفظتها.",
    finish: "الدخول إلى مساحة العمل",
    doneTitle: "حسابك محمي الآن",
    verifiedTitle: "تم التحقق",
    doneBody: "جارٍ نقلك إلى مساحة العمل…",
    login: "العودة لتسجيل الدخول",
    signInAgain: "سجّل الدخول مجدداً",
    checking: "جارٍ التحقق من الحساب…",
    tryAgain: "حاول مجدداً",
    working: "جارٍ التنفيذ…",
  },
  ur: {
    ...mfaCopy.ur,
    language: "زبان",
    brandEyebrow: "اکاؤنٹ کی حفاظت",
    brandTitle: "آپ کے اسکول کا ڈیٹا، ایک دوسری چابی سے محفوظ۔",
    brandBody: "منتظمین فیس، ریکارڈ اور عملے کی رسائی سنبھالتے ہیں۔ آپ کے فون کا کوڈ یہ رسائی صرف آپ کی رکھتا ہے، چاہے پاس ورڈ افشا ہو جائے۔",
    brandPoints: ["کوڈ ہر 30 سیکنڈ میں بدلتے ہیں", "ہر بحالی کوڈ صرف ایک بار چلتا ہے", "کسی بھی تصدیقی ایپ کے ساتھ کام کرتا ہے"],
    brandFooter: "محفوظ ڈیٹا اور منتقلی دونوں خفیہ کاری میں",
    title: "اپنے اکاؤنٹ کو محفوظ کریں",
    intro: "سائن ان کے دوسرے مرحلے کے طور پر تصدیقی ایپ شامل کریں۔ اس میں تقریباً ایک منٹ لگتا ہے۔",
    challengeTitle: "تصدیق کریں کہ یہ آپ ہیں",
    challengeIntro: "جاری رکھنے کے لیے اپنی تصدیقی ایپ کا موجودہ کوڈ درج کریں۔",
    challengeRecoveryIntro: "جاری رکھنے کے لیے اپنے محفوظ کیے گئے غیر استعمال شدہ بحالی کوڈز میں سے ایک درج کریں۔ ہر کوڈ صرف ایک بار کام کرتا ہے۔",
    resumeNote: "آپ پہلے ہی ترتیب شروع کر چکے ہیں۔ مکمل کرنے کے لیے تصدیقی ایپ کا کوڈ یا محفوظ کیا ہوا بحالی کوڈ درج کریں۔",
    progress: "ترتیب کی پیش رفت",
    steps: ["اسکین کریں یا کلید درج کریں", "کوڈ کی تصدیق", "بحالی کوڈ محفوظ کریں", "مکمل"],
    setup: "تصدیقی ایپ ترتیب دیں",
    retry: "ترتیب دوبارہ شروع کریں",
    startOverHint: "دوبارہ شروع کرنے سے تصدیقی ایپ کا اندراج اور آپ کے محفوظ کیے گئے بحالی کوڈ بدل جائیں گے۔",
    finish: "ورک اسپیس میں داخل ہوں",
    doneTitle: "آپ کا اکاؤنٹ محفوظ ہے",
    verifiedTitle: "تصدیق ہو گئی",
    doneBody: "آپ کو ورک اسپیس میں لے جا رہے ہیں…",
    login: "سائن ان پر واپس جائیں",
    signInAgain: "دوبارہ سائن ان کریں",
    checking: "اکاؤنٹ کی جانچ ہو رہی ہے…",
    tryAgain: "دوبارہ کوشش کریں",
    working: "کام جاری ہے…",
  },
};

type MfaStatus = { enrolled: boolean; school: string; awaitingAcknowledgement: boolean; resumeChallenge?: boolean };
type MfaResponse = {
  secret?: string; uri?: string; recoveryCodes?: string[]; success?: boolean; mfaRequired?: boolean;
  user?: { role: string; mustChangePassword?: boolean };
};
/** `field` errors belong to the code input; `page` errors stand alone above the current step. */
type MfaError = { reason?: string; message?: string; status?: number; scope: "page" | "field" };
type Feedback = "key" | RecoveryFeedback | null;

const MFA_URL = "/api/auth/mfa";

export default function ProtectAccount() {
  const router = useRouter();
  const { language, setLanguage, signInLanguage, clearExplicit } = useAuthLanguage();
  const t = copy[language];
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<MfaError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"enrolled" | "verified" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const recoveryInstructionsRef = useRef<HTMLHeadingElement>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    callMfaApi<MfaStatus>(MFA_URL, { cache: "no-store" }).then(data => {
      if (active) setStatus(data);
    }).catch(failure => {
      if (!active) return;
      const known = toMfaRequestError(failure);
      setError({ reason: known.reason, message: known.message, status: known.status, scope: "page" });
    }).finally(() => {
      if (active) setStatusLoading(false);
    });
    return () => { active = false; };
  }, [statusAttempt]);

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  const expired = error?.reason === "session_expired" || error?.status === 401;
  const challengeView = !!status && (status.enrolled || !!status.resumeChallenge) && !secret && codes.length === 0;

  useEffect(() => {
    if (!error) return;
    if (error.scope === "field" && !expired) codeRef.current?.focus();
    else errorRef.current?.focus();
  }, [error, expired]);

  useEffect(() => {
    if (codes.length > 0) recoveryInstructionsRef.current?.focus();
    else if (secret || challengeView) codeRef.current?.focus();
  }, [codes.length, secret, challengeView]);

  function announce(next: Feedback) {
    setFeedback(next);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2400);
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(secret);
      announce("key");
    } catch {
      announce("copyFailed");
    }
  }

  async function send(action: "setup" | "verify-setup" | "acknowledge" | "challenge") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await callMfaApi<MfaResponse>(MFA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the session-issuing actions carry the sign-in language (design §B.1.2).
        body: JSON.stringify({ action, code, recovery, acknowledged: ack, ...(action === "challenge" || action === "acknowledge" ? signInLanguage() : {}) }),
      });
      if ((action === "challenge" || action === "acknowledge") && data.success === true && !data.mfaRequired) clearExplicit();
      if (data.secret) { setSecret(data.secret); setUri(typeof data.uri === "string" ? data.uri : ""); setCodes([]); setAck(false); setCode(""); setRecovery(false); }
      if (data.recoveryCodes) { setCodes(data.recoveryCodes); setSecret(""); setUri(""); setCode(""); }
      if (data.user) {
        setDone(action === "acknowledge" ? "enrolled" : "verified");
        router.replace(data.user.mustChangePassword ? "/first-login" : dashboardPathForRole(data.user.role));
      }
    } catch (failure) {
      const known = toMfaRequestError(failure);
      setError({ reason: known.reason, message: known.message, status: known.status, scope: action === "challenge" || action === "verify-setup" ? "field" : "page" });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(challengeView ? "challenge" : "verify-setup");
  }

  function chooseMethod(next: boolean) {
    if (busy || next === recovery) return;
    setRecovery(next);
    setCode("");
    setError(null);
    codeRef.current?.focus();
  }

  /** A pasted, autofilled or typed recovery code switches to recovery mode instead of being cut to 6 digits. */
  function switchToRecovery(next: boolean) {
    setRecovery(next);
    setError(null);
  }

  const message = error ? mfaErrorText(t, error, recovery) : "";
  const fieldError = error?.scope === "field" && !expired ? message : undefined;
  const pageError = error && (error.scope === "page" || expired) ? message : "";
  const view = statusLoading ? "loading"
    : expired ? "expired"
      : done ? "done"
        : !status ? "failed"
          : codes.length > 0 ? "codes"
            : secret ? "scan"
              : challengeView ? "challenge" : "intro";
  const step = view === "codes" ? 2 : view === "done" ? 3 : view === "scan" && (code || error) ? 1 : 0;
  const heading = view === "challenge" ? t.challengeTitle : view === "codes" ? t.codesTitle
    : view === "done" ? (done === "verified" ? t.verifiedTitle : t.doneTitle) : t.title;
  const subheading = view === "challenge" ? (status?.resumeChallenge && !status.enrolled ? t.resumeNote : recovery ? t.challengeRecoveryIntro : t.challengeIntro)
    : view === "intro" || view === "loading" ? t.intro : view === "scan" ? t.scanBody : view === "codes" ? "" : view === "done" ? t.doneBody : "";
  const stepper = (current: number) => <MfaStepper labels={t.steps} current={current} progressLabel={t.progress} completedLabel={t.completed} />;

  const alert = pageError ? (
    <div id="mfa-error" ref={errorRef} tabIndex={-1} role="alert" className="sk-shake mb-5 flex items-start gap-2.5 rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 text-status-error-text">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-sm font-bold leading-snug">{pageError}</p>
    </div>
  ) : null;

  const codeField = (
    <MfaCodeField id="mfa-code" value={code} onChange={setCode} recovery={recovery} onRecoveryChange={switchToRecovery}
      allowRecovery={challengeView} readOnly={busy} inputRef={codeRef} error={fieldError}
      label={recovery ? t.recoveryLabel : view === "scan" ? t.codeLabelSetup : t.codeLabel}
      hint={recovery ? t.recoveryHint : t.codeHint} />
  );

  const submitButton = (
    <Button type="submit" size="lg" disabled={busy} aria-busy={busy} className="w-full">
      {busy ? <><Loader2 aria-hidden="true" className="motion-safe:animate-spin" />{t.verifying}</> : <>{t.verify}<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" /></>}
    </Button>
  );

  return (
    <main lang={language} dir={directionFor(language)} className="grid min-h-screen w-full grid-cols-1 bg-[#fff7fe] font-sans lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)] print:block print:bg-white">

      {/* ─── BRAND PANEL (matches /login) ─────────────────── */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8127cf] via-[#6f1fb8] to-[#4f1487] p-12 lg:flex xl:p-14 print:hidden">
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="sk-blob absolute -top-1/4 -start-1/5 h-[72%] w-[72%] rounded-full bg-[#9c48ea] opacity-70 blur-[90px]" />
          <div className="sk-blob sk-blob-2 absolute top-1/4 -end-1/4 h-[68%] w-[68%] rounded-full bg-[#b073f0] opacity-45 blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(255,255,255,.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.9)_1px,transparent_1px)] bg-[size:56px_56px]" />
        </div>

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="h-8 w-1 rounded-full bg-white/70" />
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">Skoolee AI</p>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
            <LockKeyhole aria-hidden="true" className="size-3.5 text-[#e9d5ff]" />
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#e9d5ff]">{t.brandEyebrow}</span>
          </div>
          <p className="mt-7 text-[2.6rem] font-black leading-[1.06] tracking-[-0.035em] text-white text-balance xl:text-[3.1rem]">{t.brandTitle}</p>
          <p className="mt-5 max-w-md text-[15px] font-semibold leading-relaxed text-white/85">{t.brandBody}</p>
          <ul className="mt-9 space-y-3 rounded-3xl border border-white/25 bg-[#3d0f6b]/40 p-6 shadow-xl backdrop-blur-xl">
            {t.brandPoints.map((point, index) => {
              const Icon = [Timer, KeyRound, Smartphone][index] ?? ShieldCheck;
              return (
                <li key={point} className="flex items-center gap-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20"><Icon aria-hidden="true" className="size-[18px] text-white" /></span>
                  <span className="text-[15px] font-bold text-white">{point}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative z-10 flex items-center gap-1.5 text-[11px] font-bold text-white/75">
          <ShieldCheck aria-hidden="true" className="size-3.5" /> {t.brandFooter}
        </p>
      </section>

      {/* ─── FORM PANEL ───────────────────────────────────── */}
      <section className="flex min-w-0 flex-col items-center px-4 py-6 sm:px-10 sm:py-10 lg:justify-center lg:p-14 print:p-0">
        <div className="w-full max-w-[32rem]">
          <div className="mb-6 flex justify-end print:hidden">
            <LanguageSelect id="mfa-language" label={t.language} value={language} onChange={value => { if (value) setLanguage(value); }} />
          </div>

          <div className="mb-7 flex flex-col items-center text-center">
            <SkooleeLogo size="min(2.35rem, 10vw)" weight="heavy" />
            <div aria-hidden="true" className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
            <h1 className="mt-6 text-[1.9rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23] text-balance">{heading}</h1>
            {subheading && <p className="mt-2 max-w-md text-[14.5px] font-semibold leading-relaxed text-ink-muted">{subheading}</p>}
            {status?.school && view !== "expired" && (
              <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#e3d5f0] bg-white px-3 py-1 text-xs font-bold text-[#7020b9]">
                <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{t.school}: <bdi>{status.school}</bdi></span>
              </p>
            )}
          </div>

          <div className="rounded-[30px] border border-[#cfc2d6]/30 bg-white p-5 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-8 print:border-0 print:p-0 print:shadow-none">
            {busy && <p role="status" className="sr-only">{t.working}</p>}
            <p aria-live="polite" className="sr-only">{feedback === "key" || feedback === "codes" ? t.copied : feedback === "download" ? t.downloaded : feedback === "copyFailed" ? t.copyFailed : ""}</p>

            {view === "loading" && (
              <div role="status" aria-busy="true" className="min-h-[22rem] space-y-5">
                <span className="sr-only">{t.checking}</span>
                <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="mx-auto size-9 rounded-full" delay={i * 60} />)}</div>
                <Skeleton className="h-5 w-2/3 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" delay={80} />
                <Skeleton className="h-16 w-full rounded-2xl" delay={140} />
                <Skeleton className="h-14 w-full rounded-2xl" delay={200} />
              </div>
            )}

            {view === "expired" && <>
              {alert}
              <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                {t.signInAgain}<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </>}

            {view === "failed" && <>
              {alert}
              <Button type="button" variant="outline" className="w-full" onClick={() => { setError(null); setStatusLoading(true); setStatusAttempt(attempt => attempt + 1); }}>
                <RotateCcw aria-hidden="true" />{t.tryAgain}
              </Button>
            </>}

            {view === "intro" && <>
              {stepper(0)}
              {alert}
              <div className="mb-6 flex items-start gap-3 rounded-2xl bg-[#faf5ff] p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-sm shadow-[#8127cf]/25"><Smartphone aria-hidden="true" className="size-5" /></span>
                <p className="text-sm font-semibold leading-relaxed text-ink-muted">{t.apps}</p>
              </div>
              <Button type="button" size="lg" className="w-full" disabled={busy} aria-busy={busy} onClick={() => send("setup")}>
                {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <ShieldCheck aria-hidden="true" />}
                {status?.awaitingAcknowledgement ? t.retry : t.setup}
              </Button>
            </>}

            {view === "scan" && <>
              {stepper(step)}
              <AuthenticatorSetup secret={secret} uri={uri} t={t} onCopy={() => void copyKey()} copied={feedback === "key"} />
              <div className="my-6 h-px bg-[#cfc2d6]/30" />
              <form onSubmit={submit} aria-busy={busy} className="space-y-5" noValidate>
                {codeField}
                {submitButton}
              </form>
              {error?.reason === "setup_expired" && (
                <Button type="button" variant="outline" className="mt-3 w-full" disabled={busy} onClick={() => send("setup")}><RotateCcw aria-hidden="true" />{t.retry}</Button>
              )}
            </>}

            {view === "challenge" && <>
              <form onSubmit={submit} aria-busy={busy} className="space-y-5" noValidate>
                <MfaMethodToggle recovery={recovery} onChange={chooseMethod} disabled={busy} t={t} />
                {codeField}
                {submitButton}
              </form>
              {status?.resumeChallenge && !status.enrolled && (
                <div className="mt-6 border-t border-[#cfc2d6]/25 pt-5">
                  <p id="mfa-start-over-hint" className="flex items-start gap-2 text-xs font-semibold leading-relaxed text-ink-muted"><Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{t.startOverHint}</p>
                  <Button type="button" variant="ghost" className="mt-2 w-full" disabled={busy} aria-describedby="mfa-start-over-hint" onClick={() => send("setup")}><RotateCcw aria-hidden="true" />{t.retry}</Button>
                </div>
              )}
            </>}

            {view === "codes" && <>
              {stepper(2)}
              <RecoveryCodesSheet codes={codes} schoolName={status?.school} ack={ack} onAck={setAck} t={t} disabled={busy}
                headingRef={recoveryInstructionsRef} feedback={feedback} onFeedback={announce} alert={alert}>
                <Button type="button" size="lg" className="mt-4 w-full" disabled={!ack || busy} aria-busy={busy} onClick={() => send("acknowledge")}>
                  {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : null}{t.finish}{busy ? null : <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}
                </Button>
              </RecoveryCodesSheet>
            </>}

            {view === "done" && <>
              {done === "enrolled" && stepper(3)}
              <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="sk-check-pop flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-[0_14px_30px_-12px_rgba(129,39,207,0.7)]">
                  <CheckCircle2 aria-hidden="true" className="size-8" />
                </span>
                <p className="text-base font-black text-[#1f1a23]">{done === "verified" ? t.verifiedTitle : t.doneTitle}</p>
                <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted"><Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />{t.doneBody}</p>
              </div>
            </>}
          </div>

          {view !== "expired" && view !== "done" && (
            <div className="mt-6 flex justify-center print:hidden">
              <Link href="/login" className="flex min-h-11 items-center px-2 text-sm font-bold text-[#8127cf] underline-offset-4 motion-safe:transition-colors hover:text-[#9c48ea] hover:underline">{t.login}</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
