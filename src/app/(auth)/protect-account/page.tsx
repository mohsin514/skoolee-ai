"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dashboardPathForRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
const copy = {
 en: { title: "Protect your account", school: "School", setup: "Set up authenticator", code: "Authenticator or recovery code", verify: "Verify code", recovery: "Use a recovery code", instructions: "Add this secret to your authenticator app. Keep the device clock automatic. Your account stays restricted until you verify a code and save the recovery codes.", save: "Save these recovery codes somewhere private. Each works once. They cannot be displayed again. If you lose both your authenticator and codes, contact your school administrator; email alone cannot remove MFA.", ack: "I saved my recovery codes and understand how to recover access", finish: "Enter workspace", retry: "Start setup again", login: "Return to sign in", unavailable: "Sign in again to continue.", lost: "Keep your authenticator available. Each recovery code works once and ends your other sessions.", next: "Verify your account to continue." },
 ar: { title: "حماية حسابك", school: "المدرسة", setup: "إعداد تطبيق المصادقة", code: "رمز المصادقة أو الاسترداد", verify: "تحقق من الرمز", recovery: "استخدام رمز استرداد", instructions: "أضف هذا المفتاح إلى تطبيق المصادقة واضبط ساعة الجهاز تلقائياً. يبقى الحساب مقيداً حتى التحقق وحفظ رموز الاسترداد.", save: "احفظ رموز الاسترداد في مكان خاص. يستخدم كل رمز مرة واحدة ولا يمكن عرضه مجدداً. إذا فقدت التطبيق والرموز، تواصل مع مسؤول المدرسة؛ البريد وحده لا يلغي المصادقة.", ack: "حفظت رموز الاسترداد وفهمت طريقة استعادة الوصول", finish: "الدخول إلى مساحة العمل", retry: "بدء الإعداد مجدداً", login: "العودة لتسجيل الدخول", unavailable: "سجل الدخول مجدداً للمتابعة.", lost: "احتفظ بتطبيق المصادقة. يعمل كل رمز استرداد مرة واحدة وينهي جلساتك الأخرى.", next: "تحقق من حسابك للمتابعة." },
 ur: { title: "اپنے اکاؤنٹ کو محفوظ کریں", school: "اسکول", setup: "تصدیقی ایپ ترتیب دیں", code: "تصدیق یا بحالی کا کوڈ", verify: "کوڈ کی تصدیق", recovery: "بحالی کا کوڈ استعمال کریں", instructions: "یہ کلید اپنی تصدیقی ایپ میں شامل کریں اور آلے کی گھڑی خودکار رکھیں۔ کوڈ کی تصدیق اور بحالی کوڈ محفوظ ہونے تک رسائی محدود رہے گی۔", save: "بحالی کوڈ نجی جگہ محفوظ کریں۔ ہر کوڈ صرف ایک بار استعمال ہوتا ہے اور دوبارہ دکھایا نہیں جا سکتا۔ ایپ اور کوڈ دونوں کھو جائیں تو اسکول منتظم سے رابطہ کریں؛ صرف ای میل کافی نہیں۔", ack: "میں نے بحالی کوڈ محفوظ کر لیے اور بحالی کا طریقہ سمجھ لیا", finish: "ورک اسپیس میں داخل ہوں", retry: "ترتیب دوبارہ شروع کریں", login: "سائن ان پر واپس جائیں", unavailable: "جاری رکھنے کے لیے دوبارہ سائن ان کریں۔", lost: "اپنی تصدیقی ایپ محفوظ رکھیں۔ ہر بحالی کوڈ ایک بار کام کرتا اور دوسری نشستیں ختم کرتا ہے۔", next: "جاری رکھنے کے لیے اکاؤنٹ کی تصدیق کریں۔" }
};
const statusCopy = {
  en: { language: "Language", checking: "Checking account…", tryAgain: "Try again", working: "Working…" },
  ar: { language: "اللغة", checking: "جارٍ التحقق من الحساب…", tryAgain: "حاول مجدداً", working: "جارٍ التنفيذ…" },
  ur: { language: "زبان", checking: "اکاؤنٹ کی جانچ ہو رہی ہے…", tryAgain: "دوبارہ کوشش کریں", working: "کام جاری ہے…" },
};

