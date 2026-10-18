"use client";
import { FieldAction, InputGroup } from "@/components/ui/input-group";


import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError, FormField } from "@/components/ui/form-field";
import {
  Loader2, Eye, EyeOff, Lock, ArrowRight, Check, X, KeyRound, ShieldCheck,
} from "lucide-react";
import SkooleeLogo from "@/components/SkooleeLogo";
import { dashboardPathForRole } from "@/lib/roles";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { directionFor } from "@/lib/locale/language-cookie";
import type { Language } from "@/lib/locale/package";

const RULES: ((v: string) => boolean)[] = [
  (v) => v.length >= 8,
  (v) => /[A-Za-z]/.test(v),
  (v) => /[0-9]/.test(v),
  (v) => /[^A-Za-z0-9]/.test(v),
];

const STRENGTH = [
  { bar: "w-0", tone: "bg-edge", text: "text-ink-subtle" },
  { bar: "w-1/4", tone: "bg-rose-400", text: "text-rose-500" },
  { bar: "w-2/4", tone: "bg-amber-400", text: "text-amber-600" },
  { bar: "w-3/4", tone: "bg-brand-400", text: "text-primary" },
  { bar: "w-full", tone: "bg-emerald-500", text: "text-emerald-600" },
];

const en = {
  title: "Set your password",
  intro: "Your account was created with a temporary password. Choose your own to continue — you will only be asked this once.",
  newPassword: "New Password",
  newPlaceholder: "Choose a strong password",
  showNew: "Show new password",
  hideNew: "Hide new password",
  confirmPassword: "Confirm Password",
  confirmPlaceholder: "Type it again",
  showConfirm: "Show confirmed password",
  hideConfirm: "Hide confirmed password",
  rules: ["At least 8 characters", "One letter", "One number", "One symbol (recommended)"],
  strength: ["Too short", "Weak", "Fair", "Good", "Strong"],
  strengthLabel: "Password strength: {0}",
  enterPassword: "Enter a password",
  met: "Met: ",
  notMet: "Not yet met: ",
  passwordError: "Use at least 8 characters, including one letter and one number.",
  confirmError: "Passwords do not match",
  saving: "Saving…",
  save: "Save and continue",
  updated: "Password updated. Welcome to Skoolee.",
  updateFailed: "Could not update password",
  never: "Skoolee will never ask for your password by email or WhatsApp.",
};
type FirstLoginCopy = typeof en;

const copy: Record<Language, FirstLoginCopy> = {
  en,
  ar: {
    title: "عيّن كلمة المرور",
    intro: "أُنشئ حسابك بكلمة مرور مؤقتة. اختر كلمة مرور خاصة بك للمتابعة، ولن يُطلب منك ذلك إلا مرة واحدة.",
    newPassword: "كلمة المرور الجديدة",
    newPlaceholder: "اختر كلمة مرور قوية",
    showNew: "إظهار كلمة المرور الجديدة",
    hideNew: "إخفاء كلمة المرور الجديدة",
    confirmPassword: "تأكيد كلمة المرور",
    confirmPlaceholder: "اكتبها مرة أخرى",
    showConfirm: "إظهار كلمة المرور المؤكدة",
    hideConfirm: "إخفاء كلمة المرور المؤكدة",
    rules: ["٨ أحرف على الأقل", "حرف واحد", "رقم واحد", "رمز واحد (موصى به)"],
    strength: ["قصيرة جداً", "ضعيفة", "مقبولة", "جيدة", "قوية"],
    strengthLabel: "قوة كلمة المرور: {0}",
    enterPassword: "أدخل كلمة مرور",
    met: "مكتمل: ",
    notMet: "غير مكتمل بعد: ",
    passwordError: "استخدم ٨ أحرف على الأقل، منها حرف واحد ورقم واحد.",
    confirmError: "كلمتا المرور غير متطابقتين",
    saving: "جارٍ الحفظ…",
    save: "حفظ ومتابعة",
    updated: "تم تحديث كلمة المرور. مرحباً بك في Skoolee.",
    updateFailed: "تعذر تحديث كلمة المرور",
    never: "لن تطلب Skoolee كلمة مرورك عبر البريد الإلكتروني أو واتساب أبداً.",
  },
  ur: {
    title: "اپنا پاس ورڈ مقرر کریں",
    intro: "آپ کا اکاؤنٹ ایک عارضی پاس ورڈ کے ساتھ بنایا گیا تھا۔ جاری رکھنے کے لیے اپنا پاس ورڈ منتخب کریں، یہ آپ سے صرف ایک بار پوچھا جائے گا۔",
    newPassword: "نیا پاس ورڈ",
    newPlaceholder: "ایک مضبوط پاس ورڈ منتخب کریں",
    showNew: "نیا پاس ورڈ دکھائیں",
    hideNew: "نیا پاس ورڈ چھپائیں",
    confirmPassword: "پاس ورڈ کی تصدیق",
    confirmPlaceholder: "دوبارہ لکھیں",
    showConfirm: "تصدیق شدہ پاس ورڈ دکھائیں",
    hideConfirm: "تصدیق شدہ پاس ورڈ چھپائیں",
    rules: ["کم از کم ۸ حروف", "ایک حرف", "ایک عدد", "ایک علامت (تجویز کردہ)"],
    strength: ["بہت چھوٹا", "کمزور", "مناسب", "اچھا", "مضبوط"],
    strengthLabel: "پاس ورڈ کی مضبوطی: {0}",
    enterPassword: "پاس ورڈ درج کریں",
    met: "مکمل: ",
    notMet: "ابھی باقی: ",
    passwordError: "کم از کم ۸ حروف استعمال کریں، جن میں ایک حرف اور ایک عدد شامل ہو۔",
    confirmError: "پاس ورڈ ایک جیسے نہیں",
    saving: "محفوظ ہو رہا ہے…",
    save: "محفوظ کریں اور جاری رکھیں",
    updated: "پاس ورڈ اپ ڈیٹ ہو گیا۔ Skoolee میں خوش آمدید۔",
    updateFailed: "پاس ورڈ اپ ڈیٹ نہیں ہو سکا",
    never: "Skoolee آپ سے کبھی ای میل یا واٹس ایپ پر پاس ورڈ نہیں مانگے گا۔",
  },
};

