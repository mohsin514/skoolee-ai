"use client";
// SKAI-954: guardian phone sign-in step on /login. WhatsApp code first, SMS after 30 s or at once
// when WhatsApp reports the number cannot receive it. The phone number lives only in
// component state and request bodies, never in the URL.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { InputGroup } from "@/components/ui/input-group";
import { fillText } from "@/lib/auth/fill-nodes";
import type { Language } from "@/lib/locale/package";

const copy = {
  en: {
    title: "Sign in with your phone", body: "For parents and guardians. We send a 6-digit code to WhatsApp, or by SMS if WhatsApp is not available.",
    phone: "Mobile number", phoneHint: "Pakistan, Saudi Arabia or UAE. Example: 0300 1234567 or +966 50 123 4567",
    send: "Send code", sending: "Sending…", code: "6-digit code",
    sentWhatsApp: "We sent a code to WhatsApp. Open WhatsApp and tap Copy code.", sentSms: "We sent a code by SMS.",
    smsIn: "Didn't get it? You can get an SMS in {0}s", smsNow: "Send the code by SMS instead", notOnWhatsApp: "This number is not on WhatsApp. Send the code by SMS.",
    verify: "Verify and sign in", verifying: "Verifying…", changeNumber: "Use a different number", back: "Sign in with email instead",
    chooseSchool: "Choose your school", expires: "The code expires in 5 minutes. Never share it with anyone.",
    errors: {
      invalid_phone: "Enter a valid Pakistan, Saudi or UAE mobile number.", rate_limited: "Too many codes requested. Try again in a few minutes.",
      unavailable: "We couldn't send a code right now. Try again, or sign in with email.", invalid_or_expired: "This code has expired. Request a new one.",
      wrong_code: "That code is not correct.", too_many_attempts: "Too many wrong codes. Request a new one.", fallback_not_ready: "Please wait a moment before requesting an SMS.",
      generic: "Something went wrong. Try again.",
    } as Record<string, string>,
  },
  ur: {
    title: "فون سے سائن اِن کریں", body: "والدین اور سرپرستوں کے لیے۔ ہم 6 ہندسوں کا کوڈ واٹس ایپ پر بھیجتے ہیں، یا واٹس ایپ نہ ہو تو ایس ایم ایس سے۔",
    phone: "موبائل نمبر", phoneHint: "پاکستان، سعودی عرب یا متحدہ عرب امارات۔ مثال: 0300 1234567",
    send: "کوڈ بھیجیں", sending: "بھیجا جا رہا ہے…", code: "6 ہندسوں کا کوڈ",
    sentWhatsApp: "ہم نے واٹس ایپ پر کوڈ بھیج دیا ہے۔ واٹس ایپ کھولیں اور کوڈ کاپی کریں۔", sentSms: "ہم نے ایس ایم ایس سے کوڈ بھیج دیا ہے۔",
    smsIn: "کوڈ نہیں ملا؟ {0} سیکنڈ میں ایس ایم ایس منگوا سکتے ہیں", smsNow: "کوڈ ایس ایم ایس سے بھیجیں", notOnWhatsApp: "یہ نمبر واٹس ایپ پر نہیں ہے۔ کوڈ ایس ایم ایس سے منگوائیں۔",
    verify: "تصدیق کریں اور سائن اِن کریں", verifying: "تصدیق ہو رہی ہے…", changeNumber: "دوسرا نمبر استعمال کریں", back: "ای میل سے سائن اِن کریں",
    chooseSchool: "اپنا اسکول منتخب کریں", expires: "کوڈ 5 منٹ میں ختم ہو جاتا ہے۔ یہ کسی کو نہ بتائیں۔",
    errors: {
      invalid_phone: "پاکستان، سعودی عرب یا امارات کا درست موبائل نمبر درج کریں۔", rate_limited: "بہت زیادہ کوڈ منگوائے گئے۔ چند منٹ بعد کوشش کریں۔",
      unavailable: "ابھی کوڈ نہیں بھیجا جا سکا۔ دوبارہ کوشش کریں یا ای میل سے سائن اِن کریں۔", invalid_or_expired: "اس کوڈ کی میعاد ختم ہو گئی۔ نیا کوڈ منگوائیں۔",
      wrong_code: "یہ کوڈ درست نہیں۔", too_many_attempts: "بہت زیادہ غلط کوڈ۔ نیا کوڈ منگوائیں۔", fallback_not_ready: "ایس ایم ایس منگوانے سے پہلے تھوڑا انتظار کریں۔",
      generic: "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔",
    } as Record<string, string>,
  },
  ar: {
    title: "تسجيل الدخول برقم الهاتف", body: "لأولياء الأمور. نرسل رمزاً من 6 أرقام عبر واتساب، أو برسالة نصية إذا لم يتوفر واتساب.",
    phone: "رقم الجوال", phoneHint: "باكستان أو السعودية أو الإمارات. مثال: ‎+966 50 123 4567",
    send: "إرسال الرمز", sending: "جارٍ الإرسال…", code: "الرمز المكوّن من 6 أرقام",
    sentWhatsApp: "أرسلنا رمزاً إلى واتساب. افتح واتساب واضغط نسخ الرمز.", sentSms: "أرسلنا الرمز برسالة نصية.",
    smsIn: "لم يصلك الرمز؟ يمكنك طلب رسالة نصية بعد {0} ث", smsNow: "أرسل الرمز برسالة نصية", notOnWhatsApp: "هذا الرقم غير مسجّل في واتساب. اطلب الرمز برسالة نصية.",
    verify: "تحقّق وسجّل الدخول", verifying: "جارٍ التحقق…", changeNumber: "استخدم رقماً آخر", back: "تسجيل الدخول بالبريد الإلكتروني",
    chooseSchool: "اختر مدرستك", expires: "تنتهي صلاحية الرمز خلال 5 دقائق. لا تشاركه مع أحد.",
    errors: {
      invalid_phone: "أدخل رقم جوال صالحاً في باكستان أو السعودية أو الإمارات.", rate_limited: "طلبات رموز كثيرة جداً. حاول بعد بضع دقائق.",
      unavailable: "تعذر إرسال الرمز الآن. حاول مجدداً أو سجّل الدخول بالبريد الإلكتروني.", invalid_or_expired: "انتهت صلاحية هذا الرمز. اطلب رمزاً جديداً.",
      wrong_code: "الرمز غير صحيح.", too_many_attempts: "محاولات خاطئة كثيرة. اطلب رمزاً جديداً.", fallback_not_ready: "انتظر قليلاً قبل طلب الرسالة النصية.",
      generic: "حدث خطأ ما. حاول مجدداً.",
    } as Record<string, string>,
  },
} satisfies Record<Language, unknown>;

