'use client';
import { FieldAction, InputGroup } from "@/components/ui/input-group";
import { useState, useEffect, useEffectEvent, useRef, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "@/components/ui/toast";
import { requestPasswordReset, resetPassword, verifyToken } from "@/app/actions/auth/reset";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError, FormField } from "@/components/ui/form-field";
import { ArrowLeft, ArrowRight, Mail, Lock, Eye, EyeOff, RotateCcw, Building2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { AuthCover } from "@/components/auth/AuthCover";
import { AuthColophon, authClaimItem } from "@/components/auth/AuthColophon";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { SealedEnvelope } from "@/components/auth/SealedEnvelope";
import { MailHandoff } from "@/components/auth/MailHandoff";
import { EmailTypoHint } from "@/components/auth/EmailTypoHint";
import { RequirementChecklist } from "@/components/auth/RequirementChecklist";
import { authCopy } from "@/lib/auth/auth-copy";
import { stashAuthEmail, takeAuthEmail } from "@/lib/auth/auth-handoff";
import type { Language } from "@/lib/locale/package";

const requestSchema = z.object({
  email: z.string().email("Invalid email address"),
});
type RequestValues = z.infer<typeof requestSchema>;

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
  requestTitle: "Recover account",
  requestIntro: "We'll email you a single-use recovery link.",
  email: "Email Identity",
  sending: "Sending…",
  send: "Send reset link",
  noEmailHelp: "No email on file? Ask your school administrator to reset your access.",
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
  rememberedPrompt: "Remembered it?",
  rememberedLink: "Back to sign in",
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
    requestTitle: "استعادة الحساب",
    requestIntro: "سنرسل إليك رابط استعادة صالحاً لمرة واحدة.",
    email: "البريد الإلكتروني",
    sending: "جارٍ الإرسال…",
    send: "إرسال رابط إعادة التعيين",
    noEmailHelp: "لا يوجد بريد إلكتروني مسجّل؟ اطلب من مسؤول مدرستك إعادة تعيين وصولك.",
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
    rememberedPrompt: "تذكرتها؟",
    rememberedLink: "العودة لتسجيل الدخول",
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
    requestTitle: "اکاؤنٹ بحال کریں",
    requestIntro: "ہم آپ کو ایک بار استعمال ہونے والا بحالی لنک ای میل کریں گے۔",
    email: "ای میل",
    sending: "بھیجا جا رہا ہے…",
    send: "ری سیٹ لنک بھیجیں",
    noEmailHelp: "ای میل درج نہیں؟ اپنے اسکول کے منتظم سے رسائی بحال کرنے کو کہیں۔",
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
    rememberedPrompt: "یاد آ گیا؟",
    rememberedLink: "سائن اِن پر واپس جائیں",
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

/** The five reset rules, in checklist order. */
function passwordRules(password: string, confirm: string) {
  return [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
    password === confirm && password !== "",
  ];
}

/** Arrival choreography offset (the only inline style pages may set). */
const delay = (ms: number) => ({ ["--sk-delay" as string]: `${ms}ms` }) as CSSProperties;

/** How long the mascot holds its happy pose after a link is sent or every rule is met. */
const HAPPY_MS = 1200;

/** Every card heading. The ones that take focus on a state change wear no control ring (shared `.sk-auth` rule). */
const stateTitle = "text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl";

/**
 * "Did you mean …@gmail.com?" after the email field. It watches the value on
 * its own, so a keystroke re-renders this hint rather than the whole page.
 */
function RecoveryTypoHint({ control, language, onApply }: { control: Control<RequestValues>; language: Language; onApply: (fixed: string) => void }) {
  const value = useWatch({ control, name: "email" });
  return <EmailTypoHint language={language} value={value ?? ""} onApply={onApply} className="-mt-2" />;
}

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();
  const { language, setLanguage } = useAuthLanguage();
  const t = copy[language];
  const ac = authCopy[language];
  // Reads the current catalog without making the verification effect depend on the language.
  const announceInvalidLink = useEffectEvent(() => { toast.error(t.linkInvalid); });
  const localize = (message?: string) => message === undefined ? undefined : t.messages[message] ?? message;

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [sentAt, setSentAt] = useState<Date>();
  const [returned, setReturned] = useState(false);
  const [verification, setVerification] = useState<{ token: string; status: "valid" | "invalid" | "error" } | null>(null);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const verificationStatus = verification?.token === token ? verification.status : "loading";
  const [requestError, setRequestError] = useState<string>();
  const [resetError, setResetError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Mascot signals: a bump per failed attempt (concerned glance), and short happy beats.
  const [errorSeq, setErrorSeq] = useState(0);
  const [justSent, setJustSent] = useState(false);
  const [allMetPulse, setAllMetPulse] = useState(false);
  const stateHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestErrorRef = useRef<HTMLDivElement>(null);
  const resetErrorRef = useRef<HTMLDivElement>(null);
  const refocusEmail = useRef(false);

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
  const requestForm = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
  });

  // Form for Resetting Password
  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  // Email handoff from login (this tab only, read once, never in a URL).
  useEffect(() => {
    if (token) return;
    const email = takeAuthEmail();
    if (email) requestForm.setValue("email", email);
  }, []);

  // "Use a different email" / "Request new link": back on the request form, the email field takes
  // focus (the kept address selected), so focus never falls back to <body> when the card swaps.
  useEffect(() => {
    if (token || isSubmitted || !refocusEmail.current) return;
    refocusEmail.current = false;
    requestForm.setFocus("email", { shouldSelect: true });
  }, [isSubmitted, token]);

  useEffect(() => {
    if (!justSent) return;
    const timer = window.setTimeout(() => setJustSent(false), HAPPY_MS);
    return () => window.clearTimeout(timer);
  }, [justSent]);

  // The moment every reset rule turns green, the mascot smiles once.
  useEffect(() => {
    let wasMet = false;
    let timer: number | undefined;
    const subscription = resetForm.watch(values => {
      const met = passwordRules(values.password ?? "", values.confirmPassword ?? "").every(Boolean);
      if (met && !wasMet) {
        setAllMetPulse(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setAllMetPulse(false), HAPPY_MS);
      }
      wasMet = met;
    });
    return () => { subscription.unsubscribe(); window.clearTimeout(timer); };
  }, [resetForm]);

  const watchPassword = resetForm.watch("password");
  const watchConfirm = resetForm.watch("confirmPassword");

  const rules = passwordRules(watchPassword, watchConfirm);
  const passwordRequirements = t.requirements.map((label, index) => ({ label, met: rules[index] }));

  const bumpError = () => setErrorSeq(seq => seq + 1);

  const handleRequest = async (data: RequestValues) => {
    setRequestError(undefined);
    setIsLoading(true);
    try {
      await requestPasswordReset(data.email);
      setSubmittedEmail(data.email);
      setSentAt(new Date());
      stashAuthEmail(data.email);
      setIsSubmitted(true);
      setJustSent(true);
      toast.success(t.linkSent);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.sendFailed;
      setRequestError(message);
      bumpError();
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const chooseDifferentEmail = () => {
    refocusEmail.current = true;
    setReturned(true);
    setIsSubmitted(false);
  };

  // Navigates immediately (pinned); the request form then swaps in and takes focus.
  const requestNewLink = () => {
    refocusEmail.current = true;
    setReturned(true);
    router.push("/forgot-password");
  };

  const applyTypoFix = (fixed: string) => {
    if (isLoading) return;
    requestForm.setValue("email", fixed, { shouldValidate: Boolean(requestForm.formState.errors.email) });
    requestForm.setFocus("email");
  };

  const handleReset = async (data: z.infer<typeof resetSchema>) => {
    if (!token) return;
    setResetError(undefined);

    // Final check for requirements
    const unmet = passwordRequirements.filter(r => !r.met);
    if (unmet.length > 0) {
      // Stored as the English source; rendered through `localize`.
      resetForm.setError("password", { type: "validate", message: UNMET }, { shouldFocus: true });
      bumpError();
      toast.error(localize(UNMET));
      return;
    }

    setIsLoading(true);
    try {
      const result = await resetPassword(token, data.password);
      if (!result.success) {
        // Stored as the English source; rendered through `localize`.
        setResetError(result.error);
        bumpError();
        toast.error(localize(result.error));
        return;
      }
      toast.success(t.updated);
      router.push("/login");
    } catch {
      setResetError(t.saveFailed);
      bumpError();
      toast.error(t.saveFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const tokenState = token ? verificationStatus : null;
  const mascotError = tokenState === "invalid" ? "expired"
    : tokenState === "error" ? `unverified:${verificationAttempt}`
    : errorSeq > 0 ? `form:${errorSeq}` : null;

  return (
    <AuthShell
      language={language}
      cover={
        <AuthCover
          eyebrow={t.eyebrow}
          heading={{ light: [t.brandLine1, t.brandLine2].filter(Boolean).join(" "), strong: t.brandHighlight.trim(), as: "h2" }}
          body={t.brandBody}
          index={{
            label: ac.trustLabel,
            items: [authClaimItem(language, "singleUse"), authClaimItem(language, "resetExpiry"), authClaimItem(language, "encrypted")],
          }}
          footnote={t.brandNote}
        />
      }
      topBar={<AuthTopBar languageId="recover-language" label={ac.language} value={language} onChange={setLanguage} />}
      footer={<AuthColophon language={language} claims={["singleUse", "resetExpiry", "encrypted"]} />}
    >
      <AuthMascot
        className="sk-enter mt-6"
        signals={{
          thinking: isLoading || tokenState === "loading",
          success: justSent || allMetPulse,
          error: mascotError,
          glance: !token && isSubmitted ? "[data-mascot-anchor=envelope]" : null,
        }}
      />

      <div className="sk-enter sk-panel sk-gradient-border mt-7 p-6 shadow-xl sm:p-9" style={delay(140)}>
        {!token ? (
          // ── REQUEST RESET ──
          !isSubmitted ? (
            <div key="request" className={returned ? "sk-enter-scale" : undefined}>
              <div className="mb-7 text-center">
                <h1 className={stateTitle}>
                  {t.requestTitle}
                </h1>
                <p className="mt-2 text-md leading-relaxed text-ink-muted">
                  {t.requestIntro}
                </p>
              </div>

              <form onSubmit={requestForm.handleSubmit(handleRequest, bumpError)} className="space-y-4" aria-busy={isLoading} noValidate>
                {requestError && <div ref={requestErrorRef} tabIndex={-1} role="group" aria-labelledby="recover-request-error" className="sk-shake rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 shadow-xs"><FieldError id="recover-request-error">{requestError}</FieldError></div>}
                <FormField name="email" id="recover-email" label={t.email} error={localize(requestForm.formState.errors.email?.message)} required>
                  <InputGroup>
                    <Mail data-field-affix="start" aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
                    <Input
                      id="recover-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      enterKeyHint="send"
                      placeholder="admin@horizon.edu"
                      readOnly={isLoading}
                      {...requestForm.register("email")}
                    />
                  </InputGroup>
                </FormField>
                <RecoveryTypoHint control={requestForm.control} language={language} onApply={applyTypoFix} />
                <p role="status" className="sr-only">{isLoading ? t.sending : ""}</p>
                <Button type="submit" loading={isLoading} className="group mt-1 w-full">
                  {isLoading ? <span>{t.sending}</span> : <><span>{t.send}</span><ArrowRight aria-hidden="true" className="transition-transform rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" /></>}
                </Button>
              </form>

              <p className="mt-6 flex items-start gap-2 border-t border-border-subtle pt-5 text-xs leading-relaxed text-ink-subtle">
                <Building2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0">{t.noEmailHelp}</span>
              </p>
            </div>
          ) : (
            // ── SENT: "Check your inbox" ──
            <div key="sent" className="sk-enter-scale text-center">
              <SealedEnvelope size="md" className="mx-auto" />
              <h1 ref={stateHeadingRef} tabIndex={-1} className={cn(stateTitle, "mt-5")}>{t.inboxTitle}</h1>
              <div className="mt-6">
                <MailHandoff
                  language={language}
                  email={submittedEmail}
                  kind="reset"
                  sentAt={sentAt}
                  intro={<p className="text-sm leading-relaxed text-ink-muted">{t.inboxBody}</p>}
                  onUseDifferentEmail={chooseDifferentEmail}
                />
              </div>
              <Link href="/login" className={cn(buttonVariants(), "sk-nudge-trigger mt-6 w-full")}>
                <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
                {t.backToLogin}
              </Link>
            </div>
          )
        ) : verificationStatus === "invalid" ? (
          // ── LINK EXPIRED ──
          <div key="expired" className="sk-enter-scale py-2 text-center">
            <SealedEnvelope variant="expired" size="sm" press={false} className="mx-auto mb-6" />
            <h1 ref={stateHeadingRef} tabIndex={-1} className={stateTitle}>{t.expiredTitle}</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">
              {t.expiredBody}
            </p>
            <p className="mx-auto mt-4 flex max-w-sm items-start justify-center gap-1.5 text-xs leading-relaxed text-ink-subtle">
              <Timer aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">{ac.mail.tipResetExpiry}</span>
            </p>
            <Button type="button" className="group mt-8 w-full" onClick={requestNewLink}>
              <span>{t.requestNew}</span>
              <ArrowRight aria-hidden="true" className="transition-transform rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Button>
          </div>
        ) : verificationStatus === "error" ? (
          // ── UNABLE TO VERIFY ──
          <div key="unverified" className="sk-enter-scale py-2 text-center">
            <SealedEnvelope variant="error" size="sm" press={false} className="mx-auto mb-6" />
            <h1 ref={stateHeadingRef} tabIndex={-1} className={stateTitle}>{t.errorTitle}</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">{t.errorBody}</p>
            <Button type="button" className="mt-8 w-full" onClick={() => { setVerification(null); setVerificationAttempt(attempt => attempt + 1); }}>
              <RotateCcw aria-hidden="true" />
              {t.tryAgain}
            </Button>
          </div>
        ) : verificationStatus === "loading" ? (
          // ── VERIFYING LINK ── (the envelope is aria-hidden and textless, so the status reads only the heading)
          <div role="status" className="flex flex-col items-center justify-center gap-5 py-10">
            <SealedEnvelope variant="checking" size="sm" press={false} />
            <h1 className={stateTitle}>{t.verifying}</h1>
          </div>
        ) : (
          // ── RESET PASSWORD ──
          <div key="reset" className="sk-enter-scale">
            <div className="mb-7 text-center">
              <h1 className={stateTitle}>
                {t.resetTitle}
              </h1>
              <p className="mt-2 text-md leading-relaxed text-ink-muted">
                {t.resetIntro}
              </p>
            </div>

            <form onSubmit={resetForm.handleSubmit(handleReset, bumpError)} className="space-y-4" aria-busy={isLoading} noValidate>
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
                <RequirementChecklist id="password-requirements" items={passwordRequirements} metPrefix={t.met} unmetPrefix={t.notMet} columns="sm" size="sm" />
              </div>
              <p role="status" className="sr-only">{isLoading ? t.saving : ""}</p>
              <Button type="submit" loading={isLoading} className="group mt-1 w-full">
                {isLoading ? <span>{t.saving}</span> : <><span>{t.save}</span><ArrowRight aria-hidden="true" className="transition-transform rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" /></>}
              </Button>
            </form>
          </div>
        )}
      </div>

      {token || !isSubmitted ? (
        // The same "question? action" line login and register end their cards with.
        <p className="sk-fade-in mt-6 text-center text-sm leading-relaxed text-ink-muted" style={delay(180)}>
          {t.rememberedPrompt}{" "}
          <Link
            href="/login"
            onClick={() => { if (!token) stashAuthEmail(requestForm.getValues("email") ?? ""); }}
            className="sk-link relative inline-block after:absolute after:-inset-x-1 after:-inset-y-3"
          >
            {t.rememberedLink}
          </Link>
        </p>
      ) : null}
    </AuthShell>
  );
}
