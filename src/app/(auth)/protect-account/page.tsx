"use client";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  AlertCircle, ArrowRight, Check, CheckCircle2, Copy, Download, Info, KeyRound, LifeBuoy,
  Loader2, LockKeyhole, Printer, RotateCcw, ShieldCheck, Smartphone, Timer,
} from "lucide-react";
import { dashboardPathForRole } from "@/lib/roles";
import SkooleeLogo from "@/components/SkooleeLogo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { InputGroup } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Language = "en" | "ar" | "ur";
/** Reasons returned by /api/auth/mfa, plus `network` for a request that never reached it. */
type Reason = "invalid_code" | "clock_skew" | "code_reused" | "recovery_invalid" | "session_expired" | "setup_expired"
  | "secret_unavailable" | "rate_limited" | "invalid_request" | "server_error" | "network";

const en = {
  language: "Language",
  brandEyebrow: "Account security",
  brandTitle: "Your school data, sealed with a second key.",
  brandBody: "Leaders handle fees, records and staff access. A code from your phone keeps that access yours, even if a password leaks.",
  brandPoints: ["Codes refresh every 30 seconds", "Each recovery code works once", "Works with any authenticator app"],
  brandFooter: "Encrypted at rest & in transit",
  title: "Protect your account",
  intro: "Add an authenticator app as a second step when you sign in. It takes about a minute.",
  apps: "Works with Google Authenticator, Microsoft Authenticator, 1Password and other authenticator apps.",
  challengeTitle: "Verify it's you",
  challengeIntro: "Enter the current code from your authenticator app to continue.",
  challengeRecoveryIntro: "Enter one of the unused recovery codes you saved to continue. Each code works once.",
  resumeNote: "You already started setup. Enter a code from your authenticator app, or a recovery code you saved, to finish.",
  school: "School",
  progress: "Setup progress",
  steps: ["Scan or enter key", "Verify code", "Save recovery codes", "Done"],
  completed: "Completed",
  setup: "Set up authenticator",
  retry: "Start setup again",
  startOverHint: "Starting again replaces your authenticator entry and any recovery codes you saved.",
  scanTitle: "Scan this QR code",
  scanBody: "Open your authenticator app, add an account, and scan the code.",
  qrAlt: "QR code to add Skoolee to your authenticator app",
  qrUnavailable: "QR code unavailable. Enter the key below instead.",
  manualTitle: "Can't scan? Enter this key",
  manualHint: "Choose a time-based key. Keep your phone's date and time set automatically.",
  copyKey: "Copy key",
  copied: "Copied",
  copyFailed: "Couldn't copy. Select the text and copy it manually.",
  codeLabelSetup: "6-digit code from your app",
  codeLabel: "Authenticator code",
  recoveryLabel: "Recovery code",
  codeHint: "Open your authenticator app and enter the current 6-digit code for Skoolee.",
  recoveryHint: "Enter one of the recovery codes you saved. Each code works once and signs out your other sessions.",
  method: "Verification method",
  methodApp: "Authenticator code",
  methodRecovery: "Use a recovery code",
  verify: "Verify code",
  verifying: "Checking code…",
  codesTitle: "Save your recovery codes",
  save: "If you lose your phone, these codes are the only way back in. Each works once and won't be shown again. Keep them somewhere private. If you lose both your authenticator and these codes, contact your school administrator; email alone can't remove this protection.",
  codesList: "Recovery codes",
  copyAll: "Copy all",
  download: "Download .txt",
  print: "Print",
  downloaded: "Downloaded",
  ack: "I saved my recovery codes and understand how to recover access",
  finish: "Enter workspace",
  doneTitle: "Your account is protected",
  verifiedTitle: "Verified",
  doneBody: "Taking you to your workspace…",
  login: "Return to sign in",
  signInAgain: "Sign in again",
  checking: "Checking account…",
  tryAgain: "Try again",
  working: "Working…",
  unavailable: "Sign in again to continue.",
  recoveryRace: "That recovery code was just used. Sign in again.",
  fileHeading: "Skoolee AI recovery codes",
  reasons: {
    invalid_code: "That code didn't match. Enter the current 6-digit code from your authenticator app.",
    clock_skew: "That code is out of date. Make sure your phone sets its date and time automatically, then enter the current code.",
    code_reused: "That code was already used. Wait for the next code in your authenticator app.",
    recovery_invalid: "That recovery code isn't recognised or has already been used. Try another unused recovery code.",
    session_expired: "Your sign-in timed out. Sign in again to continue.",
    setup_expired: "This setup session has expired. Start setup again.",
    secret_unavailable: "Your authenticator can't be checked right now. Sign in with one of your recovery codes, or ask your administrator for help.",
    rate_limited: "Too many attempts. Wait five minutes, then try again.",
    invalid_request: "Complete verification and save your recovery instructions before continuing.",
    server_error: "Something went wrong. Try again.",
    network: "We couldn't reach Skoolee. Check your connection and try again.",
  } satisfies Record<Reason, string>,
};
type Copy = typeof en;