export default function ProtectAccount() {
  const router = useRouter();
  const [language, setLanguage] = useState<keyof typeof copy>("en");
  const t = copy[language];
  const statusText = statusCopy[language];
  const [status, setStatus] = useState<{ enrolled: boolean; school: string; awaitingAcknowledgement: boolean } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const recoveryInstructionsRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const lang = document.documentElement.lang;
    if (lang === "ar" || lang === "ur") setLanguage(lang);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/mfa", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (active) setStatus(data);
    }).catch(failure => {
      if (active) setError(failure instanceof Error ? failure.message : copy.en.unavailable);
    }).finally(() => {
      if (active) setStatusLoading(false);
    });
    return () => { active = false; };
  }, [statusAttempt]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (codes.length > 0) recoveryInstructionsRef.current?.focus();
    else if (secret || status?.enrolled) codeRef.current?.focus();
  }, [codes.length, secret, status?.enrolled]);

  async function send(action: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code, recovery, acknowledged: ack }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || t.unavailable);
      if (data.secret) { setSecret(data.secret); setCodes([]); setAck(false); }
      if (data.recoveryCodes) { setCodes(data.recoveryCodes); setSecret(""); setCode(""); }
      if (data.user) router.replace(data.user.mustChangePassword ? "/first-login" : dashboardPathForRole(data.user.role));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t.unavailable);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(status?.enrolled ? "challenge" : "verify-setup");
  }

  return (
    <main lang={language} dir={language === "en" ? "ltr" : "rtl"} className="min-h-screen bg-purple-50 p-4 sm:p-8">
      <section className="mx-auto max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-sm">
        <FormField name="language" id="mfa-language" label={statusText.language}>
          <Select value={language} onChange={event => setLanguage(event.target.value as keyof typeof copy)}>
            <option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option>
          </Select>
        </FormField>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p>{status ? <>{t.school}: <bdi>{status.school}</bdi></> : t.next}</p>
        {statusLoading && <p role="status" className="text-sm font-semibold text-ink-muted">{statusText.checking}</p>}
        {error && <p id="mfa-error" ref={errorRef} tabIndex={-1} role="alert" className="rounded-2xl border border-status-error-border bg-status-error-surface p-4 text-sm font-semibold text-status-error-text">{error}</p>}
        {!status && !statusLoading && error && (
          <Button type="button" variant="outline" onClick={() => { setError(""); setStatusLoading(true); setStatusAttempt(attempt => attempt + 1); }}>{statusText.tryAgain}</Button>
        )}
        {busy && <p role="status" className="text-sm font-semibold text-ink-muted">{statusText.working}</p>}
        {status && !status.enrolled && !secret && codes.length === 0 && (
          <Button type="button" disabled={busy} aria-busy={busy} onClick={() => send("setup")}>{status.awaitingAcknowledgement ? t.retry : t.setup}</Button>
        )}
        {secret && <>
          <p>{t.instructions}</p>
          <code dir="ltr" className="block break-all rounded-2xl bg-surface-subtle p-4 select-all">{secret}</code>
        </>}
        {(status?.enrolled || secret) && (
          <form onSubmit={submit} aria-busy={busy} className="space-y-4">
            <FormField name="code" id="mfa-code" label={t.code} required>
              <Input ref={codeRef} value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" dir="ltr" inputMode={recovery ? "text" : "numeric"} required readOnly={busy} aria-describedby={error ? "mfa-guidance mfa-error" : "mfa-guidance"} />
            </FormField>
            <p id="mfa-guidance" className="text-sm leading-relaxed text-ink-muted">{t.lost}</p>
            {status?.enrolled && (
              <Label htmlFor="mfa-recovery" className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox id="mfa-recovery" disabled={busy} checked={recovery} onChange={event => { setRecovery(event.target.checked); setCode(""); }} />
                {t.recovery}
              </Label>
            )}
            <Button type="submit" disabled={busy} aria-busy={busy}>{t.verify}</Button>
          </form>
        )}
        {codes.length > 0 && <>
          <p id="mfa-recovery-instructions" ref={recoveryInstructionsRef} tabIndex={-1}>{t.save}</p>
          <pre dir="ltr" className="overflow-x-auto rounded-2xl bg-surface-subtle p-4 text-sm select-all">{codes.join("\n")}</pre>
          <Label htmlFor="mfa-ack" className="flex min-h-11 cursor-pointer items-start gap-3">
            <Checkbox id="mfa-ack" checked={ack} disabled={busy} onChange={event => setAck(event.target.checked)} className="mt-0.5" />
            {t.ack}
          </Label>
          <Button type="button" disabled={!ack || busy} aria-busy={busy} onClick={() => send("acknowledge")}>{t.finish}</Button>
        </>}
        <Link href="/login" className="flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">{t.login}</Link>
      </section>
    </main>
  );
}
