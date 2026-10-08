"use client";
import { InputGroup } from "@/components/ui/input-group";


import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MailCheck,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { roleLabel, type UserRole } from "@/lib/roles";
import { membershipPreview } from "@/lib/membership-access";
import { acceptInvite } from "@/app/actions/invite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SkooleeLogo from "@/components/SkooleeLogo";
import { Label } from "@/components/ui/label";

type InviteLanguage = "en" | "ar" | "ur";

const copy = {
  en: {
    secureInvitation: "Secure invitation", title: "Accept invitation", intro: "Set your password to activate your campus account.", language: "Language",
    missingToken: "This invitation link is missing its secure token.", invalid: "This invitation link is invalid or no longer available.",
    expired: "This invitation has expired. Please request a new invite.", cancelled: "This invitation has been cancelled. Please ask your administrator to resend it.",
    alreadyAccepted: "This invitation has already been accepted. Please sign in.", unavailable: "Unable to validate invitation status. Please try again later.",
    expiredNotice: "This invitation has expired. Request a new link.", requestLink: "Request a new link", requestLinkSent: "If the invitation is still available, a new link will be sent. Check your inbox and spam folder, or contact your administrator.",
    validating: "Validating invitation status…", noLongerValid: "This invitation is no longer valid.", scope: "Your invitation scope", invitedBy: "Invited by", administrator: "your institution administrator", expires: "Expires",
    purchasing: "Subscription purchasing", management: "Membership management", fullName: "Your full name", password: "Password", confirmPassword: "Confirm password", createPassword: "Create a secure password", repeatPassword: "Repeat password",
    checks: "Password requirements", eightChars: "8 characters", uppercase: "Uppercase letter", number: "Number", match: "Passwords match", met: "Met", pending: "Needed",
    activate: "Activate account", activating: "Activating account…", returnLogin: "Return to sign in", accepted: "Invitation accepted for {institution} · {campus}. Sign in to your {role} workspace.",
    invalidToken: "This invitation link is incomplete. Open the latest invite email or ask your administrator to resend it.", noActiveInvite: "This invitation is no longer active.",
    completeRequirements: "Please complete the remaining password requirements.", acceptFailed: "Could not accept this invitation. Please try again.",
  },
  ar: {
    secureInvitation: "دعوة آمنة", title: "قبول الدعوة", intro: "أنشئ كلمة مرور لتفعيل حسابك في الفرع.", language: "اللغة",
    missingToken: "رابط الدعوة لا يحتوي على رمز الأمان.", invalid: "رابط الدعوة غير صالح أو لم يعد متاحاً.",
    expired: "انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة.", cancelled: "أُلغيت هذه الدعوة. اطلب من المسؤول إعادة إرسالها.",
    alreadyAccepted: "قُبلت هذه الدعوة من قبل. سجّل الدخول.", unavailable: "تعذر التحقق من حالة الدعوة. حاول مجدداً لاحقاً.",
    expiredNotice: "انتهت صلاحية الدعوة. اطلب رابطاً جديداً.", requestLink: "طلب رابط جديد", requestLinkSent: "إذا كانت الدعوة لا تزال متاحة، فسيُرسل رابط جديد. تحقق من بريدك ومجلد الرسائل غير المرغوب فيها أو تواصل مع المسؤول.",
    validating: "جارٍ التحقق من حالة الدعوة…", noLongerValid: "لم تعد هذه الدعوة صالحة.", scope: "نطاق الدعوة", invitedBy: "أرسل الدعوة", administrator: "مسؤول المؤسسة", expires: "تنتهي في",
    purchasing: "شراء الاشتراك", management: "إدارة العضويات", fullName: "الاسم الكامل", password: "كلمة المرور", confirmPassword: "تأكيد كلمة المرور", createPassword: "أنشئ كلمة مرور آمنة", repeatPassword: "أعد كتابة كلمة المرور",
    checks: "متطلبات كلمة المرور", eightChars: "٨ أحرف", uppercase: "حرف كبير", number: "رقم", match: "كلمتا المرور متطابقتان", met: "مكتمل", pending: "مطلوب",
    activate: "تفعيل الحساب", activating: "جارٍ تفعيل الحساب…", returnLogin: "العودة لتسجيل الدخول", accepted: "قُبلت الدعوة إلى {institution} · {campus}. سجّل الدخول إلى مساحة عمل {role}.",
    invalidToken: "رابط الدعوة غير مكتمل. افتح أحدث رسالة دعوة أو اطلب من المسؤول إعادة إرسالها.", noActiveInvite: "لم تعد هذه الدعوة نشطة.",
    completeRequirements: "أكمل متطلبات كلمة المرور المتبقية.", acceptFailed: "تعذر قبول الدعوة. حاول مجدداً.",
  },
  ur: {
    secureInvitation: "محفوظ دعوت نامہ", title: "دعوت قبول کریں", intro: "اپنے کیمپس اکاؤنٹ کو فعال کرنے کے لیے پاس ورڈ بنائیں۔", language: "زبان",
    missingToken: "دعوت کے لنک میں محفوظ ٹوکن موجود نہیں۔", invalid: "دعوت کا لنک درست نہیں یا اب دستیاب نہیں۔",
    expired: "اس دعوت کی مدت ختم ہو گئی ہے۔ نئی دعوت طلب کریں۔", cancelled: "یہ دعوت منسوخ ہو گئی ہے۔ منتظم سے دوبارہ بھیجنے کو کہیں۔",
    alreadyAccepted: "یہ دعوت پہلے ہی قبول ہو چکی ہے۔ سائن اِن کریں۔", unavailable: "دعوت کی حالت کی تصدیق نہیں ہو سکی۔ بعد میں دوبارہ کوشش کریں۔",
    expiredNotice: "دعوت کی مدت ختم ہو گئی ہے۔ نیا لنک طلب کریں۔", requestLink: "نیا لنک طلب کریں", requestLinkSent: "اگر دعوت اب بھی دستیاب ہوئی تو نیا لنک بھیجا جائے گا۔ اپنا اِن باکس اور اسپام فولڈر دیکھیں یا منتظم سے رابطہ کریں۔",
    validating: "دعوت کی حالت کی تصدیق ہو رہی ہے…", noLongerValid: "یہ دعوت اب درست نہیں۔", scope: "آپ کی دعوت کا دائرہ", invitedBy: "دعوت بھیجنے والا", administrator: "آپ کے ادارے کا منتظم", expires: "میعاد ختم",
    purchasing: "سبسکرپشن کی خریداری", management: "رکنیت کا انتظام", fullName: "پورا نام", password: "پاس ورڈ", confirmPassword: "پاس ورڈ کی تصدیق", createPassword: "محفوظ پاس ورڈ بنائیں", repeatPassword: "پاس ورڈ دوبارہ لکھیں",
    checks: "پاس ورڈ کی شرائط", eightChars: "۸ حروف", uppercase: "بڑا انگریزی حرف", number: "ایک عدد", match: "پاس ورڈ ایک جیسے ہیں", met: "مکمل", pending: "باقی",
    activate: "اکاؤنٹ فعال کریں", activating: "اکاؤنٹ فعال ہو رہا ہے…", returnLogin: "سائن اِن پر واپس جائیں", accepted: "{institution} · {campus} کی دعوت قبول ہو گئی۔ اپنے {role} ورک اسپیس میں سائن اِن کریں۔",
    invalidToken: "دعوت کا لنک مکمل نہیں۔ تازہ ترین دعوتی ای میل کھولیں یا منتظم سے دوبارہ بھیجنے کو کہیں۔", noActiveInvite: "یہ دعوت اب فعال نہیں۔",
    completeRequirements: "پاس ورڈ کی باقی شرائط پوری کریں۔", acceptFailed: "دعوت قبول نہیں ہو سکی۔ دوبارہ کوشش کریں۔",
  },
} as const;