const copy: Record<Language, Copy> = {
  en,
  ar: {
    language: "اللغة",
    brandEyebrow: "أمان الحساب",
    brandTitle: "بيانات مدرستك، محمية بمفتاح ثانٍ.",
    brandBody: "يدير القادة الرسوم والسجلات وصلاحيات الموظفين. رمز من هاتفك يُبقي هذا الوصول لك وحدك، حتى لو تسربت كلمة المرور.",
    brandPoints: ["تتجدد الرموز كل 30 ثانية", "يعمل كل رمز استرداد مرة واحدة", "يعمل مع أي تطبيق مصادقة"],
    brandFooter: "مشفّر أثناء التخزين والنقل",
    title: "حماية حسابك",
    intro: "أضف تطبيق مصادقة كخطوة ثانية عند تسجيل الدخول. يستغرق ذلك دقيقة تقريباً.",
    apps: "يعمل مع Google Authenticator وMicrosoft Authenticator و1Password وتطبيقات المصادقة الأخرى.",
    challengeTitle: "تأكيد هويتك",
    challengeIntro: "أدخل الرمز الحالي من تطبيق المصادقة للمتابعة.",
    challengeRecoveryIntro: "أدخل أحد رموز الاسترداد غير المستخدمة التي حفظتها للمتابعة. كل رمز يعمل مرة واحدة.",
    resumeNote: "لقد بدأت الإعداد مسبقاً. أدخل رمزاً من تطبيق المصادقة أو رمز استرداد حفظته لإكماله.",
    school: "المدرسة",
    progress: "تقدم الإعداد",
    steps: ["امسح الرمز أو أدخل المفتاح", "تحقق من الرمز", "احفظ رموز الاسترداد", "تم"],
    completed: "مكتمل",
    setup: "إعداد تطبيق المصادقة",
    retry: "بدء الإعداد مجدداً",
    startOverHint: "البدء من جديد يستبدل حساب تطبيق المصادقة وأي رموز استرداد حفظتها.",
    scanTitle: "امسح رمز QR هذا",
    scanBody: "افتح تطبيق المصادقة، وأضف حساباً، ثم امسح الرمز.",
    qrAlt: "رمز QR لإضافة Skoolee إلى تطبيق المصادقة",
    qrUnavailable: "رمز QR غير متاح. أدخل المفتاح أدناه بدلاً من ذلك.",
    manualTitle: "تعذّر المسح؟ أدخل هذا المفتاح",
    manualHint: "اختر مفتاحاً مبنياً على الوقت، واضبط تاريخ ووقت هاتفك تلقائياً.",
    copyKey: "نسخ المفتاح",
    copied: "تم النسخ",
    copyFailed: "تعذّر النسخ. حدّد النص وانسخه يدوياً.",
    codeLabelSetup: "الرمز المكوّن من 6 أرقام من التطبيق",
    codeLabel: "رمز المصادقة",
    recoveryLabel: "رمز الاسترداد",
    codeHint: "افتح تطبيق المصادقة وأدخل الرمز الحالي المكوّن من 6 أرقام لـ Skoolee.",
    recoveryHint: "أدخل أحد رموز الاسترداد التي حفظتها. يعمل كل رمز مرة واحدة وينهي جلساتك الأخرى.",
    method: "طريقة التحقق",
    methodApp: "رمز المصادقة",
    methodRecovery: "استخدام رمز استرداد",
    verify: "تحقق من الرمز",
    verifying: "جارٍ التحقق من الرمز…",
    codesTitle: "احفظ رموز الاسترداد",
    save: "إذا فقدت هاتفك، فهذه الرموز هي طريقك الوحيد للعودة. يعمل كل رمز مرة واحدة ولن يُعرض مجدداً. احفظها في مكان خاص. إذا فقدت التطبيق والرموز معاً، تواصل مع مسؤول المدرسة؛ البريد الإلكتروني وحده لا يلغي هذه الحماية.",
    codesList: "رموز الاسترداد",
    copyAll: "نسخ الكل",
    download: "تنزيل ملف نصي",
    print: "طباعة",
    downloaded: "تم التنزيل",
    ack: "حفظت رموز الاسترداد وفهمت طريقة استعادة الوصول",
    finish: "الدخول إلى مساحة العمل",
    doneTitle: "حسابك محمي الآن",
    verifiedTitle: "تم التحقق",
    doneBody: "جارٍ نقلك إلى مساحة العمل…",
    login: "العودة لتسجيل الدخول",
    signInAgain: "سجّل الدخول مجدداً",
    checking: "جارٍ التحقق من الحساب…",
    tryAgain: "حاول مجدداً",
    working: "جارٍ التنفيذ…",
    unavailable: "سجل الدخول مجدداً للمتابعة.",
    recoveryRace: "تم استخدام رمز الاسترداد هذا للتو. سجّل الدخول مجدداً.",
    fileHeading: "رموز استرداد Skoolee AI",
    reasons: {
      invalid_code: "الرمز غير مطابق. أدخل الرمز الحالي المكوّن من 6 أرقام من تطبيق المصادقة.",
      clock_skew: "انتهت صلاحية هذا الرمز. تأكد من أن هاتفك يضبط التاريخ والوقت تلقائياً، ثم أدخل الرمز الحالي.",
      code_reused: "تم استخدام هذا الرمز من قبل. انتظر الرمز التالي في تطبيق المصادقة.",
      recovery_invalid: "رمز الاسترداد غير معروف أو مستخدم مسبقاً. جرّب رمز استرداد آخر غير مستخدم.",
      session_expired: "انتهت مهلة تسجيل الدخول. سجّل الدخول مجدداً للمتابعة.",
      setup_expired: "انتهت جلسة الإعداد هذه. ابدأ الإعداد مجدداً.",
      secret_unavailable: "يتعذّر التحقق من تطبيق المصادقة الآن. سجّل الدخول بأحد رموز الاسترداد، أو اطلب المساعدة من المسؤول.",
      rate_limited: "محاولات كثيرة جداً. انتظر خمس دقائق ثم حاول مجدداً.",
      invalid_request: "أكمل التحقق واحفظ تعليمات الاسترداد قبل المتابعة.",
      server_error: "حدث خطأ ما. حاول مجدداً.",
      network: "تعذّر الاتصال بـ Skoolee. تحقق من اتصالك وحاول مجدداً.",
    },
  },
  ur: {
    language: "زبان",
    brandEyebrow: "اکاؤنٹ کی حفاظت",
    brandTitle: "آپ کے اسکول کا ڈیٹا، ایک دوسری چابی سے محفوظ۔",
    brandBody: "منتظمین فیس، ریکارڈ اور عملے کی رسائی سنبھالتے ہیں۔ آپ کے فون کا کوڈ یہ رسائی صرف آپ کی رکھتا ہے، چاہے پاس ورڈ افشا ہو جائے۔",
    brandPoints: ["کوڈ ہر 30 سیکنڈ میں بدلتے ہیں", "ہر بحالی کوڈ صرف ایک بار چلتا ہے", "کسی بھی تصدیقی ایپ کے ساتھ کام کرتا ہے"],
    brandFooter: "محفوظ ڈیٹا اور منتقلی دونوں خفیہ کاری میں",
    title: "اپنے اکاؤنٹ کو محفوظ کریں",
    intro: "سائن ان کے دوسرے مرحلے کے طور پر تصدیقی ایپ شامل کریں۔ اس میں تقریباً ایک منٹ لگتا ہے۔",
    apps: "Google Authenticator، Microsoft Authenticator، 1Password اور دوسری تصدیقی ایپس کے ساتھ کام کرتا ہے۔",
    challengeTitle: "تصدیق کریں کہ یہ آپ ہیں",
    challengeIntro: "جاری رکھنے کے لیے اپنی تصدیقی ایپ کا موجودہ کوڈ درج کریں۔",
    challengeRecoveryIntro: "جاری رکھنے کے لیے اپنے محفوظ کیے گئے غیر استعمال شدہ بحالی کوڈز میں سے ایک درج کریں۔ ہر کوڈ صرف ایک بار کام کرتا ہے۔",
    resumeNote: "آپ پہلے ہی ترتیب شروع کر چکے ہیں۔ مکمل کرنے کے لیے تصدیقی ایپ کا کوڈ یا محفوظ کیا ہوا بحالی کوڈ درج کریں۔",
    school: "اسکول",
    progress: "ترتیب کی پیش رفت",
    steps: ["اسکین کریں یا کلید درج کریں", "کوڈ کی تصدیق", "بحالی کوڈ محفوظ کریں", "مکمل"],
    completed: "مکمل",
    setup: "تصدیقی ایپ ترتیب دیں",
    retry: "ترتیب دوبارہ شروع کریں",
    startOverHint: "دوبارہ شروع کرنے سے تصدیقی ایپ کا اندراج اور آپ کے محفوظ کیے گئے بحالی کوڈ بدل جائیں گے۔",
    scanTitle: "یہ QR کوڈ اسکین کریں",
    scanBody: "اپنی تصدیقی ایپ کھولیں، اکاؤنٹ شامل کریں اور کوڈ اسکین کریں۔",
    qrAlt: "Skoolee کو تصدیقی ایپ میں شامل کرنے کا QR کوڈ",
    qrUnavailable: "QR کوڈ دستیاب نہیں۔ اس کے بجائے نیچے دی گئی کلید درج کریں۔",
    manualTitle: "اسکین نہیں ہو رہا؟ یہ کلید درج کریں",
    manualHint: "وقت پر مبنی کلید منتخب کریں اور فون کی تاریخ و وقت خودکار رکھیں۔",
    copyKey: "کلید کاپی کریں",
    copied: "کاپی ہو گیا",
    copyFailed: "کاپی نہیں ہو سکا۔ متن منتخب کر کے خود کاپی کریں۔",
    codeLabelSetup: "ایپ سے 6 ہندسوں کا کوڈ",
    codeLabel: "تصدیقی کوڈ",
    recoveryLabel: "بحالی کوڈ",
    codeHint: "اپنی تصدیقی ایپ کھولیں اور Skoolee کا موجودہ 6 ہندسوں کا کوڈ درج کریں۔",
    recoveryHint: "اپنے محفوظ کیے گئے بحالی کوڈز میں سے ایک درج کریں۔ ہر کوڈ ایک بار چلتا ہے اور آپ کی دوسری نشستیں ختم کر دیتا ہے۔",
    method: "تصدیق کا طریقہ",
    methodApp: "تصدیقی کوڈ",
    methodRecovery: "بحالی کوڈ استعمال کریں",
    verify: "کوڈ کی تصدیق",
    verifying: "کوڈ کی جانچ ہو رہی ہے…",
    codesTitle: "اپنے بحالی کوڈ محفوظ کریں",
    save: "اگر فون گم ہو جائے تو یہی کوڈ واپسی کا واحد راستہ ہیں۔ ہر کوڈ ایک بار چلتا ہے اور دوبارہ نہیں دکھایا جائے گا۔ انہیں نجی جگہ محفوظ رکھیں۔ ایپ اور کوڈ دونوں کھو جائیں تو اسکول منتظم سے رابطہ کریں؛ صرف ای میل سے یہ حفاظت ختم نہیں ہوتی۔",
    codesList: "بحالی کوڈ",
    copyAll: "سب کاپی کریں",
    download: "ٹیکسٹ فائل ڈاؤن لوڈ کریں",
    print: "پرنٹ کریں",
    downloaded: "ڈاؤن لوڈ ہو گیا",
    ack: "میں نے بحالی کوڈ محفوظ کر لیے اور بحالی کا طریقہ سمجھ لیا",
    finish: "ورک اسپیس میں داخل ہوں",
    doneTitle: "آپ کا اکاؤنٹ محفوظ ہے",
    verifiedTitle: "تصدیق ہو گئی",
    doneBody: "آپ کو ورک اسپیس میں لے جا رہے ہیں…",
    login: "سائن ان پر واپس جائیں",
    signInAgain: "دوبارہ سائن ان کریں",
    checking: "اکاؤنٹ کی جانچ ہو رہی ہے…",
    tryAgain: "دوبارہ کوشش کریں",
    working: "کام جاری ہے…",
    unavailable: "جاری رکھنے کے لیے دوبارہ سائن ان کریں۔",
    recoveryRace: "یہ بحالی کوڈ ابھی استعمال ہوا ہے۔ دوبارہ سائن ان کریں۔",
    fileHeading: "Skoolee AI بحالی کوڈ",
    reasons: {
      invalid_code: "کوڈ درست نہیں۔ اپنی تصدیقی ایپ کا موجودہ 6 ہندسوں کا کوڈ درج کریں۔",
      clock_skew: "یہ کوڈ پرانا ہو چکا ہے۔ یقینی بنائیں کہ فون کی تاریخ اور وقت خودکار ہیں، پھر موجودہ کوڈ درج کریں۔",
      code_reused: "یہ کوڈ پہلے ہی استعمال ہو چکا ہے۔ تصدیقی ایپ میں اگلے کوڈ کا انتظار کریں۔",
      recovery_invalid: "یہ بحالی کوڈ پہچانا نہیں گیا یا پہلے استعمال ہو چکا ہے۔ کوئی اور غیر استعمال شدہ بحالی کوڈ آزمائیں۔",
      session_expired: "آپ کا سائن ان ختم ہو گیا۔ جاری رکھنے کے لیے دوبارہ سائن ان کریں۔",
      setup_expired: "یہ ترتیب کا سیشن ختم ہو گیا۔ ترتیب دوبارہ شروع کریں۔",
      secret_unavailable: "ابھی آپ کی تصدیقی ایپ کی جانچ نہیں ہو سکتی۔ کسی بحالی کوڈ سے سائن ان کریں یا اپنے منتظم سے مدد لیں۔",
      rate_limited: "بہت زیادہ کوششیں۔ پانچ منٹ انتظار کریں، پھر دوبارہ کوشش کریں۔",
      invalid_request: "جاری رکھنے سے پہلے تصدیق مکمل کریں اور بحالی کی ہدایات محفوظ کریں۔",
      server_error: "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔",
      network: "Skoolee سے رابطہ نہیں ہو سکا۔ اپنا کنکشن چیک کر کے دوبارہ کوشش کریں۔",
    },
  },
};

