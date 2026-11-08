"use client";
import { FieldAction, InputGroup } from "@/components/ui/input-group";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError, FormField } from "@/components/ui/form-field";
import { Progress, type ProgressTone } from "@/components/ui/progress";
import {
  Eye, EyeOff, Lock, ArrowRight, KeyRound, ShieldCheck,
} from "lucide-react";
import { dashboardPathForRole } from "@/lib/roles";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { AuthCover } from "@/components/auth/AuthCover";
import { AuthColophon, authClaimItem } from "@/components/auth/AuthColophon";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { RequirementChecklist } from "@/components/auth/RequirementChecklist";
import { authCopy } from "@/lib/auth/auth-copy";
import { passwordRules, RESET_PASSWORD_MAX } from "@/lib/auth/reset-password-policy";
import type { Language } from "@/lib/locale/package";

/** SKAI-87: the reset policy's four password rules (the fifth, confirmation, is checked separately). */
const meetsRules = (v: string) => passwordRules(v, v).slice(0, 4);
const savable = (p: string, c: string) => meetsRules(p).every(Boolean) && p.length <= RESET_PASSWORD_MAX && c.length > 0 && c === p;

/** Meter colour per strength step (empty, weak … strong). */
const STRENGTH_TONE: ProgressTone[] = ["neutral", "danger", "warning", "brand", "success"];

/** How long the mascot's smile lasts when the password becomes savable (matches the reset form). */
const HAPPY_MS = 1200;

const delay = (ms: number) => ({ "--sk-delay": `${ms}ms` }) as CSSProperties;

