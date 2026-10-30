"use client";
import { FieldAction, InputGroup } from "@/components/ui/input-group";
import { useState, useEffect, useEffectEvent, useRef, useCallback, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch, type Control } from "react-hook-form";
import { safeReturnPath } from "@/lib/auth/return-path";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/components/ui/toast";
import { loginSchema, type LoginFormData } from "@/lib/validators/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveMediaUrl } from "@/lib/storage/s3";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/form-field";
import { InfoTip } from "@/components/ui/tooltip";
import {
  Loader2, Eye, EyeOff, ArrowRight, Mail, Lock,
  AlertCircle, CheckCircle2, ChevronLeft, Phone,
} from "lucide-react";
import Link from "next/link";
import { dashboardPathForRole, roleLabel } from "@/lib/roles";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { AuthCover } from "@/components/auth/AuthCover";
import { AuthColophon, authClaimItem } from "@/components/auth/AuthColophon";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { EmailTypoHint } from "@/components/auth/EmailTypoHint";
import { CountdownRing } from "@/components/auth/CountdownRing";
import { useVerificationResend } from "@/components/auth/use-verification-resend";
import { authCopy } from "@/lib/auth/auth-copy";
import { stashAuthEmail, takeAuthEmail } from "@/lib/auth/auth-handoff";
import { fillText } from "@/lib/auth/fill-nodes";
import type { Language } from "@/lib/locale/package";
import { cn } from "@/lib/utils";
import { GuardianPhoneSignIn } from "@/components/auth/GuardianPhoneSignIn";

/** SKAI-954: the guardian phone sign-in entry is shown only when the OTP service is switched on. */
const PHONE_SIGN_IN = process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === "true";

/**
 * Every login-only string, co-located like protect-account and accept-invite.
 * Claims, policy links, the language label and the resend wording are shared
 * with the other auth screens and come from `authCopy`. Switching language
 * only swaps text nodes, so typed credentials, "remember me" and the school
 * picker survive the change.
 */
const en = {
  srHeading: "Sign in to Skoolee AI",
  eyebrow: "AI-assisted school management",
  /** The cover headline: a light phrase, then the weight-800 phrase with the ink swash. */
  title: { light: "Run the whole institution from", strong: "one place." },
  footnote: "Built for school groups, not single classrooms",
  chooseSchool: "Choose your school",
  chooseSchoolBody: "This email is registered at more than one institution.",
  welcome: "Welcome back",
  welcomeBody: "Sign in to your campus dashboard.",
  email: "Work Email",
  password: "Password",
  forgot: "Forgot password?",
  showPassword: "Show password",
  hidePassword: "Hide password",
  capsLock: "Caps Lock is on",
  remember: "Keep me signed in for 30 days",
  rememberTip: "Without this, you are signed out after 7 days. Leave it off on a shared or school computer.",
  welcomeDone: "Welcome back!",
  tryAgainIn: "Try again in {0}s",
  signingIn: "Signing in…",
  signIn: "Sign in",
  differentAccount: "Use a different account",
  noAccount: "Don't have an account?",
  createAccount: "Create New Account",
  welcomeToast: "Welcome back, {0}!",
  verified: "Account verified. Please log in.",
  invited: "Invitation accepted. Log in with your new password.",
  sessionEnded: "Your session has ended. Please sign in again.",
  unableToVerify: "Unable to verify this link. Please open the latest verification email and try again.",
  tooMany: "Too many attempts. Please wait a moment.",
  loginFailed: "Login failed",
  schoolFailed: "Could not sign in to that school.",
  resendNeedEmail: "Enter your email above, then send a new link.",
  phoneSignIn: "Parent or guardian? Sign in with your phone",
  /** Known English messages (zod, verification redirect, /api/auth/login) → localized text. Unknown text passes through. */
  messages: {} as Record<string, string>,
};
type LoginCopy = typeof en;