type MfaStatus = { enrolled: boolean; school: string; awaitingAcknowledgement: boolean; resumeChallenge?: boolean };
/** `field` errors belong to the code input; `page` errors stand alone above the current step. */
type MfaError = { reason?: string; message?: string; status?: number; scope: "page" | "field" };
type Feedback = "key" | "codes" | "download" | "copyFailed" | null;

class MfaRequestError extends Error {
  constructor(readonly status: number, readonly reason?: string, message?: string) { super(message ?? ""); }
}

/** Every MFA call goes through one place so status, reason and fallback text are read the same way. */
async function callMfa(init: RequestInit) {
  let response: Response;
  try {
    response = await fetch("/api/auth/mfa", init);
  } catch {
    throw new MfaRequestError(0, "network");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new MfaRequestError(response.status, typeof data.reason === "string" ? data.reason : undefined, typeof data.error === "string" ? data.error : undefined);
  return data;
}

function errorText(t: Copy, error: MfaError, recovery: boolean) {
  if (error.reason === "code_reused" && recovery) return t.recoveryRace;
  if (error.reason && error.reason in t.reasons) return t.reasons[error.reason as Reason];
  return error.message || t.unavailable;
}

/** Authenticator codes are digits only; this accepts the "123 456" form apps display and copy. */
const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 6);
/** Same shape the server routes to the recovery path: 20 hex characters once spaces and dashes are removed. */
const isRecoveryShape = (value: string) => /^[0-9a-f]{20}$/i.test(value.replace(/[\s-]/g, ""));