export default function AcceptInvitePage() {
  const [language, setLanguage] = useState<InviteLanguage>("en");
  const t = copy[language];
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [inviteStatus, setInviteStatus] = useState<"pending" | "accepted" | "cancelled" | "expired" | "invalid" | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLoading, setInviteLoading] = useState(true);
  const [details, setDetails] = useState<{ contextKey: string; role: UserRole; institutionName: string; campusName: string; invitedBy: string; expiresAt: string; canPurchaseSubscription: boolean; canManageMemberships: boolean } | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    const pageLanguage = document.documentElement.lang;
    if (pageLanguage === "ar" || pageLanguage === "ur") setLanguage(pageLanguage);
  }, []);

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
        const data = await res.json();

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
      } finally {
        setInviteLoading(false);
      }
    };

    loadInviteStatus();
  }, [token, language]);

  const canSubmit = token && inviteStatus === "pending" && passwordChecks.every((item) => item.met);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError("");

    if (!token) {
      const errorMsg = t.missingToken;
      setValidationError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    if (inviteStatus !== "pending") {
      const errorMsg = t.noActiveInvite;
      setValidationError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    // Check individual password requirements
    const unmetRequirements = passwordChecks.filter(check => !check.met);
    if (unmetRequirements.length > 0) {
      const errorMsg = t.completeRequirements;
      setValidationError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setLoading(true);
    try {
      await acceptInvite(token, password, fullName, details?.contextKey);
      toast.success(t.accepted
        .replace("{role}", details ? roleLabel(details.role, language) : language === "ar" ? "المعيّنة" : language === "ur" ? "مقررہ" : "assigned")
        .replace("{institution}", details?.institutionName || "")
        .replace("{campus}", details?.campusName || ""));
      await new Promise((resolve) => setTimeout(resolve, 140));
      router.push("/login?invite=accepted");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t.acceptFailed;
      setValidationError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main dir={language === "en" ? "ltr" : "rtl"} lang={language} className="grid min-h-screen grid-cols-1 overflow-hidden bg-background font-sans text-foreground md:grid-cols-2">
      <section className="relative hidden min-h-screen overflow-hidden md:block">
        <div className="absolute inset-0 z-10 bg-[#8127cf]/10 mix-blend-multiply" />
        <img
          src="/login.svg"
          alt="Skoolee invitation"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#8127cf]/40 to-transparent" />
        <div className="absolute bottom-12 start-12 z-30 max-w-md rounded-xl border border-white/20 bg-white/70 p-8 shadow-2xl backdrop-blur-[24px]">
          <span className="mb-2 block text-[12px] font-bold uppercase tracking-normal text-[#9c48ea]">
            Secure Invitation
          </span>
          <h1 className="mb-4 text-3xl font-extrabold leading-tight text-[#1f1a23]">
            Create your profile and step into your Skoolee workspace.
          </h1>
          <p className="text-sm font-medium text-ink">
            Your campus role is already prepared. Complete this setup to activate your protected account.
          </p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center overflow-y-auto bg-[#fbf0fe] p-6 md:p-8">
        <div className="w-full max-w-md">
          <div className="mb-10 flex flex-col items-center">
            <div className="mb-4">
              <SkooleeLogo size="1.6rem" />
            </div>
            <div className="h-1 w-12 rounded-full bg-primary" />
          </div>

          <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-8 shadow-[0_32px_64px_rgba(31,26,35,0.04)]">
            <div className="mb-8">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                <MailCheck aria-hidden="true" className="h-3.5 w-3.5" />
                {t.secureInvitation}
              </div>
              <label className="mb-4 flex items-center gap-2 text-sm font-medium text-ink-muted">
                <span>{t.language}</span>
                <select aria-label={t.language} value={language} onChange={event => setLanguage(event.target.value as InviteLanguage)} className="min-h-11 rounded-lg border border-input bg-background px-3 py-2 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  <option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option>
                </select>
              </label>
              <h1 className="text-2xl font-black tracking-normal text-foreground">{t.title}</h1>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-ink-muted">
                {t.intro}
              </p>
            </div>

            {!token ? (
              <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-sm font-bold text-rose-600">
                This invitation link is incomplete. Please open the latest invite email or ask your administrator to resend it.
              </div>
            ) : (
              <>
                {inviteStatus && inviteStatus !== "pending" ? (
                  <div role="alert" className="rounded-3xl border border-status-error-border bg-status-error-surface p-5 text-sm font-bold text-status-error-text mb-5">
                    {inviteMessage || t.noLongerValid}
                    {inviteStatus === "expired" && <button type="button" disabled={loading} className="mt-2 block min-h-11 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={async () => { setLoading(true); try { await fetch("/api/invite/reissue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); setInviteMessage(t.requestLinkSent); } finally { setLoading(false); } }}>{t.requestLink}</button>}
                  </div>
                ) : null}
                {inviteLoading ? (
                  <div role="status" aria-live="polite" className="rounded-2xl border border-border bg-surface-subtle p-5 text-sm font-semibold text-ink-muted">
                    {t.validating}
                  </div>
                ) : null}
                {details && <section className="mb-5 space-y-2 rounded-xl border p-4" aria-label={t.scope}>
                  <h2 className="font-bold">{details.institutionName}</h2>
                  <p>{roleLabel(details.role, language)} · {details.campusName}</p>
                  <p>{t.invitedBy} <bdi>{details.invitedBy || t.administrator}</bdi></p>
                  <p>{t.expires}: <time dateTime={details.expiresAt}>{new Date(details.expiresAt).toLocaleString(language)}</time></p>
                  <ul className="list-inside list-disc">{membershipPreview(details.role, false, false, language).tasks.map(task => <li key={task}>{task}</li>)}</ul>
                  <p><b>{t.purchasing}:</b> {membershipPreview(details.role, details.canPurchaseSubscription, details.canManageMemberships, language).purchasing}</p>
                  <p><b>{t.management}:</b> {membershipPreview(details.role, details.canPurchaseSubscription, details.canManageMemberships, language).management}</p>
                  <p>{membershipPreview(details.role, details.canPurchaseSubscription, details.canManageMemberships, language).ownership} {membershipPreview(details.role, details.canPurchaseSubscription, details.canManageMemberships, language).rank}</p>
                </section>}
                <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2"><Label htmlFor="fullName">{t.fullName}</Label><Input id="fullName" autoComplete="name" required minLength={2} value={fullName} onChange={event => setFullName(event.target.value)} /></div>
                {validationError && (
                  <div role="alert" className="rounded-2xl border border-status-error-border bg-status-error-surface p-4 text-sm font-bold text-status-error-text flex items-start gap-3">
                    <AlertCircle aria-hidden="true" className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>{validationError}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="password" className="ms-1 text-sm font-bold text-ink">
                    {t.password}
                  </Label>
                  <InputGroup className="flex items-center">
                    <Lock aria-hidden="true" data-field-affix="start" className="h-5 w-5" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setValidationError("");
                      }}
                      placeholder={t.createPassword}
                      className="h-14 rounded-lg border-0 bg-transparent font-medium shadow-none focus:bg-transparent"
                    />
                    <button data-field-affix="end"
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="cursor-pointer"
                      aria-label={showPassword ? `${t.password}: ${language === "ar" ? "إخفاء" : language === "ur" ? "چھپائیں" : "hide"}` : `${t.password}: ${language === "ar" ? "إظهار" : language === "ur" ? "دکھائیں" : "show"}`}
                    >
                      {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                    </button>
                  </InputGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="ms-1 text-sm font-bold text-ink">
                    {t.confirmPassword}
                  </Label>
                  <InputGroup className="flex items-center">
                    <ShieldCheck aria-hidden="true" data-field-affix="start" className="h-5 w-5" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setValidationError("");
                      }}
                      placeholder={t.repeatPassword}
                      className="h-14 rounded-lg border-0 bg-transparent font-medium shadow-none focus:bg-transparent"
                    />
                  </InputGroup>
                </div>

                <ul aria-label={t.checks} aria-live="polite" className="grid grid-cols-1 gap-2 rounded-2xl bg-surface-subtle p-4 sm:grid-cols-2">
                  {passwordChecks.map((item) => (
                    <li
                      key={item.label}
                      aria-label={`${item.label}: ${item.met ? t.met : t.pending}`}
                      className="flex min-h-11 items-center justify-between gap-2 text-sm font-semibold text-foreground"
                    >
                      <span>{item.label}</span>
                      <span className={item.met ? "text-success" : "text-ink-muted"}>{item.met ? t.met : t.pending}</span>
                      <CheckCircle2 aria-hidden="true" className={`h-4 w-4 shrink-0 ${item.met ? "text-success" : "text-ink-faint"}`} />
                    </li>
                  ))}
                </ul>

                <Button type="submit" disabled={!canSubmit || loading || inviteStatus !== "pending" || inviteLoading} className="min-h-14 w-full rounded-xl text-base">
                  {loading ? <><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" /><span>{t.activating}</span></> : <span>{t.activate}</span>}
                  {!loading ? <ArrowRight aria-hidden="true" className="h-5 w-5 rtl:-scale-x-100" /> : null}
                </Button>
              </form>
            </>
            )}

            <div className="mt-6 border-t border-[#cfc2d6]/10 pt-6 text-center">
              <Link href="/login" className="min-h-11 inline-flex items-center text-sm font-bold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                {t.returnLogin}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