const en = {
  eyebrow: "One-time setup",
  /** The cover headline: a light phrase, then the weight-800 phrase with the ink swash. */
  coverTitle: { light: "Make this account", strong: "truly yours." },
  coverBody: "Your school set this account up for you. A password only you know keeps it that way.",
  coverOnce: "Asked for only once",
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
  rules: ["At least 8 characters", "One uppercase letter", "One number", "One symbol"],
  strength: ["Too short", "Weak", "Fair", "Good", "Strong"],
  strengthLabel: "Password strength: {0}",
  enterPassword: "Enter a password",
  met: "Met: ",
  notMet: "Not yet met: ",
  passwordError: "Use 8–72 characters with an uppercase letter, a number and a symbol.",
  reused: "Choose a password you have not used before, including the temporary one.",
  limited: "Too many attempts. Wait five minutes, then try again.",
  notPending: "This password is already set. Sign in again to continue.",
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
    eyebrow: "إعداد لمرة واحدة",
    coverTitle: { light: "اجعل هذا الحساب", strong: "خاصاً بك حقاً." },
    coverBody: "أنشأت مدرستك هذا الحساب لك. كلمة مرور لا يعرفها سواك تُبقيه لك وحدك.",
    coverOnce: "يُطلب منك ذلك مرة واحدة فقط",
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
    rules: ["٨ أحرف على الأقل", "حرف كبير واحد", "رقم واحد", "رمز واحد"],
    strength: ["قصيرة جداً", "ضعيفة", "مقبولة", "جيدة", "قوية"],
    strengthLabel: "قوة كلمة المرور: {0}",
    enterPassword: "أدخل كلمة مرور",
    met: "مكتمل: ",
    notMet: "غير مكتمل بعد: ",
    passwordError: "استخدم من ٨ إلى ٧٢ حرفاً، منها حرف كبير ورقم ورمز.",
    reused: "اختر كلمة مرور لم تستخدمها من قبل، بما فيها كلمة المرور المؤقتة.",
    limited: "محاولات كثيرة جداً. انتظر خمس دقائق ثم حاول مرة أخرى.",
    notPending: "تم تعيين كلمة المرور بالفعل. سجّل الدخول مرة أخرى للمتابعة.",
    confirmError: "كلمتا المرور غير متطابقتين",
    saving: "جارٍ الحفظ…",
    save: "حفظ ومتابعة",
    updated: "تم تحديث كلمة المرور. مرحباً بك في Skoolee.",
    updateFailed: "تعذر تحديث كلمة المرور",
    never: "لن تطلب Skoolee كلمة مرورك عبر البريد الإلكتروني أو واتساب أبداً.",
  },
  ur: {
    eyebrow: "ایک بار کی ترتیب",
    coverTitle: { light: "اس اکاؤنٹ کو", strong: "صحیح معنوں میں اپنا بنائیں۔" },
    coverBody: "آپ کے اسکول نے یہ اکاؤنٹ آپ کے لیے بنایا ہے۔ ایسا پاس ورڈ جو صرف آپ جانتے ہوں، اسے آپ ہی کا رکھتا ہے۔",
    coverOnce: "یہ صرف ایک بار پوچھا جاتا ہے",
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
    rules: ["کم از کم ۸ حروف", "ایک بڑا حرف", "ایک عدد", "ایک علامت"],
    strength: ["بہت چھوٹا", "کمزور", "مناسب", "اچھا", "مضبوط"],
    strengthLabel: "پاس ورڈ کی مضبوطی: {0}",
    enterPassword: "پاس ورڈ درج کریں",
    met: "مکمل: ",
    notMet: "ابھی باقی: ",
    passwordError: "۸ سے ۷۲ حروف استعمال کریں، جن میں ایک بڑا حرف، ایک عدد اور ایک علامت ہو۔",
    reused: "ایسا پاس ورڈ منتخب کریں جو آپ نے پہلے استعمال نہ کیا ہو، بشمول عارضی پاس ورڈ۔",
    limited: "بہت زیادہ کوششیں۔ پانچ منٹ انتظار کریں، پھر دوبارہ کوشش کریں۔",
    notPending: "پاس ورڈ پہلے ہی مقرر ہو چکا ہے۔ جاری رکھنے کے لیے دوبارہ سائن ان کریں۔",
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
  const { language, setLanguage } = useAuthLanguage();
  const t = copy[language];
  const ac = authCopy[language];
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mascot signals: a bump per failed save (concerned glance), and short happy beats.
  const [errorSeq, setErrorSeq] = useState(0);
  const [readyPulse, setReadyPulse] = useState(false);
  const [saved, setSaved] = useState(false);

  const passed = useMemo(() => meetsRules(password), [password]);
  const score = passed.filter(Boolean).length;
  const strengthIndex = password.length === 0 ? 0 : score;
  const required = passed.every(Boolean) && password.length <= RESET_PASSWORD_MAX;
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = Boolean(required && matches) && !isLoading;
  const passwordError = passwordTouched && !required ? t.passwordError : undefined;
  const confirmError = confirm.length > 0 && !matches ? t.confirmError : undefined;
  const readyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => () => window.clearTimeout(readyTimer.current), []);

  /** The moment the password becomes savable, the mascot smiles once. */
  const edit = (nextPassword: string, nextConfirm: string) => {
    if (savable(nextPassword, nextConfirm) && !savable(password, confirm)) {
      setReadyPulse(true);
      window.clearTimeout(readyTimer.current);
      readyTimer.current = window.setTimeout(() => setReadyPulse(false), HAPPY_MS);
    }
    setPassword(nextPassword);
    setConfirm(nextConfirm);
  };

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
      // A non-JSON failure (proxy, timeout page) falls through to the generic localized message.
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const byCode: Record<string, string> = { policy: t.passwordError, reused: t.reused, limited: t.limited, not_pending: t.notPending };
        throw new Error(byCode[json.code] ?? t.updateFailed);
      }

      toast.success(t.updated);
      setSaved(true);
      const target =
        json.role === "TEACHER" && !json.onboardingComplete
          ? "/teacher-onboarding"
          : dashboardPathForRole(json.role);
      router.push(target);
      router.refresh();
    } catch (err) {
      // Only our own localized messages reach the screen; network errors read as the generic failure.
      const known = [t.passwordError, t.reused, t.limited, t.notPending];
      const message = err instanceof Error && known.includes(err.message) ? err.message : t.updateFailed;
      setError(message);
      setErrorSeq((n) => n + 1);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      language={language}
      cover={(
        <AuthCover
          eyebrow={t.eyebrow}
          // The page's one h1 is the form title; the cover line is its tagline.
          heading={{ light: t.coverTitle.light, strong: t.coverTitle.strong, as: "p" }}
          body={t.coverBody}
          index={{
            label: ac.trustLabel,
            items: [
              { icon: KeyRound, title: t.coverOnce },
              authClaimItem(language, "encrypted", { body: false }),
              authClaimItem(language, "languages"),
            ],
          }}
        />
      )}
      topBar={<AuthTopBar languageId="first-login-language" label={ac.language} value={language} onChange={setLanguage} />}
      footer={<AuthColophon language={language} claims={["encrypted", "languages"]} />}
    >
      {/* The one live face: closes its eyes while you type the new password. */}
      <AuthMascot
        className="sk-enter mt-6"
        signals={{
          error: error ? `${errorSeq}:${error}` : null,
          thinking: isLoading,
          success: saved || readyPulse,
        }}
      />

      <div className="sk-enter sk-panel sk-gradient-border mt-7 p-6 shadow-xl sm:p-9" style={delay(140)}>
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl">{t.title}</h1>
          <p className="mt-2 text-md leading-relaxed text-ink-muted">
            {t.intro}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5" aria-busy={isLoading} noValidate>
          {error && (
            <div ref={errorRef} tabIndex={-1} role="group" aria-labelledby="first-login-error" className="sk-shake rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 shadow-xs">
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
                onChange={(e) => edit(e.target.value, confirm)}
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
          <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-4">
            {/* Decorative: the sentence below is the strength the field announces. */}
            <Progress aria-hidden="true" value={strengthIndex} max={4} tone={STRENGTH_TONE[strengthIndex]} size="sm" />
            <p id="first-password-strength" className="mt-1.5 text-xs font-medium text-ink-muted">
              {password.length > 0 ? t.strengthLabel.replace("{0}", t.strength[strengthIndex]) : t.enterPassword}
            </p>
            <div className="mt-3 border-t border-border-subtle pt-3">
              <RequirementChecklist
                id="first-password-rules"
                items={t.rules.map((label, i) => ({ label, met: passed[i] }))}
                metPrefix={t.met}
                unmetPrefix={t.notMet}
                columns="sm"
                size="sm"
              />
            </div>
          </div>
          <FormField name="confirm" id="confirm" label={t.confirmPassword} error={confirmError} required>
            <InputGroup>
              <ShieldCheck aria-hidden="true" data-field-affix="start" className="h-4 w-4 text-ink-subtle" />
              <Input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => edit(password, e.target.value)}
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
          <Button type="submit" disabled={!canSubmit} loading={isLoading} className="group w-full">
            {isLoading ? <span>{t.saving}</span> : <><span>{t.save}</span><ArrowRight aria-hidden="true" className="transition-transform rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" /></>}
          </Button>
        </form>
      </div>

      <p className="sk-fade-in mt-6 flex items-start justify-center gap-1.5 text-center text-xs leading-relaxed text-ink-subtle" style={delay(180)}>
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0">{t.never}</span>
      </p>
    </AuthShell>
  );
}