function Stepper({ t, current }: { t: Copy; current: number }) {
  return (
    <ol aria-label={t.progress} className="mb-7 grid grid-cols-4 gap-2 print:hidden">
      {t.steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex min-w-0 flex-col items-center gap-2 text-center">
            <span className="flex w-full items-center">
              <span aria-hidden="true" className={cn("h-0.5 flex-1 rounded-full", index === 0 ? "bg-transparent" : index <= current ? "bg-[#8127cf]" : "bg-[#e7dcef]")} />
              <span aria-hidden="true" className={cn(
                "mx-1 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black motion-safe:transition-colors motion-safe:duration-300",
                done ? "bg-[#8127cf] text-white" : active ? "bg-white text-[#8127cf] ring-2 ring-[#8127cf] shadow-[0_6px_16px_-6px_rgba(129,39,207,0.55)]" : "bg-[#f3ecfa] text-ink-subtle",
              )}>
                {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
              </span>
              <span aria-hidden="true" className={cn("h-0.5 flex-1 rounded-full", index === t.steps.length - 1 ? "bg-transparent" : index < current ? "bg-[#8127cf]" : "bg-[#e7dcef]")} />
            </span>
            <span className={cn("text-[11px] font-bold leading-tight [overflow-wrap:anywhere]", active ? "text-[#1f1a23]" : "text-ink-muted")}>
              {label}{done && <span className="sr-only"> ({t.completed})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function ProtectAccount() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("en");
  const t = copy[language];
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [qr, setQr] = useState<{ uri: string; url?: string; failed?: boolean }>({ uri: "" });
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<MfaError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"enrolled" | "verified" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const recoveryInstructionsRef = useRef<HTMLHeadingElement>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const lang = document.documentElement.lang;
    if (lang === "ar" || lang === "ur") setLanguage(lang);
  }, []);

  useEffect(() => {
    let active = true;
    callMfa({ cache: "no-store" }).then(data => {
      if (active) setStatus(data);
    }).catch(failure => {
      if (!active) return;
      const known = failure instanceof MfaRequestError ? failure : new MfaRequestError(0, "server_error");
      setError({ reason: known.reason, message: known.message, status: known.status, scope: "page" });
    }).finally(() => {
      if (active) setStatusLoading(false);
    });
    return () => { active = false; };
  }, [statusAttempt]);

  // The QR is drawn in the browser from the otpauth URI, so the secret never goes to a third party.
  useEffect(() => {
    if (!uri) return;
    let active = true;
    QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 400, color: { dark: "#1f1a23", light: "#ffffff" } })
      .then(url => { if (active) setQr({ uri, url }); })
      .catch(() => { if (active) setQr({ uri, failed: true }); });
    return () => { active = false; };
  }, [uri]);

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  const expired = error?.reason === "session_expired" || error?.status === 401;
  const challengeView = !!status && (status.enrolled || !!status.resumeChallenge) && !secret && codes.length === 0;

  useEffect(() => {
    if (!error) return;
    if (error.scope === "field" && !expired) codeRef.current?.focus();
    else errorRef.current?.focus();
  }, [error, expired]);

  useEffect(() => {
    if (codes.length > 0) recoveryInstructionsRef.current?.focus();
    else if (secret || challengeView) codeRef.current?.focus();
  }, [codes.length, secret, challengeView]);

  function announce(next: Feedback) {
    setFeedback(next);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2400);
  }

  async function copyText(text: string, kind: "key" | "codes") {
    try {
      await navigator.clipboard.writeText(text);
      announce(kind);
    } catch {
      announce("copyFailed");
    }
  }

  function recoveryFile() {
    return [t.fileHeading, status?.school ? `${t.school}: ${status.school}` : "", "", ...codes, ""].join("\n");
  }

  function downloadCodes() {
    const href = URL.createObjectURL(new Blob([recoveryFile()], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "skoolee-recovery-codes.txt";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
    announce("download");
  }

  async function send(action: "setup" | "verify-setup" | "acknowledge" | "challenge") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await callMfa({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code, recovery, acknowledged: ack }),
      });
      if (data.secret) { setSecret(data.secret); setUri(typeof data.uri === "string" ? data.uri : ""); setCodes([]); setAck(false); setCode(""); setRecovery(false); }
      if (data.recoveryCodes) { setCodes(data.recoveryCodes); setSecret(""); setUri(""); setCode(""); }
      if (data.user) {
        setDone(action === "acknowledge" ? "enrolled" : "verified");
        router.replace(data.user.mustChangePassword ? "/first-login" : dashboardPathForRole(data.user.role));
      }
    } catch (failure) {
      const known = failure instanceof MfaRequestError ? failure : new MfaRequestError(0, "server_error");
      setError({ reason: known.reason, message: known.message, status: known.status, scope: action === "challenge" || action === "verify-setup" ? "field" : "page" });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(challengeView ? "challenge" : "verify-setup");
  }

  function chooseMethod(next: boolean) {
    if (busy || next === recovery) return;
    setRecovery(next);
    setCode("");
    setError(null);
    codeRef.current?.focus();
  }

  /** In authenticator mode a pasted or autofilled recovery code switches to recovery mode instead of being cut to 6 digits. */
  function enterCode(raw: string) {
    if (recovery) { setCode(raw); return; }
    if (challengeView && isRecoveryShape(raw)) {
      setRecovery(true);
      setError(null);
      setCode(raw.trim());
      return;
    }
    setCode(digitsOnly(raw));
  }

  function pasteCode(event: ClipboardEvent<HTMLInputElement>) {
    if (recovery) return;
    event.preventDefault();
    enterCode(event.clipboardData.getData("text"));
  }

  const message = error ? errorText(t, error, recovery) : "";
  const fieldError = error?.scope === "field" && !expired ? message : undefined;
  const pageError = error && (error.scope === "page" || expired) ? message : "";
  const view = statusLoading ? "loading"
    : expired ? "expired"
      : done ? "done"
        : !status ? "failed"
          : codes.length > 0 ? "codes"
            : secret ? "scan"
              : challengeView ? "challenge" : "intro";
  const step = view === "codes" ? 2 : view === "done" ? 3 : view === "scan" && (code || error) ? 1 : 0;
  const heading = view === "challenge" ? t.challengeTitle : view === "codes" ? t.codesTitle
    : view === "done" ? (done === "verified" ? t.verifiedTitle : t.doneTitle) : t.title;
  const subheading = view === "challenge" ? (status?.resumeChallenge && !status.enrolled ? t.resumeNote : recovery ? t.challengeRecoveryIntro : t.challengeIntro)
    : view === "intro" || view === "loading" ? t.intro : view === "scan" ? t.scanBody : view === "codes" ? "" : view === "done" ? t.doneBody : "";
  const keyGroups = secret.match(/.{1,4}/g)?.join(" ") ?? "";

  const alert = pageError ? (
    <div id="mfa-error" ref={errorRef} tabIndex={-1} role="alert" className="sk-shake mb-5 flex items-start gap-2.5 rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3 text-status-error-text">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-sm font-bold leading-snug">{pageError}</p>
    </div>
  ) : null;

  const codeField = (
    <FormField name="code" id="mfa-code" required error={fieldError}
      label={recovery ? t.recoveryLabel : view === "scan" ? t.codeLabelSetup : t.codeLabel}
      hint={recovery ? t.recoveryHint : t.codeHint}>
      <InputGroup surfaceClassName="bg-[#fcfaff] min-h-16">
        {recovery
          // Hidden on narrow screens so a full 24-character recovery code fits without scrolling.
          ? <LifeBuoy aria-hidden="true" data-field-affix="start" className="hidden size-5 text-[#8127cf] sm:block" />
          : <Smartphone aria-hidden="true" data-field-affix="start" className="size-5 text-[#8127cf]" />}
        <Input
          ref={codeRef}
          id="mfa-code"
          value={code}
          onChange={event => enterCode(event.target.value)}
          onPaste={pasteCode}
          autoComplete="one-time-code"
          inputMode={recovery ? "text" : "numeric"}
          maxLength={recovery ? 29 : undefined}
          spellCheck={false}
          autoCapitalize="characters"
          dir="ltr"
          placeholder={recovery ? "XXXX-XXXX-XXXX-XXXX-XXXX" : "••••••"}
          readOnly={busy}
          // Size and weight come from the shared field skin; only face and spacing are adjusted here.
          className={cn("text-center font-mono", recovery ? "tracking-normal sm:tracking-[0.08em]" : "tracking-[0.4em]")}
        />
      </InputGroup>
    </FormField>
  );

  const submitButton = (
    <Button type="submit" size="lg" disabled={busy} aria-busy={busy} className="w-full">
      {busy ? <><Loader2 aria-hidden="true" className="motion-safe:animate-spin" />{t.verifying}</> : <>{t.verify}<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" /></>}
    </Button>
  );

  return (
    <main lang={language} dir={language === "en" ? "ltr" : "rtl"} className="grid min-h-screen w-full grid-cols-1 bg-[#fff7fe] font-sans lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)] print:block print:bg-white">

      {/* ─── BRAND PANEL (matches /login) ─────────────────── */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8127cf] via-[#6f1fb8] to-[#4f1487] p-12 lg:flex xl:p-14 print:hidden">
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="sk-blob absolute -top-1/4 -start-1/5 h-[72%] w-[72%] rounded-full bg-[#9c48ea] opacity-70 blur-[90px]" />
          <div className="sk-blob sk-blob-2 absolute top-1/4 -end-1/4 h-[68%] w-[68%] rounded-full bg-[#b073f0] opacity-45 blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(255,255,255,.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.9)_1px,transparent_1px)] bg-[size:56px_56px]" />
        </div>

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="h-8 w-1 rounded-full bg-white/70" />
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">Skoolee AI</p>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 backdrop-blur-md">
            <LockKeyhole aria-hidden="true" className="size-3.5 text-[#e9d5ff]" />
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#e9d5ff]">{t.brandEyebrow}</span>
          </div>
          <p className="mt-7 text-[2.6rem] font-black leading-[1.06] tracking-[-0.035em] text-white text-balance xl:text-[3.1rem]">{t.brandTitle}</p>
          <p className="mt-5 max-w-md text-[15px] font-semibold leading-relaxed text-white/85">{t.brandBody}</p>
          <ul className="mt-9 space-y-3 rounded-3xl border border-white/25 bg-[#3d0f6b]/40 p-6 shadow-xl backdrop-blur-xl">
            {t.brandPoints.map((point, index) => {
              const Icon = [Timer, KeyRound, Smartphone][index] ?? ShieldCheck;
              return (
                <li key={point} className="flex items-center gap-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20"><Icon aria-hidden="true" className="size-[18px] text-white" /></span>
                  <span className="text-[15px] font-bold text-white">{point}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative z-10 flex items-center gap-1.5 text-[11px] font-bold text-white/75">
          <ShieldCheck aria-hidden="true" className="size-3.5" /> {t.brandFooter}
        </p>
      </section>

      {/* ─── FORM PANEL ───────────────────────────────────── */}
      <section className="flex min-w-0 flex-col items-center px-4 py-6 sm:px-10 sm:py-10 lg:justify-center lg:p-14 print:p-0">
        <div className="w-full max-w-[32rem]">
          <div className="mb-6 flex justify-end print:hidden">
            <FormField name="language" id="mfa-language" label={t.language} className="w-full max-w-48">
              <Select value={language} onChange={event => setLanguage(event.target.value as Language)}>
                <option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option>
              </Select>
            </FormField>
          </div>

          <div className="mb-7 flex flex-col items-center text-center">
            <SkooleeLogo size="min(2.35rem, 10vw)" weight="heavy" />
            <div aria-hidden="true" className="mt-3.5 h-1 w-12 rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" />
            <h1 className="mt-6 text-[1.9rem] font-black leading-tight tracking-[-0.035em] text-[#1f1a23] text-balance">{heading}</h1>
            {subheading && <p className="mt-2 max-w-md text-[14.5px] font-semibold leading-relaxed text-ink-muted">{subheading}</p>}
            {status?.school && view !== "expired" && (
              <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#e3d5f0] bg-white px-3 py-1 text-xs font-bold text-[#7020b9]">
                <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{t.school}: <bdi>{status.school}</bdi></span>
              </p>
            )}
          </div>

          <div className="rounded-[30px] border border-[#cfc2d6]/30 bg-white p-5 shadow-[0_28px_70px_-28px_rgba(129,39,207,0.28)] sm:p-8 print:border-0 print:p-0 print:shadow-none">
            {busy && <p role="status" className="sr-only">{t.working}</p>}
            <p aria-live="polite" className="sr-only">{feedback === "key" || feedback === "codes" ? t.copied : feedback === "download" ? t.downloaded : feedback === "copyFailed" ? t.copyFailed : ""}</p>

            {view === "loading" && (
              <div role="status" aria-busy="true" className="min-h-[22rem] space-y-5">
                <span className="sr-only">{t.checking}</span>
                <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="mx-auto size-9 rounded-full" delay={i * 60} />)}</div>
                <Skeleton className="h-5 w-2/3 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" delay={80} />
                <Skeleton className="h-16 w-full rounded-2xl" delay={140} />
                <Skeleton className="h-14 w-full rounded-2xl" delay={200} />
              </div>
            )}

            {view === "expired" && <>
              {alert}
              <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                {t.signInAgain}<ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </>}

            {view === "failed" && <>
              {alert}
              <Button type="button" variant="outline" className="w-full" onClick={() => { setError(null); setStatusLoading(true); setStatusAttempt(attempt => attempt + 1); }}>
                <RotateCcw aria-hidden="true" />{t.tryAgain}
              </Button>
            </>}

            {view === "intro" && <>
              <Stepper t={t} current={0} />
              {alert}
              <div className="mb-6 flex items-start gap-3 rounded-2xl bg-[#faf5ff] p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-sm shadow-[#8127cf]/25"><Smartphone aria-hidden="true" className="size-5" /></span>
                <p className="text-sm font-semibold leading-relaxed text-ink-muted">{t.apps}</p>
              </div>
              <Button type="button" size="lg" className="w-full" disabled={busy} aria-busy={busy} onClick={() => send("setup")}>
                {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <ShieldCheck aria-hidden="true" />}
                {status?.awaitingAcknowledgement ? t.retry : t.setup}
              </Button>
            </>}

            {view === "scan" && <>
              <Stepper t={t} current={step} />
              <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div className="mx-auto rounded-[26px] bg-gradient-to-br from-[#8127cf] via-[#9c48ea] to-[#f0abfc] p-[3px] shadow-[0_18px_40px_-20px_rgba(129,39,207,0.6)]">
                  {/* Fixed pixel size: a scannable QR must not grow with the text size. */}
                  <div className="flex size-[176px] items-center justify-center rounded-[23px] bg-white p-2.5">
                    {qr.uri === uri && qr.url ? <img src={qr.url} alt={t.qrAlt} width={160} height={160} className="size-full [image-rendering:pixelated]" />
                      : uri && !(qr.uri === uri && qr.failed) ? <Skeleton className="size-full rounded-xl" />
                        : <p className="text-center text-xs font-bold text-ink-muted">{t.qrUnavailable}</p>}
                  </div>
                </div>
                <div className="min-w-0 text-center sm:text-start">
                  <h2 className="flex items-center justify-center gap-2 text-base font-black text-[#1f1a23] sm:justify-start"><span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-[#8127cf] text-xs text-white">1</span>{t.scanTitle}</h2>
                  <p className="mt-1.5 text-sm font-semibold leading-relaxed text-ink-muted">{t.apps}</p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-dashed border-[#d8cfe5] bg-[#fcfaff] p-4">
                <p className="text-xs font-black uppercase tracking-wider text-ink-muted">{t.manualTitle}</p>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                  <bdi dir="ltr" className="min-w-0 flex-1">
                    <code id="mfa-secret" className="block font-mono text-[15px] font-bold tracking-[0.12em] text-[#1f1a23] [overflow-wrap:anywhere] select-all">{keyGroups}</code>
                  </bdi>
                  <Button type="button" variant="outline" size="sm" onClick={() => copyText(secret, "key")}>
                    {feedback === "key" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {feedback === "key" ? t.copied : t.copyKey}
                  </Button>
                </div>
                <p className="mt-2.5 text-xs font-semibold leading-relaxed text-ink-subtle">{t.manualHint}</p>
              </div>

              <div className="my-6 h-px bg-[#cfc2d6]/30" />
              <form onSubmit={submit} aria-busy={busy} className="space-y-5" noValidate>
                {codeField}
                {submitButton}
              </form>
              {error?.reason === "setup_expired" && (
                <Button type="button" variant="outline" className="mt-3 w-full" disabled={busy} onClick={() => send("setup")}><RotateCcw aria-hidden="true" />{t.retry}</Button>
              )}
            </>}

            {view === "challenge" && <>
              <form onSubmit={submit} aria-busy={busy} className="space-y-5" noValidate>
                <div role="group" aria-label={t.method} className="grid grid-cols-2 gap-1 rounded-2xl border border-[#ece3f3] bg-[#f7f2fb] p-1">
                  {([false, true] as const).map(option => (
                    <Button key={String(option)} type="button" variant="choice" aria-pressed={recovery === option} disabled={busy} onClick={() => chooseMethod(option)}
                      className="border-transparent bg-transparent px-2 text-ink-muted aria-pressed:border-[#e3d5f0] aria-pressed:bg-white aria-pressed:text-[#7020b9] aria-pressed:shadow-[0_6px_14px_-8px_rgba(129,39,207,0.45)]">
                      {option ? <LifeBuoy aria-hidden="true" /> : <Smartphone aria-hidden="true" />}
                      {option ? t.methodRecovery : t.methodApp}
                    </Button>
                  ))}
                </div>
                {codeField}
                {submitButton}
              </form>
              {status?.resumeChallenge && !status.enrolled && (
                <div className="mt-6 border-t border-[#cfc2d6]/25 pt-5">
                  <p id="mfa-start-over-hint" className="flex items-start gap-2 text-xs font-semibold leading-relaxed text-ink-muted"><Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{t.startOverHint}</p>
                  <Button type="button" variant="ghost" className="mt-2 w-full" disabled={busy} aria-describedby="mfa-start-over-hint" onClick={() => send("setup")}><RotateCcw aria-hidden="true" />{t.retry}</Button>
                </div>
              )}
            </>}

            {view === "codes" && <>
              <Stepper t={t} current={2} />
              <h2 id="mfa-recovery-instructions" ref={recoveryInstructionsRef} tabIndex={-1} className="sr-only">{t.codesTitle}</h2>
              <div className="flex items-start gap-3 rounded-2xl border border-status-warning-border bg-status-warning-surface p-4 text-status-warning-text">
                <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <p id="mfa-save-guidance" className="text-sm font-semibold leading-relaxed">{t.save}</p>
              </div>
              <ol aria-label={t.codesList} aria-describedby="mfa-save-guidance" className="mt-5 grid grid-cols-1 gap-1.5">
                {codes.map((value, index) => (
                  <li key={value} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#ece3f3] bg-[#fcfaff] px-3.5 py-2 print:border-[#999]">
                    <span aria-hidden="true" className="w-5 shrink-0 text-xs font-black tabular-nums text-ink-subtle">{index + 1}</span>
                    <bdi dir="ltr" className="min-w-0 font-mono text-sm font-bold tracking-wide text-[#1f1a23] [overflow-wrap:anywhere]">{value}</bdi>
                  </li>
                ))}
              </ol>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 print:hidden">
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(codes.join("\n"), "codes")}>
                  {feedback === "codes" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{feedback === "codes" ? t.copied : t.copyAll}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={downloadCodes}><Download aria-hidden="true" />{t.download}</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => window.print()}><Printer aria-hidden="true" />{t.print}</Button>
              </div>
              <div className="mt-6 print:hidden">
                {alert}
                <Label htmlFor="mfa-ack" className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-[#ece3f3] bg-[#faf5ff] p-4 text-sm font-bold leading-snug text-[#1f1a23]">
                  <Checkbox id="mfa-ack" checked={ack} disabled={busy} onChange={event => setAck(event.target.checked)} className="mt-0.5" />
                  {t.ack}
                </Label>
                <Button type="button" size="lg" className="mt-4 w-full" disabled={!ack || busy} aria-busy={busy} onClick={() => send("acknowledge")}>
                  {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : null}{t.finish}{busy ? null : <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />}
                </Button>
              </div>
            </>}

            {view === "done" && <>
              {done === "enrolled" && <Stepper t={t} current={3} />}
              <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="sk-check-pop flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-[0_14px_30px_-12px_rgba(129,39,207,0.7)]">
                  <CheckCircle2 aria-hidden="true" className="size-8" />
                </span>
                <p className="text-base font-black text-[#1f1a23]">{done === "verified" ? t.verifiedTitle : t.doneTitle}</p>
                <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted"><Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />{t.doneBody}</p>
              </div>
            </>}
          </div>

          {view !== "expired" && view !== "done" && (
            <div className="mt-6 flex justify-center print:hidden">
              <Link href="/login" className="flex min-h-11 items-center px-2 text-sm font-bold text-[#8127cf] underline-offset-4 motion-safe:transition-colors hover:text-[#9c48ea] hover:underline">{t.login}</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
