"use client";
import { FieldAction, InputGroup } from "@/components/ui/input-group";


import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleMinus,
  Eye,
  EyeOff,
  Lock,
  MailCheck,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { roleLabel, type UserRole } from "@/lib/roles";
import { membershipPreview } from "@/lib/membership-access";
import { acceptInviteResult } from "@/app/actions/invite";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SkeletonBar } from "@/components/ui/skeleton";
import { InfoTip, Tooltip } from "@/components/ui/tooltip";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { AuthCover } from "@/components/auth/AuthCover";
import { AuthColophon, authClaimItem } from "@/components/auth/AuthColophon";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { RequirementChecklist } from "@/components/auth/RequirementChecklist";
import { authCopy } from "@/lib/auth/auth-copy";
import { cn } from "@/lib/utils";

// SKO-457: the server's expected refusals, translated; unknown text falls back to the generic failure.
const INVITE_ERRORS: Record<string, { en: string; ar: string; ur: string }> = {
  "Invite expired": { en: "This invitation has expired. Ask the school to send a new one.", ar: "انتهت صلاحية هذه الدعوة. اطلب من المدرسة إرسال دعوة جديدة.", ur: "اس دعوت کی مدت ختم ہو گئی ہے۔ اسکول سے نئی دعوت بھیجنے کو کہیں۔" },
  "Invite already used": { en: "This invitation has already been used. Sign in instead.", ar: "تم استخدام هذه الدعوة من قبل. سجّل الدخول بدلاً من ذلك.", ur: "یہ دعوت پہلے ہی استعمال ہو چکی ہے۔ اس کے بجائے سائن اِن کریں۔" },
  "Invite cancelled": { en: "This invitation was cancelled by the school.", ar: "ألغت المدرسة هذه الدعوة.", ur: "اسکول نے یہ دعوت منسوخ کر دی ہے۔" },
  "Invalid invite token": { en: "This invitation link is not valid.", ar: "رابط الدعوة هذا غير صالح.", ur: "دعوت کا یہ لنک درست نہیں۔" },
  "Invitation details changed. Reload and review the school, campus and role before accepting.": { en: "Invitation details changed. Reload and review the school, campus and role before accepting.", ar: "تغيّرت تفاصيل الدعوة. أعد التحميل وراجع المدرسة والفرع والدور قبل القبول.", ur: "دعوت کی تفصیلات بدل گئی ہیں۔ قبول کرنے سے پہلے صفحہ دوبارہ لوڈ کر کے اسکول، کیمپس اور کردار دیکھیں۔" },
  "Unable to accept. Wait five minutes and try again.": { en: "Unable to accept. Wait five minutes and try again.", ar: "تعذر القبول. انتظر خمس دقائق ثم حاول مجدداً.", ur: "قبول نہیں ہو سکا۔ پانچ منٹ انتظار کر کے دوبارہ کوشش کریں۔" },
  "An account already exists for this email": { en: "An account already exists for this email. Sign in instead.", ar: "يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بدلاً من ذلك.", ur: "اس ای میل کا اکاؤنٹ پہلے سے موجود ہے۔ اس کے بجائے سائن اِن کریں۔" },
  "Password must be at least 8 characters": { en: "Password must be at least 8 characters.", ar: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.", ur: "پاس ورڈ کم از کم 8 حروف کا ہونا چاہیے۔" },
  "Password must be between 8 and 72 characters": { en: "Password must be between 8 and 72 characters.", ar: "يجب أن تكون كلمة المرور بين 8 و72 حرفاً.", ur: "پاس ورڈ 8 سے 72 حروف کے درمیان ہونا چاہیے۔" },
  "Invitation is no longer active": { en: "This invitation is no longer active. Ask the school to send a new one.", ar: "لم تعد هذه الدعوة نشطة. اطلب من المدرسة إرسال دعوة جديدة.", ur: "یہ دعوت اب فعال نہیں۔ اسکول سے نئی دعوت بھیجنے کو کہیں۔" },
};
const inviteErrorText = (message: string, language: "en" | "ar" | "ur") => INVITE_ERRORS[message]?.[language] ?? "";

const copy = {
  en: {
    secureInvitation: "Secure invitation", title: "Accept invitation", brandTitle: { light: "Create your profile and step into", strong: "your Skoolee workspace." }, brandBody: "Your role is already prepared. Complete this setup to activate your protected account.", intro: "Set your password to activate your Skoolee account.", language: "Language",
    // Role-aware lines (SPEC §8.2): families and learners never read "campus account".
    introStaff: "Set your password to activate your campus account.", introFamily: "Set your password to open your family account.", introLearner: "Set your password to open your learner account.",
    brandBodyFamily: "Your family access is already prepared. Complete this setup to open your protected account.", brandBodyLearner: "Your learner access is already prepared. Complete this setup to open your protected account.",
    // The staff footer (ownership, employment rank) never reaches families or learners (R7).
    privacyFamily: "This account shows only the children linked to it. Your school decides what each guardian can see.", privacyLearner: "This account shows only your own lessons, work and results.",
    missingToken: "This invitation link is missing its secure token.", invalid: "This invitation link is invalid or no longer available.",
    expired: "This invitation has expired. Please request a new invite.", cancelled: "This invitation has been cancelled. Please ask your administrator to resend it.",
    alreadyAccepted: "This invitation has already been accepted. Please sign in.", unavailable: "Could not check this invitation right now. Check your connection and try again.",
    expiredNotice: "This invitation has expired. Request a new link.", requestLink: "Request a new link", requestLinkSent: "If the invitation is still available, a new link will be sent. Check your inbox and spam folder, or contact your administrator.",
    validating: "Validating invitation status…", noLongerValid: "This invitation is no longer valid.", scope: "Your invitation scope", invitedBy: "Invited by", administrator: "your institution administrator", expires: "Expires",
    purchasing: "Subscription purchasing", management: "Membership management", fullName: "Your full name", password: "Password", confirmPassword: "Confirm password", createPassword: "Create a secure password", repeatPassword: "Repeat password",
    checks: "Password requirements", eightChars: "8 characters", uppercase: "Uppercase letter", number: "Number", match: "Passwords match", met: "Met", pending: "Needed",
    activate: "Activate account", activating: "Activating account…", returnLogin: "Return to sign in", accepted: "Invitation accepted for {institution} · {campus}. Sign in to your {role} workspace.",
    invalidToken: "This invitation link is incomplete. Open the latest invite email or ask your administrator to resend it.", noActiveInvite: "This invitation is no longer active.",
    completeRequirements: "Please complete the remaining password requirements.", acceptFailed: "Could not accept this invitation. Please try again.",
    acceptUnreachable: "Could not reach Skoolee to activate your account. Check your connection and try again.",
    requestLinkFailed: "Could not request a new link. Check your connection and try again.", retry: "Try again", signIn: "Sign in",
    fullNameHint: "This becomes the name on your Skoolee account.", tasksHeading: "What you'll be able to do",
    expiresInfo: "After this time the link stops working. You can then request a new link from this page.",
  },
  ar: {
    secureInvitation: "دعوة آمنة", title: "قبول الدعوة", brandTitle: { light: "أنشئ ملفك الشخصي وادخل إلى", strong: "مساحة عملك في Skoolee." }, brandBody: "دورك جاهز بالفعل. أكمل هذا الإعداد لتفعيل حسابك المحمي.", intro: "أنشئ كلمة مرور لتفعيل حسابك في Skoolee.", language: "اللغة",
    introStaff: "أنشئ كلمة مرور لتفعيل حسابك في الفرع.", introFamily: "أنشئ كلمة مرور لفتح حساب أسرتك.", introLearner: "أنشئ كلمة مرور لفتح حسابك كطالب.",
    brandBodyFamily: "وصول أسرتك جاهز بالفعل. أكمل هذا الإعداد لفتح حسابك المحمي.", brandBodyLearner: "وصولك كطالب جاهز بالفعل. أكمل هذا الإعداد لفتح حسابك المحمي.",
    privacyFamily: "يعرض هذا الحساب الأبناء المرتبطين به فقط، وتحدد مدرستك ما يمكن لكل وليّ أمر رؤيته.", privacyLearner: "يعرض هذا الحساب دروسك وأعمالك ونتائجك فقط.",
    missingToken: "رابط الدعوة لا يحتوي على رمز الأمان.", invalid: "رابط الدعوة غير صالح أو لم يعد متاحاً.",
    expired: "انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة.", cancelled: "أُلغيت هذه الدعوة. اطلب من المسؤول إعادة إرسالها.",
    alreadyAccepted: "قُبلت هذه الدعوة من قبل. سجّل الدخول.", unavailable: "تعذر التحقق من هذه الدعوة الآن. تحقق من اتصالك ثم حاول مجدداً.",
    expiredNotice: "انتهت صلاحية الدعوة. اطلب رابطاً جديداً.", requestLink: "طلب رابط جديد", requestLinkSent: "إذا كانت الدعوة لا تزال متاحة، فسيُرسل رابط جديد. تحقق من بريدك ومجلد الرسائل غير المرغوب فيها أو تواصل مع المسؤول.",
    validating: "جارٍ التحقق من حالة الدعوة…", noLongerValid: "لم تعد هذه الدعوة صالحة.", scope: "نطاق الدعوة", invitedBy: "أرسل الدعوة", administrator: "مسؤول المؤسسة", expires: "تنتهي في",
    purchasing: "شراء الاشتراك", management: "إدارة العضويات", fullName: "الاسم الكامل", password: "كلمة المرور", confirmPassword: "تأكيد كلمة المرور", createPassword: "أنشئ كلمة مرور آمنة", repeatPassword: "أعد كتابة كلمة المرور",
    checks: "متطلبات كلمة المرور", eightChars: "٨ أحرف", uppercase: "حرف كبير", number: "رقم", match: "كلمتا المرور متطابقتان", met: "مكتمل", pending: "مطلوب",
    activate: "تفعيل الحساب", activating: "جارٍ تفعيل الحساب…", returnLogin: "العودة لتسجيل الدخول", accepted: "قُبلت الدعوة إلى {institution} · {campus}. سجّل الدخول إلى مساحة عمل {role}.",
    invalidToken: "رابط الدعوة غير مكتمل. افتح أحدث رسالة دعوة أو اطلب من المسؤول إعادة إرسالها.", noActiveInvite: "لم تعد هذه الدعوة نشطة.",
    completeRequirements: "أكمل متطلبات كلمة المرور المتبقية.", acceptFailed: "تعذر قبول الدعوة. حاول مجدداً.",
    acceptUnreachable: "تعذر الاتصال بـ Skoolee لتفعيل حسابك. تحقق من اتصالك ثم حاول مجدداً.",
    requestLinkFailed: "تعذر طلب رابط جديد. تحقق من اتصالك ثم حاول مجدداً.", retry: "حاول مجدداً", signIn: "تسجيل الدخول",
    fullNameHint: "سيظهر هذا الاسم في حسابك على Skoolee.", tasksHeading: "ما الذي ستتمكن من فعله",
    expiresInfo: "بعد هذا الوقت يتوقف الرابط عن العمل، ويمكنك عندها طلب رابط جديد من هذه الصفحة.",
  },
  ur: {
    secureInvitation: "محفوظ دعوت نامہ", title: "دعوت قبول کریں", brandTitle: { light: "اپنی پروفائل بنائیں اور", strong: "اپنے Skoolee ورک اسپیس میں قدم رکھیں۔" }, brandBody: "آپ کا کردار پہلے سے تیار ہے۔ اپنا محفوظ اکاؤنٹ فعال کرنے کے لیے یہ سیٹ اپ مکمل کریں۔", intro: "اپنا Skoolee اکاؤنٹ فعال کرنے کے لیے پاس ورڈ بنائیں۔", language: "زبان",
    introStaff: "اپنے کیمپس اکاؤنٹ کو فعال کرنے کے لیے پاس ورڈ بنائیں۔", introFamily: "اپنا خاندانی اکاؤنٹ کھولنے کے لیے پاس ورڈ بنائیں۔", introLearner: "اپنا طالب علم اکاؤنٹ کھولنے کے لیے پاس ورڈ بنائیں۔",
    privacyFamily: "اس اکاؤنٹ میں صرف اس سے منسلک بچے نظر آتے ہیں۔ ہر سرپرست کیا دیکھ سکتا ہے، یہ آپ کا اسکول طے کرتا ہے۔", privacyLearner: "اس اکاؤنٹ میں صرف آپ کے اسباق، کام اور نتائج نظر آتے ہیں۔",
    brandBodyFamily: "آپ کے خاندان کی رسائی پہلے سے تیار ہے۔ اپنا محفوظ اکاؤنٹ کھولنے کے لیے یہ سیٹ اپ مکمل کریں۔", brandBodyLearner: "آپ کی بطور طالب علم رسائی پہلے سے تیار ہے۔ اپنا محفوظ اکاؤنٹ کھولنے کے لیے یہ سیٹ اپ مکمل کریں۔",
    missingToken: "دعوت کے لنک میں محفوظ ٹوکن موجود نہیں۔", invalid: "دعوت کا لنک درست نہیں یا اب دستیاب نہیں۔",
    expired: "اس دعوت کی مدت ختم ہو گئی ہے۔ نئی دعوت طلب کریں۔", cancelled: "یہ دعوت منسوخ ہو گئی ہے۔ منتظم سے دوبارہ بھیجنے کو کہیں۔",
    alreadyAccepted: "یہ دعوت پہلے ہی قبول ہو چکی ہے۔ سائن اِن کریں۔", unavailable: "ابھی اس دعوت کی جانچ نہیں ہو سکی۔ اپنا کنکشن چیک کر کے دوبارہ کوشش کریں۔",
    expiredNotice: "دعوت کی مدت ختم ہو گئی ہے۔ نیا لنک طلب کریں۔", requestLink: "نیا لنک طلب کریں", requestLinkSent: "اگر دعوت اب بھی دستیاب ہوئی تو نیا لنک بھیجا جائے گا۔ اپنا اِن باکس اور اسپام فولڈر دیکھیں یا منتظم سے رابطہ کریں۔",
    validating: "دعوت کی حالت کی تصدیق ہو رہی ہے…", noLongerValid: "یہ دعوت اب درست نہیں۔", scope: "آپ کی دعوت کا دائرہ", invitedBy: "دعوت بھیجنے والا", administrator: "آپ کے ادارے کا منتظم", expires: "میعاد ختم",
    purchasing: "سبسکرپشن کی خریداری", management: "رکنیت کا انتظام", fullName: "پورا نام", password: "پاس ورڈ", confirmPassword: "پاس ورڈ کی تصدیق", createPassword: "محفوظ پاس ورڈ بنائیں", repeatPassword: "پاس ورڈ دوبارہ لکھیں",
    checks: "پاس ورڈ کی شرائط", eightChars: "۸ حروف", uppercase: "بڑا انگریزی حرف", number: "ایک عدد", match: "پاس ورڈ ایک جیسے ہیں", met: "مکمل", pending: "باقی",
    activate: "اکاؤنٹ فعال کریں", activating: "اکاؤنٹ فعال ہو رہا ہے…", returnLogin: "سائن اِن پر واپس جائیں", accepted: "{institution} · {campus} کی دعوت قبول ہو گئی۔ اپنے {role} ورک اسپیس میں سائن اِن کریں۔",
    invalidToken: "دعوت کا لنک مکمل نہیں۔ تازہ ترین دعوتی ای میل کھولیں یا منتظم سے دوبارہ بھیجنے کو کہیں۔", noActiveInvite: "یہ دعوت اب فعال نہیں۔",
    completeRequirements: "پاس ورڈ کی باقی شرائط پوری کریں۔", acceptFailed: "دعوت قبول نہیں ہو سکی۔ دوبارہ کوشش کریں۔",
    acceptUnreachable: "اکاؤنٹ فعال کرنے کے لیے Skoolee سے رابطہ نہیں ہو سکا۔ اپنا کنکشن چیک کر کے دوبارہ کوشش کریں۔",
    requestLinkFailed: "نیا لنک طلب نہیں ہو سکا۔ اپنا کنکشن چیک کر کے دوبارہ کوشش کریں۔", retry: "دوبارہ کوشش کریں", signIn: "سائن اِن کریں",
    fullNameHint: "یہی نام آپ کے Skoolee اکاؤنٹ پر دکھایا جائے گا۔", tasksHeading: "آپ کیا کر سکیں گے",
    expiresInfo: "اس وقت کے بعد یہ لنک کام نہیں کرے گا۔ پھر آپ اسی صفحے سے نیا لنک طلب کر سکتے ہیں۔",
  },
} as const;

const delay = (ms: number) => ({ "--sk-delay": `${ms}ms` }) as CSSProperties;

const CAMPUS_STAFF: ReadonlySet<UserRole> = new Set(["CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN"]);
/** Families and learners are invited to their own portal, not a campus account; leaders keep the neutral line. */
function audienceOf(role: UserRole | undefined): "staff" | "family" | "learner" | "other" {
  if (!role) return "other";
  if (role === "PARENT") return "family";
  if (role === "STUDENT") return "learner";
  return CAMPUS_STAFF.has(role) ? "staff" : "other";
}

export default function AcceptInvitePage() {
  const { language, setLanguage } = useAuthLanguage();
  const t = copy[language];
  const ac = authCopy[language];
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [inviteStatus, setInviteStatus] = useState<"pending" | "accepted" | "cancelled" | "expired" | "invalid" | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLoading, setInviteLoading] = useState(true);
  const [details, setDetails] = useState<{ contextKey: string; role: UserRole; institutionName: string; campusName: string; invitedBy: string; expiresAt: string; canPurchaseSubscription: boolean; canManageMemberships: boolean } | null>(null);
  const audience = audienceOf(details?.role);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // The replacement-link request has its own pending state so the (already
  // disabled) activate button never reads "Activating account…" meanwhile.
  const [reissuing, setReissuing] = useState(false);
  // Set only when the status request itself could not complete (offline,
  // unreadable reply); it is what offers "Try again" instead of a dead end.
  const [statusFailed, setStatusFailed] = useState(false);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [validationError, setValidationError] = useState("");
  // Mascot signals: a bump per refusal (concerned glance), and the happy hop once the account is active.
  const [errorSeq, setErrorSeq] = useState(0);
  const [activated, setActivated] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The status alert's action ("Try again" / "Request a new link"). It is
  // disabled while it runs and may be replaced once the reply arrives, so
  // focus is put back on it, or on the page title, when the action settles.
  const statusActionRef = useRef<HTMLButtonElement>(null);
  const restoreStatusFocus = useRef(false);

  useEffect(() => {
    if (validationError) errorRef.current?.focus();
  }, [validationError]);

  const fail = (message: string) => {
    setValidationError(message);
    setErrorSeq((n) => n + 1);
  };

  useEffect(() => {
    if (!restoreStatusFocus.current || inviteLoading || reissuing) return;
    restoreStatusFocus.current = false;
    const active = document.activeElement;
    // Only when focus was lost with the control; never pull it from elsewhere.
    if (active && active !== document.body && active !== statusActionRef.current) return;
    (statusActionRef.current ?? headingRef.current)?.focus();
  }, [inviteLoading, reissuing]);

  const passwordChecks = useMemo(
    () => [
      { label: t.eightChars, met: password.length >= 8 },
      { label: t.uppercase, met: /[A-Z]/.test(password) },
      { label: t.number, met: /[0-9]/.test(password) },
      { label: t.match, met: password !== "" && password === confirmPassword },
    ],
    [confirmPassword, password, t]
  );

  useEffect(() => {
    if (!token) {
      setInviteLoading(false);
      setInviteStatus("invalid");
      setInviteMessage(copy[language].missingToken);
      return;
    }

    const loadInviteStatus = async () => {
      try {
        const res = await fetch(`/api/invite/status?token=${encodeURIComponent(token)}`);
        // A server failure says nothing about the invitation itself, so it is
        // reported as "could not check" with a retry, not as an invalid link.
        if (res.status >= 500) throw new Error("status unavailable");
        const data = await res.json();
        setStatusFailed(false);

        if (!res.ok || !data.success) {
          setInviteStatus("invalid");
          setInviteMessage(copy[language].invalid);
        } else {
          setInviteStatus(data.status || "invalid");
          if (data.status === "pending") setDetails(data);
          if (data.status === "expired") {
            setInviteMessage(copy[language].expired);
          } else if (data.status === "cancelled") {
            setInviteMessage(copy[language].cancelled);
          } else if (data.status === "accepted") {
            setInviteMessage(copy[language].alreadyAccepted);
          } else {
            setInviteMessage("");
          }
        }
      } catch (error) {
        setInviteStatus("invalid");
        setInviteMessage(copy[language].unavailable);
        setStatusFailed(true);
      } finally {
        setInviteLoading(false);
      }
    };

    loadInviteStatus();
  }, [token, language, statusAttempt]);

  // The warning (and its button) stays in place while the status is checked
  // again; the reply then replaces it.
  const retryStatus = () => {
    restoreStatusFocus.current = true;
    setInviteLoading(true);
    setStatusAttempt((attempt) => attempt + 1);
  };

  const requestNewLink = async () => {
    restoreStatusFocus.current = true;
    setReissuing(true);
    try {
      await fetch("/api/invite/reissue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      setInviteMessage(t.requestLinkSent);
    } catch {
      toast.error(t.requestLinkFailed);
    } finally {
      setReissuing(false);
    }
  };

  const canSubmit = token && inviteStatus === "pending" && passwordChecks.every((item) => item.met);
  const preview = details ? membershipPreview(details.role, details.canPurchaseSubscription, details.canManageMemberships, language) : null;
  const reissueSent = inviteStatus === "expired" && inviteMessage === t.requestLinkSent;
  const statusTone: AlertTone = statusFailed
    ? "warning"
    : inviteStatus === "expired"
      ? reissueSent ? "info" : "warning"
      : inviteStatus === "accepted" ? "info" : "danger";
  // Expired, cancelled, accepted, invalid or unchecked: nothing typed here can
  // be submitted, so the fields are inert until a pending status arrives.
  const formLocked = inviteStatus !== null && inviteStatus !== "pending";
  // One string is both the accessible name and the visible tooltip.
  const revealLabel = showPassword
    ? `${t.password}: ${language === "ar" ? "إخفاء" : language === "ur" ? "چھپائیں" : "hide"}`
    : `${t.password}: ${language === "ar" ? "إظهار" : language === "ur" ? "دکھائیں" : "show"}`;

  // Failures are shown once, in the focused inline alert (#invite-error);
  // a toast on top would repeat them and cover the activate button.
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError("");

    if (!token) {
      fail(t.missingToken);
      return;
    }
    if (inviteStatus !== "pending") {
      fail(t.noActiveInvite);
      return;
    }

    // Check individual password requirements
    const unmetRequirements = passwordChecks.filter(check => !check.met);
    if (unmetRequirements.length > 0) {
      fail(t.completeRequirements);
      return;
    }

    setLoading(true);
    try {
      const result = await acceptInviteResult(token, password, fullName, details?.contextKey);
      if (!result.success) {
        fail(inviteErrorText(result.error, language) || t.acceptFailed);
        return;
      }
      setActivated(true);
      toast.success(t.accepted
        .replace("{role}", details ? roleLabel(details.role, language) : language === "ar" ? "المعيّنة" : language === "ur" ? "مقررہ" : "assigned")
        .replace("{institution}", details?.institutionName || "")
        .replace("{campus}", details?.campusName || ""));
      await new Promise((resolve) => setTimeout(resolve, 140));
      router.push("/login?invite=accepted");
    } catch (error) {
      // acceptInviteResult already turns every server refusal into a result, so
      // a throw here is a transport failure; its raw text is not for people.
      fail(t.acceptUnreachable);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      language={language}
      cover={(
        <AuthCover
          eyebrow={t.secureInvitation}
          // The page's one h1 is the form title; the cover line is its tagline.
          heading={{ light: t.brandTitle.light, strong: t.brandTitle.strong, as: "p" }}
          body={audience === "family" ? t.brandBodyFamily : audience === "learner" ? t.brandBodyLearner : t.brandBody}
          index={{
            label: ac.trustLabel,
            items: [
              authClaimItem(language, "campuses"),
              authClaimItem(language, "encrypted", { body: false }),
              authClaimItem(language, "languages"),
            ],
          }}
        />
      )}
      topBar={<AuthTopBar languageId="invite-language" label={t.language} value={language} onChange={setLanguage} />}
      footer={<AuthColophon language={language} claims={["campuses", "encrypted", "languages"]} />}
    >
      {/* The one live face: watches the fields, closes its eyes on the passwords. */}
      <AuthMascot
        className="sk-enter mt-6"
        signals={{
          error: validationError ? `${errorSeq}:${validationError}` : null,
          thinking: inviteLoading || reissuing,
          success: activated,
        }}
      />

      <div className="sk-enter mt-7 flex flex-col items-center text-center" style={delay(70)}>
        {/* Below lg the cover (and its eyebrow) is hidden, so the card says what this is. */}
        <Badge variant="secondary" className="mb-3 lg:hidden">
          <MailCheck aria-hidden="true" />
          {t.secureInvitation}
        </Badge>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl">{t.title}</h1>
        <p className="mt-2 text-md leading-relaxed text-ink-muted">
          {audience === "staff" ? t.introStaff : audience === "family" ? t.introFamily : audience === "learner" ? t.introLearner : t.intro}
        </p>
      </div>

      <div className="sk-enter sk-panel sk-gradient-border mt-7 p-5 shadow-xl sm:p-8" style={delay(140)}>
        {!token ? (
          <Alert tone="danger">{t.invalidToken}</Alert>
        ) : (
          <>
            {inviteStatus && inviteStatus !== "pending" ? (
              <Alert
                tone={statusTone}
                // Always announced as an alert: it is why activation is blocked.
                live="assertive"
                className="mb-5"
                actions={statusFailed ? (
                  <Button ref={statusActionRef} type="button" variant="outline" size="sm" loading={inviteLoading} onClick={retryStatus}>
                    {inviteLoading ? null : <RefreshCw aria-hidden="true" />}
                    {t.retry}
                  </Button>
                ) : inviteStatus === "expired" && !reissueSent ? (
                  // Hidden once sent: the reissue rotates the token, so this link cannot ask again.
                  <Button ref={statusActionRef} type="button" variant="outline" size="sm" loading={reissuing} disabled={loading} onClick={requestNewLink}>
                    {t.requestLink}
                  </Button>
                ) : inviteStatus === "accepted" ? (
                  <Link href="/login" className={buttonVariants({ size: "sm" })}>
                    {t.signIn}
                  </Link>
                ) : undefined}
              >
                {inviteMessage || t.noLongerValid}
              </Alert>
            ) : null}
            {inviteLoading ? (
              <div role="status" aria-live="polite" className="mb-5 rounded-2xl border border-border-subtle bg-surface-subtle p-4 sm:p-5">
                <p className="text-sm font-medium text-ink-muted">{t.validating}</p>
                <div className="mt-4 flex items-start gap-3">
                  <SkeletonBar className="size-10 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <SkeletonBar className="h-3 w-1/3" />
                    <SkeletonBar className="h-5 w-2/3" delay={60} />
                    <SkeletonBar className="h-4 w-1/2" delay={120} />
                  </div>
                </div>
              </div>
            ) : null}
            {details && preview && <section aria-labelledby="invite-scope-title" className="sk-enter mb-6 rounded-2xl border border-border-subtle bg-surface-subtle/70 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-xs ring-1 ring-border-subtle">
                  <Building2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p id="invite-scope-title" className="sk-eyebrow">{t.scope}</p>
                  <h2 className="mt-1 break-words text-lg font-bold leading-snug text-ink-strong">{details.institutionName}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Badge variant="secondary" size="sm">{roleLabel(details.role, language)}</Badge>
                    <span className="inline-flex min-w-0 items-center gap-1 text-sm text-ink-muted">
                      <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="min-w-0 break-words">{details.campusName}</span>
                    </span>
                  </div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-ink-subtle">{t.invitedBy}</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium text-ink-strong"><bdi>{details.invitedBy || t.administrator}</bdi></dd>
                </div>
                <div className="min-w-0">
                  <dt className="flex items-center gap-1 text-xs text-ink-subtle">
                    {t.expires}
                    <InfoTip content={t.expiresInfo} className="-my-1" />
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-strong"><time dateTime={details.expiresAt} className="tabular-nums">{new Date(details.expiresAt).toLocaleString(language)}</time></dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-border-subtle pt-4">
                <h3 className="text-sm font-semibold text-ink-strong">{t.tasksHeading}</h3>
                <ul className="mt-2 space-y-1.5">
                  {preview.tasks.map(task => (
                    <li key={task} className="flex items-start gap-2 text-sm leading-relaxed text-ink">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-success-text" />
                      <span className="min-w-0">{task}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {audience !== "family" && audience !== "learner" && <dl className="mt-4 space-y-3 border-t border-border-subtle pt-4">
                {[
                  // The subscription is shown only to someone who holds it (§0.3 rule 2, R6). No invitation grants it
                  // since G7, so in practice this row never renders; it stays for invitations issued before G7.
                  ...(details.canPurchaseSubscription ? [{ label: t.purchasing, text: preview.purchasing, granted: true }] : []),
                  { label: t.management, text: preview.management, granted: details.canManageMemberships },
                ].map(({ label, text, granted }) => (
                  <div key={label} className="min-w-0">
                    <dt className="flex items-center gap-2 text-sm font-semibold text-ink-strong">
                      {granted
                        ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-status-success-text" />
                        : <CircleMinus aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />}
                      {label}
                    </dt>
                    <dd className="mt-0.5 ps-6 text-sm leading-relaxed text-ink-muted">{text}</dd>
                  </div>
                ))}
              </dl>}
              <p className="mt-4 flex items-start gap-2 border-t border-border-subtle pt-4 text-xs leading-relaxed text-ink-subtle">
                <ShieldCheck aria-hidden="true" className="mt-px size-4 shrink-0" />
                <span>{audience === "family" ? t.privacyFamily : audience === "learner" ? t.privacyLearner : `${preview.ownership} ${preview.rank}`}</span>
              </p>
            </section>}
            <form onSubmit={handleSubmit} aria-busy={loading} className="space-y-5">
              <fieldset disabled={formLocked} className="min-w-0 space-y-5">
                <FormField name="fullName" id="fullName" label={t.fullName} hint={t.fullNameHint}>
                  <Input id="fullName" autoComplete="name" required minLength={2} value={fullName} onChange={event => setFullName(event.target.value)} />
                </FormField>

                <FormField name="password" id="password" label={t.password}>
                  <InputGroup className="flex items-center">
                    <Lock aria-hidden="true" data-field-affix="start" className="h-5 w-5" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      aria-describedby="invite-password-requirements"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setValidationError("");
                      }}
                      placeholder={t.createPassword}
                    />
                    <Tooltip content={revealLabel} describe={false}>
                      <FieldAction data-field-affix="end"
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        className="cursor-pointer"
                        aria-pressed={showPassword}
                        aria-controls="password confirmPassword"
                        aria-label={revealLabel}
                      >
                        {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                      </FieldAction>
                    </Tooltip>
                  </InputGroup>
                </FormField>

                <FormField name="confirmPassword" id="confirmPassword" label={t.confirmPassword}>
                  <InputGroup className="flex items-center">
                    <ShieldCheck aria-hidden="true" data-field-affix="start" className="h-5 w-5" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      aria-describedby="invite-password-requirements"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setValidationError("");
                      }}
                      placeholder={t.repeatPassword}
                    />
                  </InputGroup>
                </FormField>
              </fieldset>

              {/* The page owns the live region (shared Front Desk parts never announce on their own). */}
              <div aria-live="polite" className="rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                <RequirementChecklist
                  id="invite-password-requirements"
                  label={t.checks}
                  items={passwordChecks}
                  stateLabels={{ met: t.met, unmet: t.pending }}
                  columns="single"
                  size="sm"
                />
              </div>

              {validationError && (
                <Alert id="invite-error" ref={errorRef} tabIndex={-1} tone="danger" className="sk-fade-in">
                  {validationError}
                </Alert>
              )}

              <Button
                type="submit"
                loading={loading}
                disabled={!canSubmit || inviteStatus !== "pending" || inviteLoading}
                size="lg"
                className={cn("w-full", canSubmit && !loading && "sk-nudge-trigger")}
              >
                <span>{loading ? t.activating : t.activate}</span>
                {!loading ? (
                  <span aria-hidden="true" className="sk-nudge inline-flex">
                    <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
                  </span>
                ) : null}
              </Button>
            </form>
          </>
        )}

        <div className="mt-6 flex justify-center border-t border-border-subtle pt-6">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "text-primary")}>
            <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
            {t.returnLogin}
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