const copy: Record<Language, LoginCopy> = {
  en,
  ar: {
    srHeading: "تسجيل الدخول إلى Skoolee AI",
    eyebrow: "إدارة مدرسية بمساعدة الذكاء الاصطناعي",
    title: { light: "أدِر المؤسسة بأكملها من", strong: "مكان واحد." },
    footnote: "مصمَّم لمجموعات المدارس، لا للفصول المنفردة",
    chooseSchool: "اختر مدرستك",
    chooseSchoolBody: "هذا البريد الإلكتروني مسجّل في أكثر من مؤسسة.",
    welcome: "مرحباً بعودتك",
    welcomeBody: "سجّل الدخول إلى لوحة تحكم فرعك.",
    email: "البريد الإلكتروني للعمل",
    password: "كلمة المرور",
    forgot: "نسيت كلمة المرور؟",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    capsLock: "مفتاح الأحرف الكبيرة مفعّل",
    remember: "ابقَ مسجّلاً لمدة 30 يوماً",
    rememberTip: "من دون هذا الخيار يُسجَّل خروجك بعد 7 أيام. اتركه غير مفعّل على جهاز مشترك أو جهاز المدرسة.",
    welcomeDone: "مرحباً بعودتك!",
    tryAgainIn: "حاول مجدداً بعد {0} ث",
    signingIn: "جارٍ تسجيل الدخول…",
    signIn: "تسجيل الدخول",
    differentAccount: "استخدم حساباً آخر",
    noAccount: "ليس لديك حساب؟",
    createAccount: "إنشاء حساب جديد",
    welcomeToast: "مرحباً بعودتك، {0}!",
    verified: "تم التحقق من الحساب. سجّل الدخول.",
    invited: "قُبلت الدعوة. سجّل الدخول بكلمة المرور الجديدة.",
    sessionEnded: "انتهت جلستك. سجّل الدخول مجدداً.",
    unableToVerify: "تعذر التحقق من هذا الرابط. افتح أحدث رسالة تحقق وحاول مجدداً.",
    tooMany: "محاولات كثيرة جداً. انتظر قليلاً.",
    loginFailed: "تعذر تسجيل الدخول",
    schoolFailed: "تعذر تسجيل الدخول إلى تلك المدرسة.",
    resendNeedEmail: "أدخل بريدك الإلكتروني أعلاه، ثم أرسل رابطاً جديداً.",
    phoneSignIn: "ولي أمر؟ سجّل الدخول برقم هاتفك",
    messages: {
      "Valid email required": "أدخل بريداً إلكترونياً صالحاً",
      "Password required": "كلمة المرور مطلوبة",
      "Invalid email or password": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      "Too many login attempts. Please try again in a minute.": "محاولات تسجيل دخول كثيرة جداً. حاول مجدداً بعد دقيقة.",
      "Too many login attempts. Please try again in 15 minutes.": "محاولات تسجيل دخول كثيرة جداً. حاول مجدداً بعد 15 دقيقة.",
      "Account not verified. Please check your email inbox to activate it.": "لم يتم التحقق من الحساب. تحقق من بريدك الإلكتروني لتفعيله.",
      "Login failed": "تعذر تسجيل الدخول",
      "Invalid verification link": "رابط التحقق غير صالح",
      "This verification link is invalid or has expired": "رابط التحقق هذا غير صالح أو انتهت صلاحيته",
      "User not found": "المستخدم غير موجود",
      "Verification failed": "فشل التحقق",
    },
  },
  ur: {
    srHeading: "Skoolee AI میں سائن اِن کریں",
    eyebrow: "اے آئی کی مدد سے اسکول کا انتظام",
    title: { light: "پورا ادارہ چلائیں", strong: "ایک ہی جگہ سے۔" },
    footnote: "اسکول گروپس کے لیے بنایا گیا، صرف ایک کلاس روم کے لیے نہیں",
    chooseSchool: "اپنا اسکول منتخب کریں",
    chooseSchoolBody: "یہ ای میل ایک سے زیادہ اداروں میں رجسٹرڈ ہے۔",
    welcome: "خوش آمدید",
    welcomeBody: "اپنے کیمپس ڈیش بورڈ میں سائن اِن کریں۔",
    email: "دفتری ای میل",
    password: "پاس ورڈ",
    forgot: "پاس ورڈ بھول گئے؟",
    showPassword: "پاس ورڈ دکھائیں",
    hidePassword: "پاس ورڈ چھپائیں",
    capsLock: "کیپس لاک آن ہے",
    remember: "مجھے 30 دن تک سائن اِن رکھیں",
    rememberTip: "اس کے بغیر آپ 7 دن بعد سائن آؤٹ ہو جاتے ہیں۔ مشترکہ یا اسکول کے کمپیوٹر پر اسے بند رکھیں۔",
    welcomeDone: "خوش آمدید!",
    tryAgainIn: "{0} سیکنڈ بعد دوبارہ کوشش کریں",
    signingIn: "سائن اِن ہو رہا ہے…",
    signIn: "سائن اِن",
    differentAccount: "کوئی اور اکاؤنٹ استعمال کریں",
    noAccount: "اکاؤنٹ نہیں ہے؟",
    createAccount: "نیا اکاؤنٹ بنائیں",
    welcomeToast: "خوش آمدید، {0}!",
    verified: "اکاؤنٹ کی تصدیق ہو گئی۔ براہ کرم سائن اِن کریں۔",
    invited: "دعوت قبول ہو گئی۔ اپنے نئے پاس ورڈ سے سائن اِن کریں۔",
    sessionEnded: "آپ کا سیشن ختم ہو گیا۔ دوبارہ سائن اِن کریں۔",
    unableToVerify: "اس لنک کی تصدیق نہیں ہو سکی۔ تازہ ترین تصدیقی ای میل کھولیں اور دوبارہ کوشش کریں۔",
    tooMany: "بہت زیادہ کوششیں۔ تھوڑی دیر انتظار کریں۔",
    loginFailed: "سائن اِن نہیں ہو سکا",
    schoolFailed: "اس اسکول میں سائن اِن نہیں ہو سکا۔",
    resendNeedEmail: "اوپر اپنا ای میل درج کریں، پھر نیا لنک بھیجیں۔",
    phoneSignIn: "والدین یا سرپرست؟ اپنے فون سے سائن اِن کریں",
    messages: {
      "Valid email required": "درست ای میل درج کریں",
      "Password required": "پاس ورڈ درکار ہے",
      "Invalid email or password": "ای میل یا پاس ورڈ غلط ہے",
      "Too many login attempts. Please try again in a minute.": "سائن اِن کی بہت زیادہ کوششیں۔ ایک منٹ بعد دوبارہ کوشش کریں۔",
      "Too many login attempts. Please try again in 15 minutes.": "سائن اِن کی بہت زیادہ کوششیں۔ 15 منٹ بعد دوبارہ کوشش کریں۔",
      "Account not verified. Please check your email inbox to activate it.": "اکاؤنٹ کی تصدیق نہیں ہوئی۔ فعال کرنے کے لیے اپنا ای میل اِن باکس دیکھیں۔",
      "Login failed": "سائن اِن نہیں ہو سکا",
      "Invalid verification link": "تصدیقی لنک درست نہیں",
      "This verification link is invalid or has expired": "یہ تصدیقی لنک درست نہیں یا اس کی مدت ختم ہو گئی ہے",
      "User not found": "صارف نہیں ملا",
      "Verification failed": "تصدیق ناکام ہو گئی",
    },
  },
};