export default function FirstLoginPage() {
  const router = useRouter();
  const { language } = useAuthLanguage();
  const t = copy[language];
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passed = useMemo(() => RULES.map((rule) => rule(password)), [password]);
  const score = passed.filter(Boolean).length;
  const strengthIndex = password.length === 0 ? 0 : score;
  const strength = STRENGTH[strengthIndex];
  const required = passed[0] && passed[1] && passed[2];
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = Boolean(required && matches) && !isLoading;
  const passwordError = passwordTouched && !required ? t.passwordError : undefined;
  const confirmError = confirm.length > 0 && !matches ? t.confirmError : undefined;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/first-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t.updateFailed);

      toast.success(t.updated);
      const target =
        json.role === "TEACHER" && !json.onboardingComplete
          ? "/teacher-onboarding"
          : dashboardPathForRole(json.role);
      router.push(target);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : t.updateFailed;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main lang={language} dir={directionFor(language)} className="min-h-screen w-full flex items-center justify-center bg-brand-50 p-4 sm:p-5 font-sans">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-7">
          <SkooleeLogo size="2.2rem" weight="heavy" className="mb-3" />
          <div className="h-0.5 w-10 bg-gradient-to-r from-primary to-brand-400 rounded-full" />
        </div>

        <div className="bg-white rounded-[32px] p-6 sm:p-8 shadow-[0_32px_64px_rgba(31,26,35,0.06)] border border-edge/15">
          <div className="flex flex-col items-start gap-4 mb-7 sm:flex-row">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-primary to-brand-400 flex items-center justify-center shadow-lg shadow-primary/25">
              <KeyRound aria-hidden="true" className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-ink-strong tracking-tight">{t.title}</h1>
              <p className="text-sm font-semibold text-ink-muted mt-1 leading-relaxed">
                {t.intro}
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" aria-busy={isLoading} noValidate>
            {error && (
              <div ref={errorRef} tabIndex={-1} role="group" aria-labelledby="first-login-error" className="rounded-2xl bg-status-error-surface border border-status-error-border px-4 py-3">
                <FieldError id="first-login-error">{error}</FieldError>
              </div>
            )}
            <FormField name="password" id="password" label={t.newPassword} error={passwordError} required>
              <InputGroup>
                <Lock aria-hidden="true" data-field-affix="start" className="h-4 w-4 text-ink-subtle" />
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setPasswordTouched(true)}
                  autoFocus
                  autoComplete="new-password"
                  aria-describedby="first-password-strength first-password-rules"
                  placeholder={t.newPlaceholder}
                  readOnly={isLoading}
                />
                <FieldAction type="button" data-field-affix="end" disabled={isLoading} onClick={() => setShow(value => !value)} aria-controls="password" aria-label={show ? t.hideNew : t.showNew}>
                  {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </FieldAction>
              </InputGroup>
            </FormField>
            <div className="px-1">
              <div aria-hidden="true" className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full motion-safe:transition-all motion-safe:duration-300 ${strength.bar} ${strength.tone}`} />
              </div>
              <p id="first-password-strength" className="text-sm font-semibold mt-1.5 text-ink-muted">
                {password.length > 0 ? t.strengthLabel.replace("{0}", t.strength[strengthIndex]) : t.enterPassword}
              </p>
            </div>
            <ul id="first-password-rules" className="grid grid-cols-1 gap-x-4 gap-y-2 px-1 sm:grid-cols-2">
              {t.rules.map((label, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden="true" className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${passed[i] ? "bg-emerald-800" : "bg-muted"}`}>
                    {passed[i] ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} /> : <X className="h-2.5 w-2.5 text-ink-muted" strokeWidth={3.5} />}
                  </span>
                  <span className={`text-sm font-semibold ${passed[i] ? "text-ink" : "text-ink-muted"}`}>
                    <span className="sr-only">{passed[i] ? t.met : t.notMet}</span>{label}
                  </span>
                </li>
              ))}
            </ul>
            <FormField name="confirm" id="confirm" label={t.confirmPassword} error={confirmError} required>
              <InputGroup>
                <ShieldCheck aria-hidden="true" data-field-affix="start" className="h-4 w-4 text-ink-subtle" />
                <Input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder={t.confirmPlaceholder}
                  readOnly={isLoading}
                />
                <FieldAction type="button" data-field-affix="end" disabled={isLoading} onClick={() => setShowConfirm(value => !value)} aria-controls="confirm" aria-label={showConfirm ? t.hideConfirm : t.showConfirm}>
                  {showConfirm ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </FieldAction>
              </InputGroup>
            </FormField>
            <p role="status" className="sr-only">{isLoading ? t.saving : ""}</p>
            <Button type="submit" disabled={!canSubmit} className="w-full">
              {isLoading ? <><Loader2 aria-hidden="true" className="motion-safe:animate-spin" /><span>{t.saving}</span></> : <><span>{t.save}</span><ArrowRight aria-hidden="true" className="rtl:rotate-180" /></>}
            </Button>
          </form>
        </div>

        <p className="text-center text-2xs font-bold text-ink-subtle mt-5">
          {t.never}
        </p>
      </div>
    </main>
  );
}
