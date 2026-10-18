'use client';
import { FieldAction, InputGroup } from "@/components/ui/input-group";
import { useState, useEffect, useEffectEvent, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "@/components/ui/toast";
import { requestPasswordReset, resetPassword, verifyToken } from "@/app/actions/auth/reset";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError, FormField } from "@/components/ui/form-field";
import {
  Loader2, ArrowLeft, ArrowRight, Mail, Lock, CheckCircle2, AlertCircle, AlertTriangle,
  CheckCircle, XCircle, ShieldCheck, Eye, EyeOff, Sparkles, KeyRound, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import SkooleeLogo from "@/components/SkooleeLogo";
import Link from "next/link";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { directionFor } from "@/lib/locale/language-cookie";
import type { Language } from "@/lib/locale/package";

const requestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const UNMET = "Please satisfy all security requirements.";

const en = {
  eyebrow: "Account recovery",
  brandLine1: "Regain access to",
  brandLine2: "your",
  brandHighlight: " campus.",
  brandBody: "A secure, unique recovery link is sent only to your registered email. It expires quickly and is verified before any change.",
  brandNote: "We never store or reveal your credentials in plain text.",
  encrypted: "Encrypted at rest & in transit",
  singleUse: "Single-use recovery links",
  requestTitle: "Recover account",
  requestIntro: "We'll email you a single-use recovery link.",
  email: "Email Identity",
  sending: "Sending…",
  send: "Send reset link",
  inboxTitle: "Check your inbox",
  inboxBody: "If an eligible account exists, a single-use link will be sent. Check your inbox and spam folder. If it does not arrive, try again in five minutes or contact your school administrator.",
  backToLogin: "Back to login",
  expiredTitle: "Link expired",
  expiredBody: "This recovery link has reached its expiration or has already been used. Request a fresh one to continue.",
  requestNew: "Request new link",
  errorTitle: "Unable to verify link",
  errorBody: "We couldn't check this recovery link. Please try again.",
  tryAgain: "Try again",
  verifying: "Verifying link…",
  resetTitle: "New password",
  resetIntro: "Choose a new password for your Skoolee account.",
  newPassword: "New Password",
  showNew: "Show new password",
  hideNew: "Hide new password",
  confirmPassword: "Confirm Password",
  showConfirm: "Show confirmed password",
  hideConfirm: "Hide confirmed password",
  checklist: "Security checklist",
  met: "Met: ",
  notMet: "Not yet met: ",
  saving: "Saving…",
  save: "Save new password",
  remembered: "Remembered it? Back to sign in",
  requirements: ["Min 8 characters", "One uppercase", "One number", "Special character", "Passwords match"] as const,
  linkInvalid: "Your recovery link has expired or is invalid.",
  linkSent: "Request received. If an account uses this email, a recovery link is on its way.",
  sendFailed: "Unable to send a recovery link. Please try again.",
  updated: "Password updated. Sign in with your new password.",
  saveFailed: "Unable to save your password. Please try again.",
  /** English validation sources → localized text. Server messages pass through unchanged. */
  messages: {} as Record<string, string>,
};
type RecoveryCopy = Omit<typeof en, "requirements"> & { requirements: readonly [string, string, string, string, string] };

const copy: Record<Language, RecoveryCopy> = {
  en,
  ar: {
    eyebrow: "استعادة الحساب",
    brandLine1: "استعد الوصول إلى",
    brandLine2: "",
    brandHighlight: " فرعك.",
    brandBody: "يُرسل رابط استعادة آمن وفريد إلى بريدك المسجّل فقط. تنتهي صلاحيته بسرعة ويُتحقق منه قبل أي تغيير.",
    brandNote: "لا نخزّن بيانات اعتمادك ولا نكشفها كنص واضح أبداً.",
    encrypted: "مشفّر أثناء التخزين والنقل",
    singleUse: "روابط استعادة لاستخدام واحد",
    requestTitle: "استعادة الحساب",
    requestIntro: "سنرسل إليك رابط استعادة صالحاً لمرة واحدة.",
    email: "البريد الإلكتروني",
    sending: "جارٍ الإرسال…",
    send: "إرسال رابط إعادة التعيين",
    inboxTitle: "تحقق من بريدك",
    inboxBody: "إذا كان هناك حساب مؤهل، فسيُرسل رابط صالح لمرة واحدة. تحقق من بريدك الوارد ومجلد الرسائل غير المرغوب فيها. إذا لم يصل، فحاول مجدداً بعد خمس دقائق أو تواصل مع مسؤول مدرستك.",
    backToLogin: "العودة لتسجيل الدخول",
    expiredTitle: "انتهت صلاحية الرابط",
    expiredBody: "انتهت صلاحية رابط الاستعادة هذا أو استُخدم من قبل. اطلب رابطاً جديداً للمتابعة.",
    requestNew: "طلب رابط جديد",
    errorTitle: "تعذر التحقق من الرابط",
    errorBody: "لم نتمكن من فحص رابط الاستعادة هذا. حاول مجدداً.",
    tryAgain: "حاول مجدداً",
    verifying: "جارٍ التحقق من الرابط…",
    resetTitle: "كلمة مرور جديدة",
    resetIntro: "اختر كلمة مرور جديدة لحسابك في Skoolee.",
    newPassword: "كلمة المرور الجديدة",
    showNew: "إظهار كلمة المرور الجديدة",
    hideNew: "إخفاء كلمة المرور الجديدة",
    confirmPassword: "تأكيد كلمة المرور",
    showConfirm: "إظهار كلمة المرور المؤكدة",
    hideConfirm: "إخفاء كلمة المرور المؤكدة",
    checklist: "قائمة التحقق الأمنية",
    met: "مكتمل: ",
    notMet: "غير مكتمل بعد: ",
    saving: "جارٍ الحفظ…",
    save: "حفظ كلمة المرور الجديدة",
    remembered: "تذكرتها؟ العودة لتسجيل الدخول",
    requirements: ["٨ أحرف على الأقل", "حرف كبير واحد", "رقم واحد", "رمز خاص", "كلمتا المرور متطابقتان"],
    linkInvalid: "انتهت صلاحية رابط الاستعادة أو أنه غير صالح.",
    linkSent: "تم استلام الطلب. إذا كان هناك حساب بهذا البريد، فرابط الاستعادة في طريقه إليك.",
    sendFailed: "تعذر إرسال رابط الاستعادة. حاول مجدداً.",
    updated: "تم تحديث كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.",
    saveFailed: "تعذر حفظ كلمة المرور. حاول مجدداً.",
    messages: {
      "Invalid email address": "عنوان البريد الإلكتروني غير صالح",
      "Password must be at least 8 characters": "يجب أن تتكون كلمة المرور من ٨ أحرف على الأقل",
      "Passwords don't match": "كلمتا المرور غير متطابقتين",
      [UNMET]: "استوفِ جميع متطلبات الأمان.",
      "Invalid or expired link. Request a new link.": "الرابط غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.",
      "Use a password between 8 and 72 characters": "استخدم كلمة مرور بين 8 و72 حرفاً",
      "Wait five minutes before trying again": "انتظر خمس دقائق قبل المحاولة مجدداً",
    },
  },
  ur: {
    eyebrow: "اکاؤنٹ کی بحالی",
    brandLine1: "اپنے کیمپس تک",
    brandLine2: "",
    brandHighlight: " دوبارہ رسائی حاصل کریں۔",
    brandBody: "ایک محفوظ اور منفرد بحالی لنک صرف آپ کی رجسٹرڈ ای میل پر بھیجا جاتا ہے۔ اس کی مدت جلد ختم ہو جاتی ہے اور ہر تبدیلی سے پہلے اس کی تصدیق ہوتی ہے۔",
    brandNote: "ہم آپ کی اسناد کبھی سادہ متن میں محفوظ یا ظاہر نہیں کرتے۔",
    encrypted: "محفوظ شدہ اور منتقلی کے دوران خفیہ کردہ",
    singleUse: "ایک بار استعمال ہونے والے بحالی لنک",
    requestTitle: "اکاؤنٹ بحال کریں",
    requestIntro: "ہم آپ کو ایک بار استعمال ہونے والا بحالی لنک ای میل کریں گے۔",
    email: "ای میل",
    sending: "بھیجا جا رہا ہے…",
    send: "ری سیٹ لنک بھیجیں",
    inboxTitle: "اپنا اِن باکس دیکھیں",
    inboxBody: "اگر کوئی اہل اکاؤنٹ موجود ہے تو ایک بار استعمال ہونے والا لنک بھیجا جائے گا۔ اپنا اِن باکس اور اسپام فولڈر دیکھیں۔ اگر نہ پہنچے تو پانچ منٹ بعد دوبارہ کوشش کریں یا اپنے اسکول کے منتظم سے رابطہ کریں۔",
    backToLogin: "سائن اِن پر واپس جائیں",
    expiredTitle: "لنک کی مدت ختم",
    expiredBody: "اس بحالی لنک کی مدت ختم ہو چکی ہے یا یہ پہلے ہی استعمال ہو چکا ہے۔ جاری رکھنے کے لیے نیا لنک طلب کریں۔",
    requestNew: "نیا لنک طلب کریں",
    errorTitle: "لنک کی تصدیق نہیں ہو سکی",
    errorBody: "ہم اس بحالی لنک کو جانچ نہیں سکے۔ دوبارہ کوشش کریں۔",
    tryAgain: "دوبارہ کوشش کریں",
    verifying: "لنک کی تصدیق ہو رہی ہے…",
    resetTitle: "نیا پاس ورڈ",
    resetIntro: "اپنے Skoolee اکاؤنٹ کے لیے نیا پاس ورڈ منتخب کریں۔",
    newPassword: "نیا پاس ورڈ",
    showNew: "نیا پاس ورڈ دکھائیں",
    hideNew: "نیا پاس ورڈ چھپائیں",
    confirmPassword: "پاس ورڈ کی تصدیق",
    showConfirm: "تصدیق شدہ پاس ورڈ دکھائیں",
    hideConfirm: "تصدیق شدہ پاس ورڈ چھپائیں",
    checklist: "سیکیورٹی چیک لسٹ",
    met: "مکمل: ",
    notMet: "ابھی باقی: ",
    saving: "محفوظ ہو رہا ہے…",
    save: "نیا پاس ورڈ محفوظ کریں",
    remembered: "یاد آ گیا؟ سائن اِن پر واپس جائیں",
    requirements: ["کم از کم ۸ حروف", "ایک بڑا انگریزی حرف", "ایک عدد", "ایک خاص علامت", "پاس ورڈ ایک جیسے ہیں"],
    linkInvalid: "آپ کے بحالی لنک کی مدت ختم ہو گئی ہے یا یہ درست نہیں۔",
    linkSent: "درخواست موصول ہو گئی۔ اگر اس ای میل سے کوئی اکاؤنٹ موجود ہے تو بحالی لنک بھیج دیا گیا ہے۔",
    sendFailed: "بحالی لنک نہیں بھیجا جا سکا۔ دوبارہ کوشش کریں۔",
    updated: "پاس ورڈ اپ ڈیٹ ہو گیا۔ نئے پاس ورڈ سے سائن اِن کریں۔",
    saveFailed: "آپ کا پاس ورڈ محفوظ نہیں ہو سکا۔ دوبارہ کوشش کریں۔",
    messages: {
      "Invalid email address": "ای میل ایڈریس درست نہیں",
      "Password must be at least 8 characters": "پاس ورڈ کم از کم ۸ حروف کا ہونا چاہیے",
      "Passwords don't match": "پاس ورڈ ایک جیسے نہیں",
      [UNMET]: "تمام سیکیورٹی شرائط پوری کریں۔",
      "Invalid or expired link. Request a new link.": "لنک درست نہیں یا اس کی مدت ختم ہو گئی ہے۔ نیا لنک منگوائیں۔",
      "Use a password between 8 and 72 characters": "8 سے 72 حروف کے درمیان پاس ورڈ رکھیں",
      "Wait five minutes before trying again": "دوبارہ کوشش سے پہلے پانچ منٹ انتظار کریں",
    },
  },
};

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();
  const { language } = useAuthLanguage();
  const t = copy[language];
  // Reads the current catalog without making the verification effect depend on the language.
  const announceInvalidLink = useEffectEvent(() => { toast.error(t.linkInvalid); });
  const localize = (message?: string) => message === undefined ? undefined : t.messages[message] ?? message;

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [verification, setVerification] = useState<{ token: string; status: "valid" | "invalid" | "error" } | null>(null);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const verificationStatus = verification?.token === token ? verification.status : "loading";
  const [requestError, setRequestError] = useState<string>();
  const [resetError, setResetError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const stateHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestErrorRef = useRef<HTMLDivElement>(null);
  const resetErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyToken(token).then(res => {
      if (!active) return;
      setVerification({ token, status: res.valid ? "valid" : "invalid" });
      if (!res.valid) announceInvalidLink();
    }).catch(() => {
      if (active) setVerification({ token, status: "error" });
    });
    return () => { active = false; };
  }, [token, verificationAttempt]);

  useEffect(() => {
    if (isSubmitted || verificationStatus === "invalid" || verificationStatus === "error") {
      stateHeadingRef.current?.focus();
    }
  }, [isSubmitted, verificationStatus]);

  useEffect(() => {
    if (requestError) requestErrorRef.current?.focus();
    if (resetError) resetErrorRef.current?.focus();
  }, [requestError, resetError]);

  // Form for Requesting Reset
  const requestForm = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
  });

  // Form for Resetting Password
  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const watchPassword = resetForm.watch("password");
  const watchConfirm = resetForm.watch("confirmPassword");

  const passwordRequirements = [
    { label: t.requirements[0], met: watchPassword.length >= 8 },
    { label: t.requirements[1], met: /[A-Z]/.test(watchPassword) },
    { label: t.requirements[2], met: /[0-9]/.test(watchPassword) },
    { label: t.requirements[3], met: /[^A-Za-z0-9]/.test(watchPassword) },
    { label: t.requirements[4], met: watchPassword === watchConfirm && watchPassword !== '' },
  ];

  const handleRequest = async (data: z.infer<typeof requestSchema>) => {
    setRequestError(undefined);
    setIsLoading(true);
    try {
      await requestPasswordReset(data.email);
      setIsSubmitted(true);
      toast.success(t.linkSent);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.sendFailed;
      setRequestError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (data: z.infer<typeof resetSchema>) => {
    if (!token) return;
    setResetError(undefined);

    // Final check for requirements
    const unmet = passwordRequirements.filter(r => !r.met);
    if (unmet.length > 0) {
      // Stored as the English source; rendered through `localize`.
      resetForm.setError("password", { type: "validate", message: UNMET }, { shouldFocus: true });
      toast.error(localize(UNMET));
      return;
    }

    setIsLoading(true);
    try {
      const result = await resetPassword(token, data.password);
      if (!result.success) {
        // Stored as the English source; rendered through `localize`.
        setResetError(result.error);
        toast.error(localize(result.error));
        return;
      }
      toast.success(t.updated);
      router.push("/login");
    } catch {
      setResetError(t.saveFailed);
      toast.error(t.saveFailed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main lang={language} dir={directionFor(language)} className="w-full min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)] font-sans">

      {/* ─── BRAND PANEL ─────────────────────────────── */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-brand-700 to-brand-800 p-12 xl:p-14">
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <div className="sk-blob absolute -top-1/4 -start-1/5 h-[72%] w-[72%] rounded-full bg-brand-400 opacity-70 blur-[90px]" />
          <div className="sk-blob sk-blob-2 absolute top-1/4 -end-1/4 h-[68%] w-[68%] rounded-full bg-brand-300 opacity-45 blur-[100px]" />
          <div className="sk-blob sk-blob-3 absolute -bottom-1/3 start-1/5 h-[62%] w-[62%] rounded-full bg-brand-50 opacity-[0.14] blur-[110px]" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
          <div className="absolute inset-y-0 end-0 w-32 bg-gradient-to-l from-brand-50/12 to-transparent rtl:bg-gradient-to-r" />
        </div>

        <div className="relative z-10 flex items-center gap-2.5">
          <span aria-hidden="true" className="h-8 w-1 rounded-full bg-white/70" />
          <p className="text-2xs font-semibold uppercase tracking-wider text-white/80">
            Skoolee AI
          </p>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="sk-enter inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-brand-200" />
            <span className="text-2xs font-semibold uppercase tracking-wider text-brand-200">
              {t.eyebrow}
            </span>
          </div>

          <h2 className="sk-enter mt-7 text-4xl font-extrabold leading-tight tracking-tight text-white text-balance xl:text-5xl" style={{ "--sk-delay": "80ms" } as React.CSSProperties}>
            {t.brandLine1}
            {t.brandLine2 ? <><br />{t.brandLine2}</> : null}
            <span className="bg-gradient-to-r from-brand-200 to-fuchsia-300 bg-clip-text text-transparent">
              {t.brandHighlight}
            </span>
          </h2>

          <div className="sk-enter mt-9 rounded-3xl border border-white/25 bg-brand-900/40 p-6 shadow-xl backdrop-blur-xl" style={{ "--sk-delay": "160ms" } as React.CSSProperties}>
            <div className="flex items-start gap-4">
              <div aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-md font-medium leading-relaxed text-white">
                  {t.brandBody}
                </p>
                <p className="mt-2.5 text-xs font-semibold text-brand-200">
                  {t.brandNote}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-white/80">
          <span className="flex items-center gap-1.5"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /> {t.encrypted}</span>
          <span className="flex items-center gap-1.5"><KeyRound aria-hidden="true" className="h-3.5 w-3.5" /> {t.singleUse}</span>
        </div>
      </section>

      {/* ─── FORM PANEL ──────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center p-4 sm:p-10 lg:p-14">
        <div className="w-full max-w-[30rem]">
          <div className="sk-enter mb-9 flex flex-col items-center">
            <SkooleeLogo size="2.35rem" weight="heavy" />
            <div aria-hidden="true" className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-primary to-brand-400" />
          </div>

          <div className="sk-enter sk-panel p-6 shadow-xl sm:p-9" style={{ "--sk-delay": "70ms" } as React.CSSProperties}>
            {!token ? (
              // ── REQUEST RESET ──
              !isSubmitted ? (
                <>
                  <div className="mb-7 text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl">
                      {t.requestTitle}
                    </h1>
                    <p className="mt-2 text-md leading-relaxed text-ink-muted">
                      {t.requestIntro}
                    </p>
                  </div>

                  <form onSubmit={requestForm.handleSubmit(handleRequest)} className="space-y-4" aria-busy={isLoading} noValidate>
                    {requestError && <div ref={requestErrorRef} tabIndex={-1} role="group" aria-labelledby="recover-request-error" className="sk-shake rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 shadow-xs"><FieldError id="recover-request-error">{requestError}</FieldError></div>}
                    <FormField name="email" id="recover-email" label={t.email} error={localize(requestForm.formState.errors.email?.message)} required>
                      <InputGroup>
                        <Mail data-field-affix="start" aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
                        <Input
                          id="recover-email"
                          type="email"
                          autoComplete="email"
                          placeholder="admin@horizon.edu"
                          readOnly={isLoading}
                          {...requestForm.register("email")}
                        />
                      </InputGroup>
                    </FormField>
                    <p role="status" className="sr-only">{isLoading ? t.sending : ""}</p>
                    <Button type="submit" loading={isLoading} className="group mt-1 w-full">
                      {isLoading ? <span>{t.sending}</span> : <><span>{t.send}</span><ArrowRight aria-hidden="true" className="transition-transform rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" /></>}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="sk-enter py-6 text-center">
                  <div aria-hidden="true" className="sk-check-pop mx-auto mb-6 flex size-16 items-center justify-center rounded-[22px] border border-status-success-border bg-status-success-surface text-emerald-700 shadow-sm">
                    <CheckCircle2 className="size-8" />
                  </div>
                  <h1 ref={stateHeadingRef} tabIndex={-1} className="mb-2 text-2xl font-bold tracking-tight text-ink-strong text-balance">{t.inboxTitle}</h1>
                  <p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-ink-muted">
                    {t.inboxBody}
                  </p>
                  <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
                    <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
                    {t.backToLogin}
                  </Link>
                </div>
              )
            ) : verificationStatus === "invalid" ? (
              <div className="sk-enter py-6 text-center">
                <div aria-hidden="true" className="mx-auto mb-6 flex size-16 items-center justify-center rounded-[22px] border border-status-error-border bg-status-error-surface text-red-700 shadow-sm">
                  <AlertCircle className="size-8" />
                </div>
                <h1 ref={stateHeadingRef} tabIndex={-1} className="mb-2 text-2xl font-bold tracking-tight text-ink-strong text-balance">{t.expiredTitle}</h1>
                <p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-ink-muted">
                  {t.expiredBody}
                </p>
                <Button type="button" className="w-full sm:w-auto" onClick={() => router.push("/forgot-password")}>
                  {t.requestNew}
                </Button>
              </div>
            ) : verificationStatus === "error" ? (
              <div className="sk-enter py-6 text-center">
                <div aria-hidden="true" className="mx-auto mb-6 flex size-16 items-center justify-center rounded-[22px] border border-status-warning-border bg-status-warning-surface text-amber-700 shadow-sm">
                  <AlertTriangle className="size-8" />
                </div>
                <h1 ref={stateHeadingRef} tabIndex={-1} className="mb-2 text-2xl font-bold tracking-tight text-ink-strong text-balance">{t.errorTitle}</h1>
                <p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-ink-muted">{t.errorBody}</p>
                <Button type="button" className="w-full sm:w-auto" onClick={() => { setVerification(null); setVerificationAttempt(attempt => attempt + 1); }}>
                  <RotateCcw aria-hidden="true" />
                  {t.tryAgain}
                </Button>
              </div>
            ) : verificationStatus === "loading" ? (
              <div role="status" className="flex flex-col items-center justify-center gap-4 py-12">
                <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-[22px] border border-status-brand-border bg-status-brand-surface text-primary">
                  <Loader2 className="size-7 motion-safe:animate-spin" />
                </span>
                <h1 className="text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl">{t.verifying}</h1>
              </div>
            ) : (
              // ── RESET PASSWORD ──
              <>
                <div className="mb-7 text-center">
                  <h1 className="text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl">
                    {t.resetTitle}
                  </h1>
                  <p className="mt-2 text-md leading-relaxed text-ink-muted">
                    {t.resetIntro}
                  </p>
                </div>

                <form onSubmit={resetForm.handleSubmit(handleReset)} className="space-y-4" aria-busy={isLoading} noValidate>
                  {resetError && <div ref={resetErrorRef} tabIndex={-1} role="group" aria-labelledby="recover-reset-error" className="sk-shake rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 shadow-xs"><FieldError id="recover-reset-error">{localize(resetError)}</FieldError></div>}
                  <FormField name="password" id="new-password" label={t.newPassword} error={localize(resetForm.formState.errors.password?.message)} required>
                    <InputGroup>
                      <Lock data-field-affix="start" aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
                      <Input id="new-password" aria-describedby="password-requirements" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="••••••••" readOnly={isLoading} {...resetForm.register("password")} />
                      <FieldAction type="button" data-field-affix="end" aria-controls="new-password" aria-label={showPassword ? t.hideNew : t.showNew} disabled={isLoading} onClick={() => setShowPassword(value => !value)}>
                        {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </FieldAction>
                    </InputGroup>
                  </FormField>
                  <FormField name="confirmPassword" id="confirm-password" label={t.confirmPassword} error={localize(resetForm.formState.errors.confirmPassword?.message)} required>
                    <InputGroup>
                      <Lock data-field-affix="start" aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
                      <Input id="confirm-password" aria-describedby="password-requirements" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" placeholder="••••••••" readOnly={isLoading} {...resetForm.register("confirmPassword")} />
                      <FieldAction type="button" data-field-affix="end" aria-controls="confirm-password" aria-label={showConfirmPassword ? t.hideConfirm : t.showConfirm} disabled={isLoading} onClick={() => setShowConfirmPassword(value => !value)}>
                        {showConfirmPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </FieldAction>
                    </InputGroup>
                  </FormField>
                  <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                    <h2 className="mb-2.5 text-sm font-semibold text-ink-strong">{t.checklist}</h2>
                    <ul id="password-requirements" className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
                      {passwordRequirements.map(req => (
                        <li key={req.label} className={cn("flex items-start gap-1.5 text-sm font-medium transition-colors", req.met ? "text-status-success-text" : "text-ink-muted")}>
                          {req.met ? <CheckCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
                          <span><span className="sr-only">{req.met ? t.met : t.notMet}</span>{req.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p role="status" className="sr-only">{isLoading ? t.saving : ""}</p>
                  <Button type="submit" loading={isLoading} className="group mt-1 w-full">
                    {isLoading ? <span>{t.saving}</span> : <><span>{t.save}</span><ArrowRight aria-hidden="true" className="transition-transform rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" /></>}
                  </Button>
                </form>
              </>
            )}
          </div>

          <div className="mt-5 text-center">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-ink-muted transition-colors hover:text-primary"
            >
              {t.remembered}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