/** Page-owned errors that may be stored as `formError` (always in English, like the server's). */
const OWN_ERROR_KEYS = ["resendNeedEmail", "unableToVerify", "tooMany", "loginFailed", "schoolFailed"] as const satisfies readonly (keyof LoginCopy)[];

/** The English source key of the one error that counts towards the Forgot-password nudge. */
const INVALID_CREDENTIALS = "Invalid email or password";
/**
 * The nudge glance waits until the mascot's concerned look at the alert has
 * finished (about 680ms), so it reads the error first and then looks straight
 * at the way out instead of both glances landing in one frame.
 */
const NUDGE_GLANCE_DELAY_MS = 700;

const delay = (ms: number) => ({ "--sk-delay": `${ms}ms` }) as CSSProperties;

/**
 * One address can hold accounts at several schools (a parent with children at
 * two institutions, a teacher working across two groups), so /api/auth/login
 * may answer with a choice instead of a session. The password is already
 * verified by the time this list comes back — it is a disambiguation prompt,
 * not an enumeration oracle.
 */
type SchoolChoice = {
  schoolId: string;
  schoolName: string;
  schoolCity?: string;
  logoUrl?: string | null;
  campusName?: string | null;
  role: string;
};

type LoginUser = {
  fullName: string;
  role: string;
  mustChangePassword?: boolean;
  onboardingComplete?: boolean;
};

