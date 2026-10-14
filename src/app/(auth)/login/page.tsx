"use client";
import { FieldAction, InputGroup } from "@/components/ui/input-group";


import { useState, useEffect, useEffectEvent, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { loginSchema, type LoginFormData } from "@/lib/validators/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveMediaUrl } from "@/lib/storage/s3";
import { Button } from "@/components/ui/button";
import {
  Loader2, Eye, EyeOff, ArrowRight, Mail, Lock, ShieldCheck,
  AlertCircle, CheckCircle2, Building2, Sparkles,
  ChevronLeft, Timer, Check,
} from "lucide-react";
import Link from "next/link";
import { dashboardPathForRole, roleLabel } from "@/lib/roles";
import SkooleeLogo from "@/components/SkooleeLogo";
import AvatarOrbit from "@/components/auth/AvatarOrbit";
import LiveActivityTicker from "@/components/auth/LiveActivityTicker";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { LanguageSelect } from "@/components/locale/LanguageSelect";
import { directionFor } from "@/lib/locale/language-cookie";
import type { Language } from "@/lib/locale/package";

/**
 * One proof point on the brand panel, pairing the claim with something concrete
 * so the panel says a thing instead of decorating.
 *
 * This was a three-item carousel on a 6s timer with dot tabs. Rotating it meant
 * remounting the card (`key={slide}`) to re-fire `sk-rise`, so the panel
 * flickered every six seconds next to a form people are trying to type into,
 * and two thirds of the copy was never read. One card, stated once.
 */
const PROOF_ICON = Building2;

/**
 * Every visible login string, co-located like protect-account and
 * accept-invite. Switching language only swaps text nodes, so typed
 * credentials, "remember me" and the school picker survive the change.
 */
const en = {
  language: "Language",
  proof: {
    stat: "Multi",
    unit: "campus by design",
    quote: "One login for the whole group. Each campus stays sealed from the others.",
    caption: "Built for school groups, not single classrooms",
  },
  eyebrow: "AI-assisted school management",
  titleLine1: "Run the whole",
  titleLine2: "institution from",
  titleHighlight: " one place.",
  ticker: "Illustrative activity · synthetic example only",
  encrypted: "Encrypted at rest & in transit",
  humanReviewed: "Human-reviewed AI",
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
  welcomeDone: "Welcome back!",
  tryAgainIn: "Try again in {0}s",
  signingIn: "Signing in…",
  signIn: "Sign in",
  differentAccount: "Use a different account",
  noAccount: "Don't have an account?",
  createAccount: "Create New Account",
  privacy: "Privacy",
  security: "Security",
  aiGovernance: "AI Governance",
  welcomeToast: "Welcome back, {0}!",
  verified: "Account verified. Please log in.",
  invited: "Invitation accepted. Log in with your new password.",
  sessionEnded: "Your session has ended. Please sign in again.",
  unableToVerify: "Unable to verify this link. Please open the latest verification email and try again.",
  tooMany: "Too many attempts. Please wait a moment.",
  loginFailed: "Login failed",
  schoolFailed: "Could not sign in to that school.",
  /** Known English messages (zod, verification redirect, /api/auth/login) → localized text. Unknown text passes through. */
  messages: {} as Record<string, string>,
};
type LoginCopy = typeof en;

const copy: Record<Language, LoginCopy> = {
  en,
  ar: {
    language: "اللغة",
    proof: {
      stat: "متعدد",
      unit: "الفروع بالتصميم",
      quote: "تسجيل دخول واحد للمجموعة كلها. يبقى كل فرع معزولاً عن الآخرين.",
      caption: "مصمَّم لمجموعات المدارس، لا للفصول المنفردة",
    },
    eyebrow: "إدارة مدرسية بمساعدة الذكاء الاصطناعي",
    titleLine1: "أدِر المؤسسة",
    titleLine2: "بأكملها من",
    titleHighlight: " مكان واحد.",
    ticker: "نشاط توضيحي · مثال اصطناعي فقط",
    encrypted: "مشفّر أثناء التخزين والنقل",
    humanReviewed: "ذكاء اصطناعي يراجعه البشر",
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
    welcomeDone: "مرحباً بعودتك!",
    tryAgainIn: "حاول مجدداً بعد {0} ث",
    signingIn: "جارٍ تسجيل الدخول…",
    signIn: "تسجيل الدخول",
    differentAccount: "استخدم حساباً آخر",
    noAccount: "ليس لديك حساب؟",
    createAccount: "إنشاء حساب جديد",
    privacy: "الخصوصية",
    security: "الأمان",
    aiGovernance: "حوكمة الذكاء الاصطناعي",
    welcomeToast: "مرحباً بعودتك، {0}!",
    verified: "تم التحقق من الحساب. سجّل الدخول.",
    invited: "قُبلت الدعوة. سجّل الدخول بكلمة المرور الجديدة.",
    sessionEnded: "انتهت جلستك. سجّل الدخول مجدداً.",
    unableToVerify: "تعذر التحقق من هذا الرابط. افتح أحدث رسالة تحقق وحاول مجدداً.",
    tooMany: "محاولات كثيرة جداً. انتظر قليلاً.",
    loginFailed: "تعذر تسجيل الدخول",
    schoolFailed: "تعذر تسجيل الدخول إلى تلك المدرسة.",
    messages: {
      "Valid email required": "أدخل بريداً إلكترونياً صالحاً",
      "Password required": "كلمة المرور مطلوبة",
      "Invalid email or password": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      "Too many login attempts. Please try again in a minute.": "محاولات تسجيل دخول كثيرة جداً. حاول مجدداً بعد دقيقة.",
      "Account not verified. Please check your email inbox to activate it.": "لم يتم التحقق من الحساب. تحقق من بريدك الإلكتروني لتفعيله.",
      "Login failed": "تعذر تسجيل الدخول",
      "Invalid verification link": "رابط التحقق غير صالح",
      "This verification link is invalid or has expired": "رابط التحقق هذا غير صالح أو انتهت صلاحيته",
      "User not found": "المستخدم غير موجود",
      "Verification failed": "فشل التحقق",
    },
  },
  ur: {
    language: "زبان",
    proof: {
      stat: "متعدد",
      unit: "کیمپس، شروع سے",
      quote: "پورے گروپ کے لیے ایک لاگ اِن۔ ہر کیمپس دوسروں سے الگ اور محفوظ رہتا ہے۔",
      caption: "اسکول گروپس کے لیے بنایا گیا، صرف ایک کلاس روم کے لیے نہیں",
    },
    eyebrow: "اے آئی کی مدد سے اسکول کا انتظام",
    titleLine1: "پورا ادارہ",
    titleLine2: "چلائیں",
    titleHighlight: " ایک ہی جگہ سے۔",
    ticker: "مثالی سرگرمی · صرف فرضی مثال",
    encrypted: "محفوظ شدہ اور منتقلی کے دوران خفیہ کردہ",
    humanReviewed: "انسانوں کا جائزہ لیا ہوا اے آئی",
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
    welcomeDone: "خوش آمدید!",
    tryAgainIn: "{0} سیکنڈ بعد دوبارہ کوشش کریں",
    signingIn: "سائن اِن ہو رہا ہے…",
    signIn: "سائن اِن",
    differentAccount: "کوئی اور اکاؤنٹ استعمال کریں",
    noAccount: "اکاؤنٹ نہیں ہے؟",
    createAccount: "نیا اکاؤنٹ بنائیں",
    privacy: "رازداری",
    security: "سیکیورٹی",
    aiGovernance: "اے آئی گورننس",
    welcomeToast: "خوش آمدید، {0}!",
    verified: "اکاؤنٹ کی تصدیق ہو گئی۔ براہ کرم سائن اِن کریں۔",
    invited: "دعوت قبول ہو گئی۔ اپنے نئے پاس ورڈ سے سائن اِن کریں۔",
    sessionEnded: "آپ کا سیشن ختم ہو گیا۔ دوبارہ سائن اِن کریں۔",
    unableToVerify: "اس لنک کی تصدیق نہیں ہو سکی۔ تازہ ترین تصدیقی ای میل کھولیں اور دوبارہ کوشش کریں۔",
    tooMany: "بہت زیادہ کوششیں۔ تھوڑی دیر انتظار کریں۔",
    loginFailed: "سائن اِن نہیں ہو سکا",
    schoolFailed: "اس اسکول میں سائن اِن نہیں ہو سکا۔",
    messages: {
      "Valid email required": "درست ای میل درج کریں",
      "Password required": "پاس ورڈ درکار ہے",
      "Invalid email or password": "ای میل یا پاس ورڈ غلط ہے",
      "Too many login attempts. Please try again in a minute.": "سائن اِن کی بہت زیادہ کوششیں۔ ایک منٹ بعد دوبارہ کوشش کریں۔",
      "Account not verified. Please check your email inbox to activate it.": "اکاؤنٹ کی تصدیق نہیں ہوئی۔ فعال کرنے کے لیے اپنا ای میل اِن باکس دیکھیں۔",
      "Login failed": "سائن اِن نہیں ہو سکا",
      "Invalid verification link": "تصدیقی لنک درست نہیں",
      "This verification link is invalid or has expired": "یہ تصدیقی لنک درست نہیں یا اس کی مدت ختم ہو گئی ہے",
      "User not found": "صارف نہیں ملا",
      "Verification failed": "تصدیق ناکام ہو گئی",
    },
  },
};

const fill = (template: string, value: string | number) => template.replace("{0}", String(value));

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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, setLanguage, signInLanguage, clearExplicit } = useAuthLanguage();
  const t = copy[language];
  // The one-shot query notice reads the current catalog without re-running (and re-toasting) on a language switch.
  const showNotice = useEffectEvent((notice: "verified" | "invited" | "expired") => {
    if (notice === "verified") toast.success(t.verified, { duration: 8000 });
    else if (notice === "invited") toast.success(t.invited, { duration: 8000 });
    else toast.info(t.sessionEnded, { duration: 8000 });
  });
  const localize = (message: string) => t.messages[message] ?? message;
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState(false);
  const [choices, setChoices] = useState<SchoolChoice[] | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  // Seconds left on a 429. The button stays disabled and says so, rather than
  // letting people hammer a request that cannot succeed yet.
  const [cooldown, setCooldown] = useState(0);
  const brandRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const schoolHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    if (choices) schoolHeadingRef.current?.focus();
  }, [choices]);

  // Subtle parallax: blobs and the avatar orbit drift opposite the cursor
  // for a sense of depth. Written straight to the DOM (no re-render) and
  // skipped entirely on touch devices / reduced-motion.
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
  }, [searchParams]);

  // Tick the rate-limit cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const {
    register, handleSubmit, getValues, formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  const trackCaps = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  }, []);

  // Register in visual order so invalid submit focuses email before password.
  // The password field also composes React Hook Form's onBlur with Caps Lock.
  const emailField = register("email");
  const passwordField = register("password");

  // Where a signed-in user actually belongs. Shared by the plain sign-in and
  // by the school picker so the two can never drift apart.
  const landAfterLogin = useCallback(async (user: LoginUser) => {
    if ((user as LoginUser & { mfaRequired?: boolean }).mfaRequired) { router.push("/protect-account"); return; }
    toast.success(fill(t.welcomeToast, user.fullName));
    setSuccess(true);

    // Let the button's checkmark morph play before navigating away —
    // a beat of confirmation feels more deliberate than an instant jump.
    await new Promise((resolve) => setTimeout(resolve, 550));

    if (user.mustChangePassword) {
      router.push("/first-login");
    } else if (user.role === "TEACHER" && !user.onboardingComplete) {
      router.push("/teacher-onboarding");
    } else {
      router.push(dashboardPathForRole(user.role));
    }
  }, [router, t]);

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
      if ("choices" in result) {
        setChoices(result.choices);
        setIsLoading(false);
        return;
      }
      await landAfterLogin(result.user);
    } catch (e) {
      const message = e instanceof Error ? e.message : en.loginFailed;
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
      if ("choices" in result) throw new Error(t.schoolFailed);
      await landAfterLogin(result.user);
    } catch (e) {
      const message = e instanceof Error ? e.message : en.loginFailed;
      setFormError(message);
      toast.error(localize(message));
      setChoosing(null);
    }
  };

  const ProofIcon = PROOF_ICON;
  const PROOF = t.proof;

  return (
    <main lang={language} dir={directionFor(language)} className="w-full min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)] bg-[#fff7fe] font-sans">

      {/* ─── BRAND PANEL ─────────────────────────────── */}
      <section
        ref={brandRef}
        onMouseLeave={resetBrandParallax}
        onMouseMove={handleBrandMouseMove}
        className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8127cf] via-[#6f1fb8] to-[#4f1487] p-12 xl:p-14"
      >
        {/* Animated mesh — kept strictly inside the brand purple family
            so the panel reads as Skoolee rather than generic dark SaaS.
            Each blob sits in its own parallax wrapper (cursor offset) while
            an inner element carries the independent drift animation. */}
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
          {/* Softens the hard edge where the panel meets the form side. */}
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#fff7fe]/12 to-transparent" />
        </div>

        {/* Orbiting user avatars — "every role, always connected". Anchored
            off the bottom-right corner so it reads as ambient motion behind
            the copy rather than competing with it. */}
        <div
          className="sk-parallax absolute -bottom-16 -right-16 z-0"
          style={{ transform: "translate3d(calc(var(--mx, 0) * -12px), calc(var(--my, 0) * -12px), 0)" }}
        >
          <AvatarOrbit size={340} duration={50} className="opacity-90" />
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
              {t.eyebrow}
            </span>
          </div>

          <h1
            className="sk-rise mt-7 text-[2.9rem] xl:text-[3.4rem] font-black leading-[1.04] tracking-[-0.035em] text-white text-balance"
            style={{ animationDelay: "80ms" }}
          >
            {t.titleLine1}
            <br />
            {t.titleLine2}
            <span className="bg-gradient-to-r from-[#e9d5ff] to-[#f0abfc] bg-clip-text text-transparent">{t.titleHighlight}</span>
          </h1>

          {/* Sits on a mid-purple ground, so the card needs a darker scrim
              and near-opaque text to stay legible. */}
          <div
            className="sk-rise mt-9 rounded-3xl border border-white/25 bg-[#3d0f6b]/40 p-6 shadow-xl backdrop-blur-xl"
            style={{ animationDelay: "160ms" }}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20">
                <ProofIcon className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-2xl font-black tracking-tight text-white">{PROOF.stat}</span>
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#f0dcff]">{PROOF.unit}</span>
                </div>
                <p className="mt-2 text-[15px] font-semibold leading-relaxed text-white">
                  {PROOF.quote}
                </p>
                <p className="mt-2.5 text-xs font-bold text-[#e4c9f7]">{PROOF.caption}</p>
              </div>
            </div>
          </div>

          <div className="sk-rise mt-6" style={{ animationDelay: "240ms" }}>
            <LiveActivityTicker label={t.ticker} />
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[11px] font-bold text-white/75">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> {t.encrypted}</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> {t.humanReviewed}</span>
        </div>
      </section>

      {/* ─── FORM PANEL ──────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-[30rem]">
          {/* Top inline-end corner of the form panel, as on protect-account. */}
          <div className="mb-6 flex justify-end">
            <LanguageSelect id="login-language" label={t.language} value={language} onChange={value => { if (value) setLanguage(value); }} />
          </div>
          {/* Brand mark sits above the form on every breakpoint. */}
          <div className="sk-rise mb-9 flex flex-col items-center">
            <SkooleeLogo size="2.35rem" weight="heavy" />
            <div className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
          </div>

          <div className="sk-rise mb-7 text-center" style={{ animationDelay: "70ms" }}>
            <h2 ref={schoolHeadingRef} tabIndex={-1} className="text-[1.9rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23]">
              {choices ? t.chooseSchool : t.welcome}
            </h2>
            <p className="mt-2 text-[14.5px] font-semibold text-ink-muted">
              {choices ? t.chooseSchoolBody : t.welcomeBody}
            </p>
          </div>

          <div
            className="sk-rise rounded-[30px] border border-[#cfc2d6]/30 bg-white p-8 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-9"
            style={{ animationDelay: "140ms" }}
          >
            {formError && (
              <div
                id="login-error"
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="sk-shake mb-5 flex items-start gap-2.5 rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-status-error-text" />
                <p className="text-[13px] font-bold leading-snug text-status-error-text">{localize(formError)}</p>
              </div>
            )}

            {choices ? (
              <div className="space-y-2.5">
                {choices.map((c, i) => {
                  const busy = choosing === c.schoolId;
                  return (
                    <Button variant="choice"
                      key={c.schoolId}
                      type="button"
                      onClick={() => pickSchool(c)}
                      disabled={!!choosing}
                      aria-busy={busy}
                      className="sk-rise group flex w-full items-center justify-start gap-4 p-4 text-start"
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      {(() => {
                        const logoSrc = resolveMediaUrl(c.logoUrl);
                        if (logoSrc) {
                          return (
                            <img
                              src={logoSrc}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-2xl object-cover shadow-sm"
                            />
                          );
                        }
                        return (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-[15px] font-black text-white shadow-sm shadow-[#8127cf]/25">
                            {c.schoolName.trim().charAt(0).toUpperCase() || "S"}
                          </span>
                        );
                      })()}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-black text-[#1f1a23]">
                          {c.schoolName}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-[#8127cf]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
                            {roleLabel(c.role, language)}
                          </span>
                          {(c.campusName || c.schoolCity) && (
                            <span className="truncate text-[11px] font-bold text-ink-subtle">
                              {c.campusName || c.schoolCity}
                            </span>
                          )}
                        </span>
                      </span>
                      {busy ? (
                        <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin text-[#8127cf]" />
                      ) : (
                        <ArrowRight className="h-4 w-4 shrink-0 text-ink-subtle transition-all rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 group-hover:text-[#8127cf]" />
                      )}
                    </Button>
                  );
                })}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setChoices(null); setFormError(null); }}
                  disabled={!!choosing}
                  className="mt-2 w-full text-xs"
                >
                  <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 rtl:-scale-x-100" /> {t.differentAccount}
                </Button>
              </div>
            ) : (
              <>
            <form onSubmit={handleSubmit(onSubmit)} aria-busy={isLoading} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="ms-1 text-[10px] font-black uppercase tracking-wider text-ink">
                  {t.email}
                </Label>
                <InputGroup surfaceClassName="bg-[#eff6ff]">
                  <Mail aria-hidden="true" data-field-affix="start" className="h-4 w-4" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "login-email-error" : undefined}
                    placeholder="principal@institution.edu.pk"
                    {...emailField}
                  />
                </InputGroup>
                {errors.email && <p id="login-email-error" className="px-1 text-xs font-bold text-status-error-text">{localize(errors.email.message ?? "")}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-wider text-ink">
                    {t.password}
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-[10px] font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]"
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
                {errors.password && <p id="login-password-error" className="px-1 text-xs font-bold text-status-error-text">{localize(errors.password.message ?? "")}</p>}
                {capsOn && !errors.password && (
                  <p id="login-caps-lock" role="status" className="flex items-center gap-1.5 px-1 text-xs font-bold text-status-warning-text">
                    <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" /> {t.capsLock}
                  </p>
                )}
              </div>

              {/* A 30-day session instead of 7 — an explicit choice, never the
                  default, since school accounts are often on shared machines. */}
              <label className="group flex cursor-pointer items-center gap-2.5 px-1 pt-0.5 select-none">
                <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-[7px] border-2 transition-all duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${
                      remember
                        ? "border-[#8127cf] bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-sm shadow-[#8127cf]/30"
                        : "border-[#cfc2d6]/70 bg-white group-hover:border-[#8127cf]/50"
                    }`}
                  >
                    <Check
                      className={`h-3 w-3 text-white transition-all duration-200 ${
                        remember ? "scale-100 opacity-100" : "scale-50 opacity-0"
                      }`}
                      strokeWidth={3.5}
                    />
                  </span>
                </span>
                <span className="text-[12px] font-bold text-ink-muted transition-colors group-hover:text-[#1f1a23]">
                  {t.remember}
                </span>
              </label>

              <Button
                type="submit"
                disabled={isLoading || success || cooldown > 0}
                aria-busy={isLoading && !success}
                className="group relative mt-1 min-h-12 w-full overflow-hidden"
              >
                {!isLoading && !success && cooldown === 0 && (
                  <span className="sk-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {success ? (
                    <>
                      <CheckCircle2 className="sk-check-pop h-4 w-4" />
                      <span>{t.welcomeDone}</span>
                    </>
                  ) : cooldown > 0 ? (
                    <>
                      <Timer className="h-4 w-4" />
                      <span>{fill(t.tryAgainIn, cooldown)}</span>
                    </>
                  ) : isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                      <span>{t.signingIn}</span>
                    </>
                  ) : (
                    <>
                      <span>{t.signIn}</span>
                      <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                    </>
                  )}
                </span>
              </Button>
            </form>

            <div className="mt-6 border-t border-[#cfc2d6]/20 pt-5">
              <p className="text-center text-[12.5px] font-semibold leading-relaxed text-ink-muted">
                {t.noAccount}{" "}
                <Link href="/register" className="font-black text-[#8127cf] transition-colors hover:text-[#9c48ea]">
                  {t.createAccount}
                </Link>
              </p>
            </div>
              </>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-5 text-[11px] font-bold text-ink-subtle">
            <Link href="/privacy" className="transition-colors hover:text-[#8127cf]">{t.privacy}</Link>
            <span className="h-3 w-px bg-[#cfc2d6]/50" />
            <Link href="/security" className="transition-colors hover:text-[#8127cf]">{t.security}</Link>
            <span className="h-3 w-px bg-[#cfc2d6]/50" />
            <Link href="/ai-governance" className="transition-colors hover:text-[#8127cf]">{t.aiGovernance}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