type School = { schoolId: string; schoolName: string; schoolCity: string };
type Challenge = { challengeId: string; channel: "whatsapp" | "sms" };

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/auth/otp/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

export function GuardianPhoneSignIn({ language, rememberMe, extraBody, onSignedIn, onBack }: {
  language: Language; rememberMe: boolean; extraBody: () => Record<string, unknown>;
  onSignedIn: (json: Record<string, unknown>) => void | Promise<void>; onBack: () => void;
}) {
  const t = copy[language];
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [smsIn, setSmsIn] = useState<number | null>(null);
  const [notOnWa, setNotOnWa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[] | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const market = language === "ar" ? "SA" : "PK";
  const err = (key: unknown) => t.errors[typeof key === "string" ? key : "generic"] ?? t.errors.generic;

  // Poll delivery status while waiting on WhatsApp, so a not-on-WhatsApp answer surfaces at once.
  useEffect(() => {
    if (!challenge || challenge.channel !== "whatsapp") return;
    let stop = false;
    const tick = async () => {
      const { ok, json } = await post("status", { challengeId: challenge.challengeId });
      if (stop || !ok) return;
      if (json.smsSent) { setChallenge({ ...challenge, channel: "sms" }); setSmsIn(null); return; }
      setNotOnWa(json.whatsapp === "not_on_whatsapp" || json.whatsapp === "failed");
      setSmsIn(typeof json.fallbackInSeconds === "number" ? json.fallbackInSeconds : null);
    };
    void tick();
    const id = window.setInterval(tick, 3000);
    return () => { stop = true; window.clearInterval(id); };
  }, [challenge]);

  // Local one-second countdown between polls.
  useEffect(() => {
    if (!smsIn) return;
    const id = window.setTimeout(() => setSmsIn((s) => (s ? s - 1 : s)), 1000);
    return () => window.clearTimeout(id);
  }, [smsIn]);

  const send = async () => {
    setBusy(true); setError(null);
    const { ok, json } = await post("request", { phone, language, market });
    setBusy(false);
    if (!ok) return setError(err(json.error));
    setChallenge({ challengeId: json.challengeId, channel: json.channel });
    setSmsIn(json.channel === "whatsapp" ? json.fallbackAfterSeconds : null);
    window.setTimeout(() => codeRef.current?.focus(), 0);
  };

  const fallback = async () => {
    if (!challenge) return;
    setBusy(true); setError(null);
    const { ok, json } = await post("fallback", { challengeId: challenge.challengeId, phone, market });
    setBusy(false);
    if (!ok) return setError(err(json.error));
    setChallenge({ ...challenge, channel: "sms" }); setSmsIn(null); setNotOnWa(false);
  };

  const verify = async (schoolId?: string) => {
    if (!challenge) return;
    setBusy(true); setError(null);
    const { ok, json } = await post("verify", { challengeId: challenge.challengeId, phone, code, market, rememberMe, ...(schoolId ? { schoolId } : {}), ...extraBody() });
    setBusy(false);
    if (json.needsSchoolSelection) return setSchools(json.schools as School[]);
    if (!ok) {
      if (json.error === "invalid_or_expired" || json.error === "too_many_attempts") { setChallenge(null); setCode(""); }
      return setError(err(json.error));
    }
    await onSignedIn(json);
  };

  const reset = () => { setChallenge(null); setCode(""); setSchools(null); setError(null); setNotOnWa(false); };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-lg font-bold text-ink-strong">{schools ? t.chooseSchool : t.title}</h3>
        {!schools && <p className="text-sm leading-relaxed text-ink-muted">{t.body}</p>}
      </div>

      {error && <Alert tone="danger" title={error} role="alert" />}

      {schools ? (
        <div className="space-y-2.5">
          {schools.map((s) => (
            <Button key={s.schoolId} variant="choice" type="button" disabled={busy} onClick={() => verify(s.schoolId)} className="flex w-full items-center justify-start gap-3 p-4 text-start">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-strong">{s.schoolName}</span>
                {s.schoolCity && <span className="block truncate text-xs text-ink-subtle">{s.schoolCity}</span>}
              </span>
            </Button>
          ))}
        </div>
      ) : !challenge ? (
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="otp-phone" className="ms-1 text-ink-strong">{t.phone}</Label>
            <InputGroup>
              <Phone aria-hidden="true" data-field-affix="start" className="h-4 w-4" />
              <Input id="otp-phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-describedby="otp-phone-hint" placeholder="+92 300 1234567" />
            </InputGroup>
            <p id="otp-phone-hint" className="px-1 text-xs text-ink-subtle">{t.phoneHint}</p>
          </div>
          <Button type="submit" loading={busy} disabled={busy || phone.trim().length < 8} className="min-h-12 w-full">
            <MessageCircle aria-hidden="true" className="h-4 w-4" /> {busy ? t.sending : t.send}
          </Button>
        </form>
      ) : (
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <Alert tone={notOnWa ? "warning" : "success"} title={notOnWa ? t.notOnWhatsApp : challenge.channel === "whatsapp" ? t.sentWhatsApp : t.sentSms} role="status" />
          <div className="space-y-1.5">
            <Label htmlFor="otp-code" className="ms-1 text-ink-strong">{t.code}</Label>
            <InputGroup>
              <ShieldCheck aria-hidden="true" data-field-affix="start" className="h-4 w-4" />
              <Input ref={codeRef} id="otp-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-describedby="otp-code-hint" />
            </InputGroup>
            <p id="otp-code-hint" className="px-1 text-xs text-ink-subtle">{t.expires}</p>
          </div>
          <Button type="submit" loading={busy} disabled={busy || code.length !== 6} className="min-h-12 w-full">{busy ? t.verifying : t.verify}</Button>
          {challenge.channel === "whatsapp" && (notOnWa || smsIn === 0) && (
            <Button type="button" variant="outline" disabled={busy} onClick={fallback} className="w-full">{t.smsNow}</Button>
          )}
          {challenge.channel === "whatsapp" && !notOnWa && !!smsIn && (
            <p className="text-center text-xs text-ink-muted" aria-live="polite"><span data-numeric>{fillText(t.smsIn, smsIn)}</span></p>
          )}
          <Button type="button" variant="ghost" onClick={reset} className="w-full">{t.changeNumber}</Button>
        </form>
      )}

      <div className="border-t border-border-subtle pt-4">
        <Button type="button" variant="outline" onClick={onBack} className="w-full">
          <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 rtl:-scale-x-100" /> {t.back}
        </Button>
      </div>
    </div>
  );
}