// Only recognize messages produced by the verification endpoint. Arbitrary
// query text must not become trusted account guidance on the sign-in screen.
const verificationErrors = new Set([
  "Invalid verification link",
  "This verification link is invalid or has expired",
  "User not found",
  "Verification failed",
]);

// SKO-457: these errors mean the account may still be waiting for verification, so the
// sign-in card offers a new link instead of leaving the owner at a dead end.
const resendableErrors = new Set([
  "Account not verified. Please check your email inbox to activate it.",
  "This verification link is invalid or has expired",
  "Invalid verification link",
]);

/**
 * "Did you mean …@gmail.com?" under the email field. It watches the value on
 * its own, so a keystroke re-renders this hint rather than the whole page.
 * Pure (no request) and never part of the field's description.
 */
function EmailTypoRescue({ control, language, onApply }: { control: Control<LoginFormData>; language: Language; onApply: (fixed: string) => void }) {
  const value = useWatch({ control, name: "email" });
  return <EmailTypoHint language={language} value={value ?? ""} onApply={onApply} />;
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { language, setLanguage, signInLanguage, clearExplicit } = useAuthLanguage();
  const t = copy[language];
  const ac = authCopy[language];
  // The one-shot query notice reads the current catalog without re-running (and re-toasting) on a language switch.
  const showNotice = useEffectEvent((notice: "verified" | "invited" | "expired") => {
    if (notice === "verified") toast.success(t.verified, { duration: 8000 });
    else if (notice === "invited") toast.success(t.invited, { duration: 8000 });
    else toast.info(t.sessionEnded, { duration: 8000 });
  });
  // Errors are stored as their English source. The page's own fallbacks translate
  // through the catalog (they used to render in English on ar/ur); server text through `messages`.
  const localize = (message: string) => {
    const own = OWN_ERROR_KEYS.find((key) => en[key] === message);
    return own ? t[own] : t.messages[message] ?? message;
  };
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormErrorState] = useState<string | null>(null);
  // Bumped on every new error, so the mascot reacts to a repeat of the same message too.
  const [errorSeq, setErrorSeq] = useState(0);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState(false);
  const [choices, setChoices] = useState<SchoolChoice[] | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState(false);
  // Seconds left on a 429. The button stays disabled and says so, rather than
  // letting people hammer a request that cannot succeed yet.
  const [cooldown, setCooldown] = useState(0);
  const [cooldownTotal, setCooldownTotal] = useState(0);
  // SKAI-1033: the server-rendered button is disabled until React owns the form,
  // so an early press (or Enter) cannot fall back to a native submission.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    // A credential that ever reached the address bar (an old bookmark, a stale
    // tab from before this fix) is scrubbed from the visible URL and history entry.
    const url = new URL(window.location.href);
    if (url.searchParams.has("password") || url.searchParams.has("email")) {
      url.searchParams.delete("password");
      url.searchParams.delete("email");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }, []);
  // Consecutive "Invalid email or password" answers. At two, the Forgot link
  // draws its underline twice and the mascot glances at it; the error text is untouched.
  const [invalidStreak, setInvalidStreak] = useState(0);
  const nudge = invalidStreak >= 2;
  // Set NUDGE_GLANCE_DELAY_MS after the nudge starts; cleared whenever the streak resets.
  const [nudgeLook, setNudgeLook] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const resendStatusRef = useRef<HTMLDivElement>(null);
  // True only between a successful resend click and the notice that replaces the error.
  const focusResendStatus = useRef(false);
  const schoolHeadingRef = useRef<HTMLHeadingElement>(null);
  const resend = useVerificationResend();
  const showResendStatus = resend.state === "sent" && !formError;

  const setFormError = useCallback((message: string | null) => {
    setFormErrorState(message);
    if (message) setErrorSeq((n) => n + 1);
  }, []);

  /** Every answer from /api/auth/login moves the nudge streak: invalid credentials add one, anything else resets it. */
  const countOutcome = (message: string | null) => {
    const invalid = message === INVALID_CREDENTIALS;
    setInvalidStreak((n) => invalid ? n + 1 : 0);
    if (!invalid) setNudgeLook(null);
  };

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    if (!nudge) return;
    const id = window.setTimeout(() => setNudgeLook("#login-forgot-link"), NUDGE_GLANCE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [nudge]);

  // The focused error (and the resend button inside it) unmounts once a new link
  // is on its way: hand focus to the notice that takes its place, never to <body>.
  useEffect(() => {
    if (!showResendStatus || !focusResendStatus.current) return;
    focusResendStatus.current = false;
    resendStatusRef.current?.focus();
  }, [showResendStatus]);

  useEffect(() => {
    if (choices) schoolHeadingRef.current?.focus();
  }, [choices]);

  useEffect(() => {
    const verified = searchParams.get("verified") === "true";
    const invited = searchParams.get("invite") === "accepted";
    // Set by signOutInvalidSession() when the server stopped accepting the
    // session. Without a word here the redirect looks like a random logout.
    const expired = searchParams.get("reason") === "session-expired";
    const verificationError = searchParams.get("error");
    if (!verified && !invited && !expired && verificationError === null) return;
    // On a direct load the root toaster subscribes after this page's effect.
    // Wait until sibling effects have mounted, and cancel a superseded notice.
    const noticeTimer = window.setTimeout(() => {
      if (verified) {
        showNotice("verified");
      } else if (invited) {
        showNotice("invited");
      } else if (expired) {
        showNotice("expired");
      } else {
        // Stored as the English source; rendered through `localize` so a later language switch re-translates it.
        setFormError(verificationErrors.has(verificationError ?? "")
          ? verificationError
          : en.unableToVerify);
      }
      const remaining = new URLSearchParams(searchParams.toString());
      for (const key of ["verified", "invite", "reason", "error"]) remaining.delete(key);
      const query = remaining.toString();
      window.history.replaceState(null, "", query ? `/login?${query}` : "/login");
    }, 0);
    return () => window.clearTimeout(noticeTimer);
  }, [searchParams, setFormError]);

  // Tick the rate-limit cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const {
    register, handleSubmit, getValues, setValue, setFocus, control, formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  // Email handoff from forgot password or register (this tab only, read once):
  // prefill the address and go straight to the password. Runs after hydration.
  useEffect(() => {
    const handedOver = takeAuthEmail();
    if (!handedOver) return;
    setValue("email", handedOver);
    setFocus("password");
  }, [setValue, setFocus]);

  const resendVerification = async () => {
    if (resend.state === "sending") return;
    const email = String(getValues("email") ?? "").trim();
    if (!email) { setFormError(en.resendNeedEmail); return; }
    // The same request as before, through the shared enumeration-safe hook.
    const result = await resend.send(email);
    if (!result.ok) { setFormError(result.error || en.unableToVerify); return; }
    focusResendStatus.current = true;
    setFormError(null);
  };

  const trackCaps = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  }, []);

  // Register in visual order so invalid submit focuses email before password.
  // The password field also composes React Hook Form's onBlur with Caps Lock.
  const emailField = register("email");
  const passwordField = register("password");

  const applyEmailFix = (fixed: string) => {
    setValue("email", fixed, { shouldDirty: true, shouldValidate: !!errors.email });
    setFocus("email");
  };

  // Where a signed-in user actually belongs. Shared by the plain sign-in and
  // by the school picker so the two can never drift apart.
  const landAfterLogin = useCallback(async (user: LoginUser) => {
    if ((user as LoginUser & { mfaRequired?: boolean }).mfaRequired) {
      // Carry the requested page through the second factor; it is validated again on landing.
      const requested = searchParams.get("redirect");
      window.location.assign(requested ? `/protect-account?redirect=${encodeURIComponent(requested)}` : "/protect-account");
      return;
    }
    toast.success(fillText(t.welcomeToast, user.fullName));
    setSuccess(true);

    // Let the button's checkmark morph (and the mascot's happy cap hop) play
    // before navigating away — a beat of confirmation feels more deliberate.
    await new Promise((resolve) => setTimeout(resolve, 550));

    // SKAI-1021 / SKAI-1063: a full-document navigation, not router.push. A soft
    // navigation keeps every module-level client cache (shell session, access map,
    // router segment cache) from whatever identity this tab held before, and turns
    // a proxy redirect on the RSC request into "nothing happened, still on /login".
    // A document load starts the new identity from a clean JavaScript heap and lets
    // the server's answer (console, onboarding, or a visible error) be what shows.
    if (user.mustChangePassword) {
      window.location.assign("/first-login");
    } else if (user.role === "TEACHER" && !user.onboardingComplete) {
      window.location.assign("/teacher-onboarding");
    } else {
      // A deep link that sent the user here is honoured only inside their own role's area.
      window.location.assign(safeReturnPath(searchParams.get("redirect"), user.role) ?? dashboardPathForRole(user.role));
    }
  }, [t, searchParams]);

  /**
   * One request shape for both passes. The second pass adds `schoolId`, which
   * narrows the candidate lookup to the school the user picked.
   */
  const attemptLogin = useCallback(async (
    data: LoginFormData,
    schoolId?: string,
  ): Promise<{ choices: SchoolChoice[] } | { user: LoginUser }> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Every pass, including the school-picker re-POST, carries the sign-in language (design §B.1.2).
      body: JSON.stringify({ ...data, rememberMe: remember, ...(schoolId ? { schoolId } : {}), ...signInLanguage() }),
    });
    const json = await res.json();

    if (res.status === 429) {
      // Honour the server's own Retry-After rather than guessing.
      const retry = Number(res.headers.get("Retry-After")) || 60;
      setCooldownTotal(retry);
      setCooldown(retry);
      throw new Error(json.error || en.tooMany);
    }
    if (!res.ok) {
      // Zod field errors come back as an object; flatten to the first message.
      const raw = json.error;
      const message = typeof raw === "string"
        ? raw
        : Object.values(raw ?? {}).flat()[0] as string | undefined;
      throw new Error(message || en.loginFailed);
    }
    if (json.needsSchoolSelection) return { choices: json.schools as SchoolChoice[] };
    // The MFA-ticket response is not a session: keep the explicit flag for /protect-account (AC9b).
    if (json.success === true && !json.mfaRequired) clearExplicit();
    return { user: json.user as LoginUser };
  }, [remember, signInLanguage, clearExplicit]);

  const onSubmit = async (data: LoginFormData) => {
    if (cooldown > 0) return;
    setIsLoading(true);
    setFormError(null);
    try {
      const result = await attemptLogin(data);
      countOutcome(null);
      if ("choices" in result) {
        setChoices(result.choices);
        setIsLoading(false);
        return;
      }
      await landAfterLogin(result.user);
    } catch (e) {
      const message = e instanceof Error ? e.message : en.loginFailed;
      countOutcome(message);
      setFormError(message);
      toast.error(localize(message));
      setIsLoading(false);
    }
  };

  // Second pass: the password is already verified, so this re-submits the same
  // credentials pinned to one school rather than asking for them again.
  const pickSchool = async (choice: SchoolChoice) => {
    setChoosing(choice.schoolId);
    setFormError(null);
    try {
      const result = await attemptLogin(getValues(), choice.schoolId);
      if ("choices" in result) throw new Error(en.schoolFailed);
      countOutcome(null);
      await landAfterLogin(result.user);
    } catch (e) {
      const message = e instanceof Error ? e.message : en.loginFailed;
      countOutcome(message);
      setFormError(message);
      toast.error(localize(message));
      setChoosing(null);
    }
  };

  return (
    <AuthShell
      language={language}
      srHeading={t.srHeading}
      cover={(
        <AuthCover
          eyebrow={t.eyebrow}
          heading={{ light: t.title.light, strong: t.title.strong, as: "h1" }}
          index={{
            label: ac.trustLabel,
            items: [
              authClaimItem(language, "campuses"),
              authClaimItem(language, "encrypted", { body: false }),
              authClaimItem(language, "human"),
              authClaimItem(language, "languages"),
            ],
          }}
          footnote={t.footnote}
        />
      )}
      topBar={<AuthTopBar languageId="login-language" label={ac.language} value={language} onChange={setLanguage} />}
      footer={<AuthColophon language={language} claims={["encrypted", "human", "languages"]} />}
    >
      {/* The one live face: watches the fields, closes its eyes on the password. */}
      <AuthMascot
        className="sk-enter mt-6"
        signals={{
          error: formError ? `${errorSeq}:${formError}` : null,
          success,
          waiting: cooldown > 0,
          glance: nudge ? nudgeLook : null,
        }}
      />

      <div className="sk-enter mt-7 text-center" style={delay(70)}>
        <h2 ref={schoolHeadingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl">
          {choices ? t.chooseSchool : t.welcome}
        </h2>
        <p className="mt-2 text-md leading-relaxed text-ink-muted">
          {choices ? t.chooseSchoolBody : t.welcomeBody}
        </p>
      </div>

      <div className="sk-enter sk-panel sk-gradient-border mt-7 p-6 shadow-xl sm:p-9" style={delay(140)}>
        {formError && (
          <Alert
            id="login-error"
            ref={errorRef}
            tabIndex={-1}
            tone="danger"
            title={localize(formError)}
            className="sk-shake mb-5"
            actions={(resendableErrors.has(formError) || formError === en.resendNeedEmail) ? (
              <Button variant="outline" size="sm" type="button" onClick={resendVerification} loading={resend.state === "sending"}>{resend.state === "sending" ? ac.resend.sending : ac.resend.send}</Button>
            ) : undefined}
          />
        )}

        {showResendStatus && (
          <Alert id="login-resend-status" ref={resendStatusRef} tabIndex={-1} tone="success" title={ac.resend.sent} className="mb-5" />
        )}

        {phoneMode ? (
          <GuardianPhoneSignIn
            language={language}
            rememberMe={remember}
            extraBody={signInLanguage}
            onSignedIn={async (json) => {
              if (json.success === true && !json.mfaRequired) clearExplicit();
              await landAfterLogin((json.mfaRequired ? { ...(json.user as object), mfaRequired: true } : json.user) as LoginUser);
            }}
            onBack={() => setPhoneMode(false)}
          />
        ) : choices ? (
          <div className="space-y-2.5">
            {choices.map((c, i) => {
              const busy = choosing === c.schoolId;
              const logoSrc = resolveMediaUrl(c.logoUrl);
              return (
                // The arrival lives on a wrapper: an `sk-enter` fill would pin the
                // button's transform and swallow its hover lift.
                <div key={c.schoolId} className="sk-enter" style={delay(i * 60)}>
                  <Button variant="choice"
                    type="button"
                    onClick={() => pickSchool(c)}
                    disabled={!!choosing}
                    aria-busy={busy}
                    data-mascot-look=""
                    className="sk-hover-lift sk-press group flex w-full items-center justify-start gap-4 p-4 text-start"
                  >
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt=""
                        className="sk-icon-tile h-11 w-11 shrink-0 rounded-2xl object-cover shadow-sm"
                      />
                    ) : (
                      <span aria-hidden="true" className="sk-icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-400 text-md font-bold text-white shadow-sm shadow-primary/25">
                        {c.schoolName.trim().charAt(0).toUpperCase() || "S"}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-strong">
                        {c.schoolName}
                      </span>
                      <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" size="sm">
                          {roleLabel(c.role, language)}
                        </Badge>
                        {(c.campusName || c.schoolCity) && (
                          <span className="min-w-0 truncate text-xs text-ink-subtle">
                            {c.campusName || c.schoolCity}
                          </span>
                        )}
                      </span>
                    </span>
                    {busy ? (
                      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 motion-safe:animate-spin text-primary" />
                    ) : (
                      <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-subtle transition-all rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 group-hover:text-primary" />
                    )}
                  </Button>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              onClick={() => { setChoices(null); setFormError(null); }}
              disabled={!!choosing}
              className="mt-2 w-full"
            >
              <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 rtl:-scale-x-100" /> {t.differentAccount}
            </Button>
          </div>
        ) : (
          <>
            {/* SKAI-1033: method/action make any native (pre-hydration) submission a POST to an
                endpoint that discards the body, so credentials can never be serialized into a URL. */}
            <form method="post" action="/api/auth/login/fallback" onSubmit={handleSubmit(onSubmit)} aria-busy={isLoading} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="ms-1 text-ink-strong">
                  {t.email}
                </Label>
                <InputGroup surfaceClassName="bg-[#eff6ff]">
                  <Mail aria-hidden="true" data-field-affix="start" className="h-4 w-4" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="next"
                    autoFocus
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "login-email-error" : undefined}
                    placeholder="principal@institution.edu.pk"
                    {...emailField}
                  />
                </InputGroup>
                {errors.email && <FieldError id="login-email-error">{localize(errors.email.message ?? "")}</FieldError>}
                <EmailTypoRescue control={control} language={language} onApply={applyEmailFix} />
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
                  <Label htmlFor="password" className="text-ink-strong">
                    {t.password}
                  </Label>
                  {/* The ::after widens the tap target to 32px without moving the row or the
                      underline; it stops exactly where the password field starts. */}
                  <Link
                    id="login-forgot-link"
                    href="/forgot-password"
                    className="sk-link relative text-xs after:absolute after:-inset-x-1 after:-inset-y-2"
                    data-attention={nudge || undefined}
                    // Hand the typed address to the recovery form (this tab only, never a URL).
                    onClick={() => stashAuthEmail(getValues("email") ?? "")}
                  >
                    {t.forgot}
                  </Link>
                </div>
                <InputGroup surfaceClassName="bg-[#fdf2f8]">
                  <Lock aria-hidden="true" data-field-affix="start" className="h-4 w-4" />
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? "login-password-error" : capsOn ? "login-caps-lock" : undefined}
                    placeholder="••••••••"
                    {...passwordField}
                    onKeyUp={trackCaps}
                    onKeyDown={trackCaps}
                    onBlur={(e) => { setCapsOn(false); passwordField.onBlur(e); }}
                  />
                  <FieldAction data-field-affix="end"
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? t.hidePassword : t.showPassword}
                    aria-pressed={showPass}
                    aria-controls="password"
                    className="cursor-pointer"
                  >
                    {showPass ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                  </FieldAction>
                </InputGroup>
                {errors.password && <FieldError id="login-password-error">{localize(errors.password.message ?? "")}</FieldError>}
                {capsOn && !errors.password && (
                  <p id="login-caps-lock" role="status" className="flex items-center gap-1.5 px-1 text-xs font-medium text-status-warning-text">
                    <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" /> {t.capsLock}
                  </p>
                )}
              </div>

              {/* A 30-day session instead of 7 — an explicit choice, never the
                  default, since school accounts are often on shared machines. */}
              <div className="flex items-center gap-1 px-1 pt-0.5">
                <label className="group flex min-h-10 cursor-pointer items-center gap-2.5 select-none">
                  <Checkbox
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className="text-sm font-medium text-ink-muted transition-colors group-hover:text-ink-strong">
                    {t.remember}
                  </span>
                </label>
                <InfoTip content={t.rememberTip} />
              </div>

              <Button
                type="submit"
                loading={isLoading && !success}
                disabled={!hydrated || success || cooldown > 0}
                // Signed in: the locked button reads as a genuine success, not a greyed-out failure.
                className={cn(
                  "sk-sweep-trigger group relative mt-1 min-h-12 w-full overflow-hidden",
                  success && "disabled:cursor-default disabled:border-status-success-border disabled:bg-status-success-surface disabled:text-status-success-text",
                )}
              >
                {/* One sweep per hover or keyboard focus; never a loop beside the form. */}
                {!isLoading && !success && cooldown === 0 && (
                  <span aria-hidden="true" className="sk-sweep bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {success ? (
                    <>
                      <CheckCircle2 aria-hidden="true" className="sk-check-pop h-4 w-4" />
                      <span>{t.welcomeDone}</span>
                    </>
                  ) : cooldown > 0 ? (
                    <>
                      <span data-mascot-anchor="cooldown" className="inline-flex">
                        <CountdownRing total={cooldownTotal} remaining={cooldown} />
                      </span>
                      <span data-numeric>{fillText(t.tryAgainIn, cooldown)}</span>
                    </>
                  ) : isLoading ? (
                    <span>{t.signingIn}</span>
                  ) : (
                    <>
                      <span>{t.signIn}</span>
                      <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                    </>
                  )}
                </span>
              </Button>
            </form>

            {PHONE_SIGN_IN && (
              <Button type="button" variant="outline" onClick={() => { setFormError(null); setPhoneMode(true); }} className="mt-4 w-full">
                <Phone aria-hidden="true" className="h-4 w-4" /> {t.phoneSignIn}
              </Button>
            )}

            <div className="mt-6 border-t border-border-subtle pt-5">
              <p className="text-center text-sm leading-relaxed text-ink-muted">
                {t.noAccount}{" "}
                {/* inline-block: on a phone the action moves to its own line whole instead of
                    splitting. The ::after gives it a 44px tap target without changing the line. */}
                <Link href="/register" className="sk-link relative inline-block after:absolute after:-inset-x-1 after:-inset-y-3">
                  {t.createAccount}
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
