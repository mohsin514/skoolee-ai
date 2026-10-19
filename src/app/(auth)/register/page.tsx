'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building, Building2, Mail, MailCheck, Lock,
  User as UserIcon, Users,
  CheckCircle, ShieldCheck,
  ArrowRight, Hash,
  LucideIcon, ChevronLeft,
  Eye, EyeOff, AlertCircle, Phone, Check, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { FieldAction, InputGroup } from "@/components/ui/input-group";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip, InfoTip } from "@/components/ui/tooltip";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress, type ProgressTone } from "@/components/ui/progress";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { AuthCover } from "@/components/auth/AuthCover";
import { AuthColophon } from "@/components/auth/AuthColophon";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { CampusDiorama } from "@/components/auth/CampusDiorama";
import { InstitutionPreview } from "@/components/auth/InstitutionPreview";
import { EmailTypoHint } from "@/components/auth/EmailTypoHint";
import { RequirementChecklist } from "@/components/auth/RequirementChecklist";
import { SealedEnvelope } from "@/components/auth/SealedEnvelope";
import { MailHandoff } from "@/components/auth/MailHandoff";
import { VerificationResend } from "@/components/auth/VerificationResend";
import { WaxSeal } from "@/components/auth/WaxSeal";
import { authCopy } from "@/lib/auth/auth-copy";
import { clearRegisterDraft, saveRegisterDraft, stashAuthEmail, takeRegisterDraft } from "@/lib/auth/auth-handoff";
import { fillNodes, fillText } from "@/lib/auth/fill-nodes";
import { COUNTRIES, currencyForCountry, type Country } from "@/lib/locale/country";
import { WORLD_COUNTRIES, billingCountry, countryName, dialCodeFor, sortedCountries } from "@/lib/locale/world-countries";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import type { Language } from "@/lib/locale/package";

type RegistrationType = 'school_group' | 'single_campus';

interface FormState {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  schoolName: string;
  country: Country;
  regId: string;
  autoId: boolean;
  acceptedTerms: boolean;
}

interface InputFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  icon: LucideIcon;
  type?: string;
  className?: string;
  required?: boolean;
  autoComplete?: string;
  error?: string;
  hint?: string;
  descriptionId?: string;
  /** Mobile keyboard hints — attributes only, they never change the payload. */
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoCapitalize?: string;
  spellCheck?: boolean;
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
}

interface TypeOptionProps {
  value: RegistrationType;
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}

type PanelCopy = { headline: string; accent: string; body: string; caption: string };

/** Every visible registration string, co-located like login and protect-account.
 *  Language, policy and claim labels come from the shared auth copy. */
const en = {
  srHeading: "Register your school",
  steps: ["Institution", "Your account", "Verify"],
  progress: "Registration progress",
  stepOf: "Step {0} of {1}: {2}",
  /**
   * The cover says something different depending on what is being set up,
   * so it stays relevant to the choice rather than repeating one generic
   * pitch through the whole flow.
   */
  panel: {
    school_group: {
      headline: "Run every campus",
      accent: "from one login.",
      body: "Each branch keeps its own classes, fees and staff — sealed from the others — while the group office sees all of it in one roll-up.",
      caption: "Campus-level isolation, group-level visibility.",
    },
    single_campus: {
      headline: "Set up your school",
      accent: "with a clear plan.",
      body: "Start with up to 50 students, 2 teacher accounts, one campus and 100 AI credits per month. Compare the current plan limits before you register.",
      caption: "Unused AI credits expire at the calendar month reset.",
    },
  } as Record<RegistrationType, PanelCopy>,
  eyebrow: "Plan your account",
  previewLight: "How your institution",
  previewStrong: "will appear.",
  strength: ["", "Very weak", "Weak", "Fair", "Strong", "Excellent"],
  strengthEmpty: "Not entered yet",
  requirements: ["Min 8 characters", "One uppercase", "One number", "Special character", "Passwords match"],
  ruleMet: "Met",
  ruleUnmet: "Not met yet",
  emailError: "Enter a valid email address",
  nameError: "Enter your full name",
  schoolNameError: "Institution name must be at least 3 characters",
  regIdError: "An institution ID is required.",
  passwordError: "Please meet all password requirements.",
  confirmError: "Passwords must match.",
  problemName: "Please enter your full name.",
  problemEmail: "Please enter a valid email address.",
  problemSchool: "Please enter your institution's name.",
  problemTerms: "Please accept the Terms of Service and Privacy Policy.",
  startFailed: "We couldn't start your registration. Please try again.",
  registrationFailed: "We couldn't create your account. Check your details and try again.",
  setupTitle: "How is your school set up?",
  setupIntro: "Choose the option that best describes your institution.",
  institutionType: "Institution type",
  groupTitle: "Multi-Campus School Group",
  groupDesc: "One school with multiple campuses or branches.",
  singleTitle: "Single Campus School",
  singleDesc: "One school, one location — quick and simple.",
  groupNote: "You'll sign in as Super Admin and add each campus during setup.",
  singleNote: "You'll sign in as Campus Admin — your single campus is created for you.",
  continue: "Continue",
  haveAccount: "Already have an account?",
  logIn: "Log in",
  kickerGroup: "Multi-Campus",
  kickerSingle: "Single Campus",
  createTitle: "Create your account",
  backToType: "Back to institution type",
  groupDetails: "Your details",
  groupInstitution: "Your institution",
  groupSecurity: "Security",
  groupStrength: "Password strength",
  fullName: "Full Name",
  fullNamePlaceholder: "Your full name",
  email: "Work Email",
  phone: "Phone Number",
  phoneHint: "Used for account recovery and parent-facing contact.",
  dialCode: "Country code",
  popularCountries: "Popular",
  allCountries: "All countries",
  groupName: "School Group Name",
  schoolName: "School Name",
  groupNamePlaceholder: "e.g. Beaconhouse School System",
  schoolNamePlaceholder: "e.g. Horizon Academy",
  country: "Institution country",
  countryHint: "Default billing currency: {0}. Prices keep their published currency; no conversion is applied.",
  countries: { PK: "Pakistan", SA: "Saudi Arabia", AE: "United Arab Emirates", KW: "Kuwait", OTHER: "Other" } as Record<Country, string>,
  groupId: "School Group ID",
  schoolId: "School ID",
  auto: "Auto",
  manual: "Manual",
  regIdHint: "Printed on report cards, invoices and receipts. It cannot be changed later.",
  regIdTipLabel: "About the institution ID",
  regIdTip: "Auto creates a code for you. Choose Manual to type your own; letters are saved in capitals.",
  generateId: "Generate a new ID",
  password: "Password",
  passwordPlaceholder: "Min 8 characters",
  confirmPassword: "Confirm Password",
  confirmPlaceholder: "Re-enter password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  showConfirm: "Show confirm password",
  hideConfirm: "Hide confirm password",
  capsLock: "Caps Lock is on",
  agreePrefix: "I agree to the",
  privacyPolicy: "Privacy Policy",
  and: "and",
  aiPolicy: "AI Governance policy",
  agreeSuffix: ", and confirm I'm authorised to register this institution.",
  back: "Back",
  creating: "Creating account…",
  create: "Create Account",
  createdTitle: "Check your email",
  sentLight: "Your welcome letter",
  sentStrong: "is on its way.",
  sentBody: "Open the link in that email to activate your account, then sign in to finish setting up {0}.",
  nextTitle: "What happens next",
  nextVerify: "Verify your email address",
  nextGroup: "Add your campuses, session dates and working days",
  nextSingle: "Add your campus details, session dates and working days",
  nextInvite: "Invite staff and import your student roster",
  goToLogin: "Go to Login",
};
type RegisterCopy = typeof en;

const copy: Record<Language, RegisterCopy> = {
  en,
  ar: {
    srHeading: "سجّل مدرستك",
    steps: ["المؤسسة", "حسابك", "التحقق"],
    progress: "تقدّم التسجيل",
    stepOf: "الخطوة {0} من {1}: {2}",
    panel: {
      school_group: {
        headline: "أدِر كل الفروع",
        accent: "بتسجيل دخول واحد.",
        body: "يحتفظ كل فرع بفصوله ورسومه وموظفيه — معزولاً عن الآخرين — بينما يرى مكتب المجموعة كل ذلك في عرض موحّد.",
        caption: "عزل على مستوى الفرع، ورؤية على مستوى المجموعة.",
      },
      single_campus: {
        headline: "أعدّ مدرستك",
        accent: "بخطة واضحة.",
        body: "ابدأ بما يصل إلى 50 طالباً وحسابين للمعلمين وفرع واحد و100 رصيد ذكاء اصطناعي شهرياً. قارن حدود الخطة الحالية قبل التسجيل.",
        caption: "تنتهي أرصدة الذكاء الاصطناعي غير المستخدمة عند بداية الشهر التقويمي.",
      },
    },
    eyebrow: "خطّط لحسابك",
    previewLight: "هكذا ستبدو",
    previewStrong: "مؤسستك.",
    strength: ["", "ضعيفة جداً", "ضعيفة", "مقبولة", "قوية", "ممتازة"],
    strengthEmpty: "لم تُدخل بعد",
    requirements: ["٨ أحرف على الأقل", "حرف كبير واحد", "رقم واحد", "رمز خاص", "كلمتا المرور متطابقتان"],
    ruleMet: "مستوفى",
    ruleUnmet: "غير مستوفى بعد",
    emailError: "أدخل بريداً إلكترونياً صالحاً",
    nameError: "أدخل اسمك الكامل",
    schoolNameError: "يجب أن يتكون اسم المؤسسة من 3 أحرف على الأقل",
    regIdError: "معرّف المؤسسة مطلوب.",
    passwordError: "استوفِ جميع متطلبات كلمة المرور.",
    confirmError: "يجب أن تتطابق كلمتا المرور.",
    problemName: "أدخل اسمك الكامل.",
    problemEmail: "أدخل بريداً إلكترونياً صالحاً.",
    problemSchool: "أدخل اسم مؤسستك.",
    problemTerms: "وافق على شروط الخدمة وسياسة الخصوصية.",
    startFailed: "تعذّر بدء التسجيل. حاول مرة أخرى.",
    registrationFailed: "تعذّر إنشاء حسابك. تحقّق من بياناتك وحاول مرة أخرى.",
    setupTitle: "كيف تُنظَّم مدرستك؟",
    setupIntro: "اختر الخيار الذي يصف مؤسستك بشكل أفضل.",
    institutionType: "نوع المؤسسة",
    groupTitle: "مجموعة مدارس متعددة الفروع",
    groupDesc: "مدرسة واحدة بعدة فروع أو أقسام.",
    singleTitle: "مدرسة بفرع واحد",
    singleDesc: "مدرسة واحدة في موقع واحد — سريع وبسيط.",
    groupNote: "ستسجّل الدخول كمسؤول أعلى وتضيف كل فرع أثناء الإعداد.",
    singleNote: "ستسجّل الدخول كمسؤول الفرع — يُنشأ فرعك الوحيد تلقائياً.",
    continue: "متابعة",
    haveAccount: "لديك حساب بالفعل؟",
    logIn: "تسجيل الدخول",
    kickerGroup: "متعدد الفروع",
    kickerSingle: "فرع واحد",
    createTitle: "أنشئ حسابك",
    backToType: "العودة إلى نوع المؤسسة",
    groupDetails: "بياناتك",
    groupInstitution: "مؤسستك",
    groupSecurity: "الأمان",
    groupStrength: "قوة كلمة المرور",
    fullName: "الاسم الكامل",
    fullNamePlaceholder: "اسمك الكامل",
    email: "البريد الإلكتروني للعمل",
    phone: "رقم الهاتف",
    phoneHint: "يُستخدم لاستعادة الحساب والتواصل مع أولياء الأمور.",
    dialCode: "رمز الدولة",
    popularCountries: "الأكثر استخداماً",
    allCountries: "جميع الدول",
    groupName: "اسم مجموعة المدارس",
    schoolName: "اسم المدرسة",
    groupNamePlaceholder: "مثال: Beaconhouse School System",
    schoolNamePlaceholder: "مثال: Horizon Academy",
    country: "دولة المؤسسة",
    countryHint: "عملة الفوترة الافتراضية: {0}. تبقى الأسعار بعملتها المنشورة دون أي تحويل.",
    countries: { PK: "باكستان", SA: "المملكة العربية السعودية", AE: "الإمارات العربية المتحدة", KW: "الكويت", OTHER: "أخرى" },
    groupId: "معرّف مجموعة المدارس",
    schoolId: "معرّف المدرسة",
    auto: "تلقائي",
    manual: "يدوي",
    regIdHint: "يُطبع على بطاقات التقارير والفواتير والإيصالات، ولا يمكن تغييره لاحقاً.",
    regIdTipLabel: "حول معرّف المؤسسة",
    regIdTip: "ينشئ الوضع التلقائي رمزاً لك. اختر «يدوي» لكتابة رمزك الخاص؛ وتُحفظ الأحرف اللاتينية بأحرف كبيرة.",
    generateId: "إنشاء معرّف جديد",
    password: "كلمة المرور",
    passwordPlaceholder: "٨ أحرف على الأقل",
    confirmPassword: "تأكيد كلمة المرور",
    confirmPlaceholder: "أعد إدخال كلمة المرور",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    showConfirm: "إظهار تأكيد كلمة المرور",
    hideConfirm: "إخفاء تأكيد كلمة المرور",
    capsLock: "مفتاح الأحرف الكبيرة مفعّل",
    agreePrefix: "أوافق على",
    privacyPolicy: "سياسة الخصوصية",
    and: "و",
    aiPolicy: "سياسة حوكمة الذكاء الاصطناعي",
    agreeSuffix: "، وأؤكد أنني مخوّل بتسجيل هذه المؤسسة.",
    back: "رجوع",
    creating: "جارٍ إنشاء الحساب…",
    create: "إنشاء الحساب",
    createdTitle: "تحقق من بريدك الإلكتروني",
    sentLight: "رسالة الترحيب",
    sentStrong: "في طريقها إليك.",
    sentBody: "افتح الرابط في تلك الرسالة لتفعيل حسابك، ثم سجّل الدخول لإكمال إعداد {0}.",
    nextTitle: "ما الخطوات التالية",
    nextVerify: "تحقق من عنوان بريدك الإلكتروني",
    nextGroup: "أضف فروعك وتواريخ الفصل الدراسي وأيام العمل",
    nextSingle: "أضف بيانات فرعك وتواريخ الفصل الدراسي وأيام العمل",
    nextInvite: "ادعُ الموظفين واستورد قائمة الطلاب",
    goToLogin: "الذهاب لتسجيل الدخول",
  },
  ur: {
    srHeading: "اپنا اسکول رجسٹر کریں",
    steps: ["ادارہ", "آپ کا اکاؤنٹ", "تصدیق"],
    progress: "رجسٹریشن کی پیش رفت",
    stepOf: "مرحلہ {0} از {1}: {2}",
    panel: {
      school_group: {
        headline: "ہر کیمپس چلائیں",
        accent: "ایک ہی لاگ اِن سے۔",
        body: "ہر شاخ اپنی کلاسیں، فیسیں اور عملہ الگ رکھتی ہے — دوسروں سے محفوظ — جبکہ گروپ آفس سب کچھ ایک جگہ دیکھتا ہے۔",
        caption: "کیمپس کی سطح پر علیحدگی، گروپ کی سطح پر نگرانی۔",
      },
      single_campus: {
        headline: "اپنا اسکول سیٹ اپ کریں",
        accent: "ایک واضح پلان کے ساتھ۔",
        body: "50 طلبہ، 2 اساتذہ اکاؤنٹس، ایک کیمپس اور ہر ماہ 100 اے آئی کریڈٹس سے آغاز کریں۔ رجسٹر کرنے سے پہلے موجودہ پلان کی حدود کا موازنہ کریں۔",
        caption: "غیر استعمال شدہ اے آئی کریڈٹس کیلنڈر مہینے کے آغاز پر ختم ہو جاتے ہیں۔",
      },
    },
    eyebrow: "اپنے اکاؤنٹ کی منصوبہ بندی کریں",
    previewLight: "آپ کا ادارہ",
    previewStrong: "یوں نظر آئے گا۔",
    strength: ["", "بہت کمزور", "کمزور", "مناسب", "مضبوط", "بہترین"],
    strengthEmpty: "ابھی درج نہیں کیا گیا",
    requirements: ["کم از کم ۸ حروف", "ایک بڑا انگریزی حرف", "ایک عدد", "ایک خاص علامت", "پاس ورڈ ایک جیسے ہیں"],
    ruleMet: "پوری ہو گئی",
    ruleUnmet: "ابھی پوری نہیں ہوئی",
    emailError: "درست ای میل ایڈریس درج کریں",
    nameError: "اپنا پورا نام درج کریں",
    schoolNameError: "ادارے کا نام کم از کم 3 حروف کا ہونا چاہیے",
    regIdError: "ادارے کی شناختی آئی ڈی درکار ہے۔",
    passwordError: "پاس ورڈ کی تمام شرائط پوری کریں۔",
    confirmError: "پاس ورڈ ایک جیسے ہونے چاہییں۔",
    problemName: "براہ کرم اپنا پورا نام درج کریں۔",
    problemEmail: "براہ کرم درست ای میل ایڈریس درج کریں۔",
    problemSchool: "براہ کرم اپنے ادارے کا نام درج کریں۔",
    problemTerms: "براہ کرم سروس کی شرائط اور رازداری کی پالیسی قبول کریں۔",
    startFailed: "رجسٹریشن شروع نہیں ہو سکی۔ براہ کرم دوبارہ کوشش کریں۔",
    registrationFailed: "آپ کا اکاؤنٹ نہیں بن سکا۔ اپنی تفصیلات دیکھ کر دوبارہ کوشش کریں۔",
    setupTitle: "آپ کا اسکول کیسے منظم ہے؟",
    setupIntro: "وہ آپشن منتخب کریں جو آپ کے ادارے کو بہتر طور پر بیان کرے۔",
    institutionType: "ادارے کی قسم",
    groupTitle: "کثیر کیمپس اسکول گروپ",
    groupDesc: "ایک اسکول جس کے متعدد کیمپس یا شاخیں ہیں۔",
    singleTitle: "ایک کیمپس والا اسکول",
    singleDesc: "ایک اسکول، ایک مقام — جلد اور آسان۔",
    groupNote: "آپ سپر ایڈمن کے طور پر سائن اِن کریں گے اور سیٹ اپ کے دوران ہر کیمپس شامل کریں گے۔",
    singleNote: "آپ کیمپس ایڈمن کے طور پر سائن اِن کریں گے — آپ کا واحد کیمپس خود بخود بن جائے گا۔",
    continue: "جاری رکھیں",
    haveAccount: "پہلے سے اکاؤنٹ ہے؟",
    logIn: "سائن اِن",
    kickerGroup: "کثیر کیمپس",
    kickerSingle: "ایک کیمپس",
    createTitle: "اپنا اکاؤنٹ بنائیں",
    backToType: "ادارے کی قسم پر واپس جائیں",
    groupDetails: "آپ کی تفصیلات",
    groupInstitution: "آپ کا ادارہ",
    groupSecurity: "سیکیورٹی",
    groupStrength: "پاس ورڈ کی مضبوطی",
    fullName: "پورا نام",
    fullNamePlaceholder: "آپ کا پورا نام",
    email: "دفتری ای میل",
    phone: "فون نمبر",
    phoneHint: "اکاؤنٹ کی بحالی اور والدین سے رابطے کے لیے استعمال ہوتا ہے۔",
    dialCode: "ملک کا کوڈ",
    popularCountries: "مقبول",
    allCountries: "تمام ممالک",
    groupName: "اسکول گروپ کا نام",
    schoolName: "اسکول کا نام",
    groupNamePlaceholder: "مثلاً Beaconhouse School System",
    schoolNamePlaceholder: "مثلاً Horizon Academy",
    country: "ادارے کا ملک",
    countryHint: "بلنگ کی ڈیفالٹ کرنسی: {0}۔ قیمتیں اپنی شائع شدہ کرنسی میں رہتی ہیں؛ کوئی تبدیلی نہیں کی جاتی۔",
    countries: { PK: "پاکستان", SA: "سعودی عرب", AE: "متحدہ عرب امارات", KW: "کویت", OTHER: "دیگر" },
    groupId: "اسکول گروپ آئی ڈی",
    schoolId: "اسکول آئی ڈی",
    auto: "خودکار",
    manual: "دستی",
    regIdHint: "رپورٹ کارڈز، انوائسز اور رسیدوں پر چھپتی ہے۔ بعد میں تبدیل نہیں ہو سکتی۔",
    regIdTipLabel: "ادارے کی آئی ڈی کے بارے میں",
    regIdTip: "خودکار آپشن آپ کے لیے کوڈ بنا دیتا ہے۔ اپنا کوڈ لکھنے کے لیے دستی منتخب کریں؛ انگریزی حروف بڑے حروف میں محفوظ ہوتے ہیں۔",
    generateId: "نئی آئی ڈی بنائیں",
    password: "پاس ورڈ",
    passwordPlaceholder: "کم از کم ۸ حروف",
    confirmPassword: "پاس ورڈ کی تصدیق",
    confirmPlaceholder: "پاس ورڈ دوبارہ درج کریں",
    showPassword: "پاس ورڈ دکھائیں",
    hidePassword: "پاس ورڈ چھپائیں",
    showConfirm: "تصدیقی پاس ورڈ دکھائیں",
    hideConfirm: "تصدیقی پاس ورڈ چھپائیں",
    capsLock: "کیپس لاک آن ہے",
    agreePrefix: "میں",
    privacyPolicy: "رازداری کی پالیسی",
    and: "اور",
    aiPolicy: "اے آئی گورننس پالیسی",
    agreeSuffix: " سے متفق ہوں، اور تصدیق کرتا/کرتی ہوں کہ مجھے اس ادارے کو رجسٹر کرنے کا اختیار ہے۔",
    back: "واپس",
    creating: "اکاؤنٹ بن رہا ہے…",
    create: "اکاؤنٹ بنائیں",
    createdTitle: "اپنا ای میل دیکھیں",
    sentLight: "آپ کا خوش آمدیدی خط",
    sentStrong: "راستے میں ہے۔",
    sentBody: "اکاؤنٹ فعال کرنے کے لیے اس ای میل میں موجود لنک کھولیں، پھر {0} کا سیٹ اپ مکمل کرنے کے لیے سائن اِن کریں۔",
    nextTitle: "آگے کیا ہوگا",
    nextVerify: "اپنے ای میل ایڈریس کی تصدیق کریں",
    nextGroup: "اپنے کیمپس، سیشن کی تاریخیں اور کام کے دن شامل کریں",
    nextSingle: "اپنے کیمپس کی تفصیلات، سیشن کی تاریخیں اور کام کے دن شامل کریں",
    nextInvite: "عملے کو مدعو کریں اور طلبہ کی فہرست درآمد کریں",
    goToLogin: "سائن اِن پر جائیں",
  },
};

/** A local example per country, so the format is obvious. Placeholder only: the payload is unchanged. */
/** National-number placeholder for the selected dial code (the code itself is in the picker). */
const PHONE_PLACEHOLDER: Record<string, string> = {
  "+92": "300 1234567",
  "+966": "5X XXX XXXX",
  "+971": "5X XXX XXXX",
  "+965": "XXXX XXXX",
};

/** The payload keeps one string: a number typed with its own "+" wins, otherwise the picked code is prefixed. */
function fullPhone(dial: string, phone: string) {
  const number = phone.trim();
  if (!number) return "";
  return number.startsWith("+") ? number : `${dial} ${number.replace(/^0+/, "")}`;
}

const isCountry = (value: unknown): value is Country =>
  typeof value === "string" && (COUNTRIES as readonly string[]).includes(value);

/** Four-character suffix, uppercase, for a generated identity code. */
function randomSuffix() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function generateRegId(type: RegistrationType) {
  return `${type === 'school_group' ? 'SKL' : 'SC'}-${randomSuffix()}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const { language, setLanguage } = useAuthLanguage();
  const t = copy[language];
  const ac = authCopy[language];
  const [step, setStep] = useState(1);
  const [type, setType] = useState<RegistrationType>('school_group');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Bumped with every new error so the mascot reacts to a repeat of the same message too. */
  const [errorSeq, setErrorSeq] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  /** The mascot glances at the newly chosen institution type (user changes only, never on mount). */
  const [typeGlance, setTypeGlance] = useState<string | null>(null);
  /** True once the step 3 card is on screen, so the mascot's glance has an envelope to look at. */
  const [sentShown, setSentShown] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  /** Set when a server error should take focus. The Alert is focused once it has committed. */
  const focusErrorPending = useRef(false);
  const draftReady = useRef(false);

  // Any country in the world; billing only stores PK/SA/AE/KW or OTHER (formData.country).
  const [countryIso, setCountryIso] = useState("PK");
  // Follows the institution country until the person picks a code themselves.
  const [dialPick, setDialPick] = useState<string | null>(null);
  const worldList = useMemo(() => sortedCountries(language), [language]);
  const [formData, setFormData] = useState<FormState>({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    schoolName: '',
    country: "PK",
    regId: '',
    autoId: true,
    acceptedTerms: false,
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const showError = (message: string) => {
    setFormError(message);
    setErrorSeq((n) => n + 1);
  };

  /**
   * Focus the server-error Alert after the commit that mounts it. The old
   * requestAnimationFrame could run before React rendered the update (it is
   * scheduled outside an event), so focus was sometimes lost.
   */
  useEffect(() => {
    if (!focusErrorPending.current || !formError) return;
    focusErrorPending.current = false;
    errorRef.current?.focus();
  }, [formError, errorSeq]);

  /**
   * Silent session draft: a reload or a killed WebView in this tab brings the
   * non-secret fields back (never passwords), and the flow restarts at step 1.
   * The ref keeps the read-once take from running twice under StrictMode.
   */
  useEffect(() => {
    if (draftReady.current) return;
    draftReady.current = true;
    const draft = takeRegisterDraft();
    if (!draft) return;
    const manual = draft.regIdMode === "manual";
    setType(draft.type);
    if (isCountry(draft.country) && draft.country !== "OTHER") setCountryIso(draft.country);
    setFormData((prev) => ({
      ...prev,
      name: draft.name ?? prev.name,
      email: draft.email ?? prev.email,
      phone: draft.phone ?? prev.phone,
      schoolName: draft.schoolName ?? prev.schoolName,
      country: isCountry(draft.country) ? draft.country : prev.country,
      autoId: !manual,
      regId: manual ? (draft.regId ?? "") : prev.regId,
    }));
  }, []);

  useEffect(() => {
    if (!draftReady.current || step === 3) return;
    saveRegisterDraft({
      type,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      schoolName: formData.schoolName,
      country: formData.country,
      regIdMode: formData.autoId ? "auto" : "manual",
      regId: formData.autoId ? undefined : formData.regId,
    });
  }, [step, type, formData.name, formData.email, formData.phone, formData.schoolName, formData.country, formData.autoId, formData.regId]);

  const passwordRequirements = useMemo(() => [
    { label: t.requirements[0], met: formData.password.length >= 8 },
    { label: t.requirements[1], met: /[A-Z]/.test(formData.password) },
    { label: t.requirements[2], met: /[0-9]/.test(formData.password) },
    { label: t.requirements[3], met: /[^A-Za-z0-9]/.test(formData.password) },
    { label: t.requirements[4], met: formData.password === formData.confirmPassword && formData.password !== '' },
  ], [formData.password, formData.confirmPassword, t]);

  /**
   * Strength is scored on the four composition rules plus a length bonus, so a
   * long passphrase is not punished for skipping a symbol. "Passwords match" is
   * excluded — it says nothing about how strong the password is.
   */
  const strength = useMemo(() => {
    const composition = passwordRequirements.slice(0, 4).filter((r) => r.met).length;
    const lengthBonus = formData.password.length >= 14 ? 1 : 0;
    const score = formData.password ? Math.min(5, composition + lengthBonus) : 0;
    const labels = t.strength;
    const tones: ProgressTone[] = ["neutral", "danger", "danger", "warning", "success", "success"];
    const text = [
      "text-ink-subtle",
      "text-status-error-text",
      "text-status-error-text",
      "text-status-warning-text",
      "text-status-success-text",
      "text-status-success-text",
    ];
    return { score, label: labels[score], tone: tones[score], text: text[score] };
  }, [passwordRequirements, formData.password, t]);

  const emailError = touched.email && !EMAIL_PATTERN.test(formData.email)
    ? t.emailError
    : undefined;
  const nameError = touched.name && formData.name.trim().length < 3
    ? t.nameError
    : undefined;
  const schoolNameError = touched.schoolName && formData.schoolName.trim().length < 3
    ? t.schoolNameError
    : undefined;
  const regIdError = touched.regId && formData.regId.trim().length < 3 ? t.regIdError : undefined;
  const passwordError = touched.password && !passwordRequirements.slice(0, 4).every((rule) => rule.met)
    ? t.passwordError : undefined;
  const confirmPasswordError = touched.confirmPassword && (!formData.confirmPassword || formData.password !== formData.confirmPassword)
    ? t.confirmError : undefined;

  const canSubmit =
    formData.name.trim().length >= 3 &&
    EMAIL_PATTERN.test(formData.email) &&
    formData.schoolName.trim().length >= 3 &&
    formData.regId.trim().length >= 3 &&
    passwordRequirements.every((r) => r.met) &&
    formData.acceptedTerms;

  const handleStep1 = () => {
    setStep(2);
    setTypeGlance(null);
    // Give the identity code a value the moment the type is known, so step 2
    // never opens with an empty required field.
    if (!formData.regId) set('regId', generateRegId(type));
  };

  const handleTypeChange = (next: RegistrationType) => {
    setType(next);
    setTypeGlance(`[role=radiogroup] [data-option="${next}"]`);
    // The prefix encodes the kind of institution, so a switch has to re-issue
    // the code rather than leave an SC- id on a school group.
    if (formData.autoId) set('regId', generateRegId(next));
  };

  const handleAutoId = (auto: boolean) => {
    setFormData((prev) => ({
      ...prev,
      autoId: auto,
      regId: auto ? generateRegId(type) : '',
    }));
  };

  /** Step 3's heading takes focus as it appears, then the mascot glances at the envelope. */
  const sentHeadingRef = useCallback((node: HTMLHeadingElement | null) => {
    if (!node) return;
    node.focus();
    setSentShown(true);
  }, []);

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    setTouched({ name: true, email: true, schoolName: true, regId: true, password: true, confirmPassword: true });

    if (!canSubmit) {
      const firstProblem =
        formData.name.trim().length < 3 ? t.problemName
        : !EMAIL_PATTERN.test(formData.email) ? t.problemEmail
        : formData.schoolName.trim().length < 3 ? t.problemSchool
        : formData.regId.trim().length < 3 ? t.regIdError
        : !passwordRequirements.every((r) => r.met) ? t.passwordError
        : t.problemTerms;
      showError(firstProblem);
      const firstInvalidId =
        formData.name.trim().length < 3 ? "name"
        : !EMAIL_PATTERN.test(formData.email) ? "email"
        : formData.schoolName.trim().length < 3 ? "schoolName"
        : formData.regId.trim().length < 3 ? "regId"
        : !passwordRequirements.slice(0, 4).every((rule) => rule.met) ? "password"
        : formData.password !== formData.confirmPassword ? "confirmPassword"
        : "acceptedTerms";
      e.currentTarget.querySelector<HTMLElement>(`#${firstInvalidId}`)?.focus();
      return;
    }

    setLoading(true);
    try {
      const step1Res = await fetch("/api/auth/signup-step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.trim(),
          registrationType: type,
        }),
      });
      const step1 = await step1Res.json();
      if (!step1.success) throw new Error(step1.error || t.startFailed);

      const step2Res = await fetch("/api/auth/signup-step2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.trim(),
          fullName: formData.name.trim(),
          phone: fullPhone(dialCode, formData.phone),
          password: formData.password,
          schoolName: formData.schoolName.trim(),
          country: formData.country,
          regId: formData.regId.trim(),
        }),
      });
      const step2 = await step2Res.json();
      if (!step2.success) throw new Error(step2.error || t.registrationFailed);
      if (step2.warning) toast.warning(step2.warning, { duration: 15000 });

      // Login can prefill the address (this tab only, read once); the draft is done.
      stashAuthEmail(formData.email.trim());
      clearRegisterDraft();
      setStep(3);
    } catch (error) {
      // Server messages are shown as written; a network failure or a technical
      // one (an HTML error page, a JSON parse error) becomes plain words.
      const message = friendlyErrorMessage(error, t.registrationFailed);
      focusErrorPending.current = true;
      showError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const dialIso = dialPick ?? (WORLD_COUNTRIES.some(([iso]) => iso === countryIso) ? countryIso : "PK");
  const dialCode = dialCodeFor(dialIso);
  const panel = t.panel[type];
  const kicker = type === 'school_group' ? t.kickerGroup : t.kickerSingle;
  const email = formData.email.trim();
  const nextLines = [
    { icon: MailCheck, title: t.nextVerify },
    { icon: Building2, title: type === 'school_group' ? t.nextGroup : t.nextSingle },
    { icon: Users, title: t.nextInvite },
  ];
  const errorSignal = formError ? `${errorSeq}:${formError}` : null;
  const preview = {
    language,
    schoolName: formData.schoolName,
    regId: formData.regId,
    countryLabel: countryName(countryIso, language),
    currency: currencyForCountry(formData.country),
    kicker,
  };

  /**
   * One cover per step, keyed so each step turns a fresh page (its arrival
   * plays once). Step 1 pictures the chosen structure, step 2 previews the
   * letterhead being typed, step 3 seals the welcome letter.
   */
  const cover = step === 1 ? (
    <AuthCover
      key="cover-institution"
      eyebrow={t.eyebrow}
      heading={{ light: panel.headline, strong: panel.accent, as: "h1" }}
      body={panel.body}
      art={<CampusDiorama type={type} size="cover" />}
      footnote={panel.caption}
    />
  ) : step === 2 ? (
    <AuthCover
      key="cover-account"
      eyebrow={ac.preview.badge}
      heading={{ light: t.previewLight, strong: t.previewStrong, as: "h1" }}
      art={<InstitutionPreview variant="card" {...preview} />}
      footnote={t.regIdHint}
    />
  ) : (
    <AuthCover
      key="cover-verify"
      eyebrow={t.steps[2]}
      heading={{ light: t.sentLight, strong: t.sentStrong, as: "h1" }}
      art={<WaxSeal size={112} finish="wax" />}
      index={{ label: t.nextTitle, items: nextLines }}
    />
  );

  return (
    <AuthShell
      language={language}
      layout={step === 2 ? "split-wide" : "split"}
      srHeading={t.srHeading}
      cover={cover}
      topBar={<AuthTopBar languageId="register-language" label={ac.language} value={language} onChange={setLanguage} />}
      footer={<AuthColophon language={language} claims={["campuses", "encrypted", "human"]} />}
    >
      {step === 2 ? (
        /* Step 2 is the long one: the face and the progress rail share a row
           when the COLUMN has room (container query: at 1024–1100px the cover
           leaves the column under 600px, where a viewport breakpoint clipped
           the rail's last step), and stack otherwise so neither sets a minimum
           width above the column. The vw cap keeps the mark inside a phone at
           a 200% root font. */
        <div className="@container sk-enter mb-4 mt-4 lg:mt-1">
          <div className="flex flex-col items-center gap-4 @2xl:flex-row @2xl:gap-7">
            <AuthMascot size="min(1.85rem, 8vw)" rule={false} signals={{ error: errorSignal }} />
            <span aria-hidden className="hidden h-6 w-px shrink-0 bg-edge/50 @2xl:block" />
            <StepRail step={step} labels={t.steps} label={t.progress} stepOf={t.stepOf} className="mb-0 w-full flex-1" />
          </div>
        </div>
      ) : (
        <>
          <AuthMascot
            className="sk-enter mt-6"
            signals={{ glance: step === 3 ? (sentShown ? "[data-mascot-anchor=envelope]" : null) : typeGlance }}
          />
          <StepRail step={step} labels={t.steps} label={t.progress} stepOf={t.stepOf} className="mb-6 mt-7" />
        </>
      )}

      <AnimatePresence mode="wait">
        {/* ─── Step 1: Choose Type ─── */}
        {step === 1 && (
          <motion.div
            key="s1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="sk-panel sk-gradient-border p-6 shadow-xl sm:p-9"
          >
            <div className="mb-7 text-center">
              <h2 className="text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl">
                {t.setupTitle}
              </h2>
              <p className="mt-2 text-md leading-relaxed text-ink-muted">
                {t.setupIntro}
              </p>
            </div>

            <div className="space-y-3 mb-6" role="radiogroup" aria-label={t.institutionType} onKeyDown={(event) => {
              const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (!delta) return;
              event.preventDefault();
              const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
              const index = options.indexOf(document.activeElement as HTMLButtonElement);
              const next = options[(index + delta + options.length) % options.length];
              next?.focus();
              next?.click();
            }}>
              <TypeOption value="school_group" active={type === 'school_group'} onClick={() => handleTypeChange('school_group')} title={t.groupTitle} desc={t.groupDesc} />
              <TypeOption value="single_campus" active={type === 'single_campus'} onClick={() => handleTypeChange('single_campus')} title={t.singleTitle} desc={t.singleDesc} />
            </div>

            {/* What the chosen type means for the first sign-in; announced
                politely when the choice changes. */}
            <Alert tone="brand" live="polite" className="mb-5">
              {type === 'school_group' ? t.groupNote : t.singleNote}
            </Alert>

            <Button
              type="button"
              onClick={handleStep1}
              className="sk-nudge-trigger mt-1 min-h-12 w-full"
            >
              {t.continue}
              <span aria-hidden className="sk-nudge inline-flex">
                <ArrowRight className="size-4 rtl:rotate-180" />
              </span>
            </Button>

            <div className="mt-6 border-t border-border-subtle pt-5 text-center">
              <p className="text-sm text-ink-muted">
                {t.haveAccount}{" "}
                <Link href="/login" className="sk-link">
                  {t.logIn}
                </Link>
              </p>
            </div>
          </motion.div>
        )}

        {/* ─── Step 2: Account Details ─── */}
        {step === 2 && (
          <motion.div
            key="s2"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="sk-panel sk-gradient-border p-5 shadow-xl sm:p-7 lg:py-6"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="sk-eyebrow text-primary">{kicker}</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{t.createTitle}</h2>
              </div>
              <IconButton
                label={t.backToType}
                variant="secondary"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                <ChevronLeft aria-hidden className="rtl:rotate-180" />
              </IconButton>
            </div>

            {formError && (
              <Alert
                ref={errorRef}
                tone="danger"
                tabIndex={-1}
                title={formError}
                className="sk-shake mb-5"
              />
            )}

            {/* Four labelled groups laid out two-up once the card is wide
                enough (container query, so it keys off the card and not the
                viewport — the cover appearing at lg would otherwise trigger
                columns with no room for them). The pairing is deliberate: the
                two tall groups lead each row, so neither row is padded out by
                a short neighbour. */}
            <form className="@container" onSubmit={handleStep2Submit} aria-busy={loading} noValidate>
              <fieldset disabled={loading} className="min-w-0">
              <div className="grid items-start gap-5 @2xl:grid-cols-2 @2xl:gap-x-7 @min-[52rem]:grid-cols-3">

                <FieldGroup id="grp-your-details" icon={UserIcon} title={t.groupDetails} className="@min-[52rem]:row-span-2">
                  <div className="grid grid-cols-1 items-start gap-4 @md:grid-cols-2">
                    <InputField
                      id="name" label={t.fullName} placeholder={t.fullNamePlaceholder} required
                      autoComplete="name" error={nameError} autoCapitalize="words" enterKeyHint="next"
                      onBlur={() => markTouched('name')}
                      value={formData.name} onChange={(v) => set('name', v)} icon={UserIcon}
                    />
                    <div className="min-w-0">
                      <InputField
                        id="email" label={t.email} placeholder="you@school.edu.pk" required type="email"
                        autoComplete="email" error={emailError}
                        inputMode="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next"
                        onBlur={() => markTouched('email')}
                        value={formData.email} onChange={(v) => set('email', v)} icon={Mail}
                      />
                      {/* After the field, outside its description: a one-tap fix, never a submit. */}
                      <EmailTypoHint
                        language={language}
                        value={formData.email}
                        className="mt-1"
                        onApply={(fixed) => {
                          set('email', fixed);
                          requestAnimationFrame(() => document.getElementById("email")?.focus());
                        }}
                      />
                    </div>
                  </div>

                  <FormField name="phone" id="phone" label={t.phone} hint={t.phoneHint}>
                    <InputGroup>
                      <Phone aria-hidden data-field-affix="start" className="h-4 w-4 text-ink-subtle" />
                      <Select
                        aria-label={t.dialCode}
                        data-field-companion=""
                        value={dialIso}
                        onChange={(event) => setDialPick(event.target.value)}
                        className="sk-dial-code"
                      >
                        <optgroup label={t.popularCountries}>
                          {worldList.featured.map((c) => <option key={c.iso} value={c.iso}>{c.iso === dialIso ? `${c.iso} ${c.dial}` : `${c.iso} ${c.dial} · ${c.name}`}</option>)}
                        </optgroup>
                        <optgroup label={t.allCountries}>
                          {worldList.rest.map((c) => <option key={c.iso} value={c.iso}>{c.iso === dialIso ? `${c.iso} ${c.dial}` : `${c.iso} ${c.dial} · ${c.name}`}</option>)}
                        </optgroup>
                      </Select>
                      <Input
                        id="phone" type="tel" dir="ltr" autoComplete="tel-national" inputMode="tel" enterKeyHint="next"
                        placeholder={PHONE_PLACEHOLDER[dialCode] ?? "Phone number"}
                        value={formData.phone} onChange={(e) => set('phone', e.target.value)}
                      />
                    </InputGroup>
                  </FormField>
                </FieldGroup>

                {/* Institution identity. Previously the single-campus path
                    invented a name ("<your name> Academy") and a hidden ID,
                    which is not something a school can live with — both are
                    asked for here regardless of type. */}
                <FieldGroup id="grp-your-institution" icon={Building} title={t.groupInstitution} className="@min-[52rem]:row-span-2">
                  <InputField
                    id="schoolName"
                    label={type === 'school_group' ? t.groupName : t.schoolName}
                    placeholder={type === 'school_group' ? t.groupNamePlaceholder : t.schoolNamePlaceholder}
                    required error={schoolNameError} autoComplete="organization"
                    autoCapitalize="words" enterKeyHint="next"
                    onBlur={() => markTouched('schoolName')}
                    value={formData.schoolName} onChange={(v) => set('schoolName', v)}
                    icon={Building}
                  />
                  <FormField name="country" id="country" label={t.country} hint={fillText(t.countryHint, currencyForCountry(formData.country))}>
                    <Select
                      id="country"
                      value={countryIso}
                      onChange={(event) => { setCountryIso(event.target.value); set("country", billingCountry(event.target.value)); }}
                    >
                      <optgroup label={t.popularCountries}>
                        {worldList.featured.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
                      </optgroup>
                      <optgroup label={t.allCountries}>
                        {worldList.rest.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
                      </optgroup>
                    </Select>
                  </FormField>
                  <div className="space-y-1.5 rounded-2xl border border-border-subtle bg-surface-subtle p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                      <div className="flex min-w-0 items-center gap-1">
                        <Label htmlFor="regId">
                          {type === 'school_group' ? t.groupId : t.schoolId}
                          <span aria-hidden="true" className="ms-0.5 text-destructive">*</span>
                        </Label>
                        <InfoTip content={t.regIdTip} label={t.regIdTipLabel} className="-my-1" />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={formData.autoId ? "default" : "outline"}
                          onClick={() => handleAutoId(true)}
                          aria-pressed={formData.autoId}
                          className="min-w-11"
                        >
                          {t.auto}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={!formData.autoId ? "default" : "outline"}
                          onClick={() => handleAutoId(false)}
                          aria-pressed={!formData.autoId}
                          className="min-w-11"
                        >
                          {t.manual}
                        </Button>
                      </div>
                    </div>
                    <FormField name="regId" id="regId" required error={regIdError} hint={t.regIdHint}>
                    <InputGroup surfaceClassName="bg-white">
                      <Hash aria-hidden data-field-affix="start" className="h-4 w-4 text-primary/40" />
                      <Input
                        id="regId"
                        readOnly={formData.autoId}
                        value={formData.regId}
                        placeholder={type === 'school_group' ? "SKL-XXXX" : "SC-XXXX"}
                        onChange={e => set('regId', e.target.value.toUpperCase())}
                        onBlur={() => markTouched('regId')}
                        autoCapitalize="characters"
                        spellCheck={false}
                        className="font-semibold tracking-wide tabular-nums"
                      />
                      {formData.autoId && (
                        <Tooltip content={t.generateId} describe={false}>
                          <FieldAction data-field-affix="end"
                            type="button"
                            onClick={() => set('regId', generateRegId(type))}
                            aria-label={t.generateId}
                            className="text-ink-subtle"
                          >
                            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                          </FieldAction>
                        </Tooltip>
                      )}
                    </InputGroup>
                    </FormField>
                  </div>
                  {/* Below lg the cover (and its letterhead) is hidden, so the
                      preview prints here as one line instead. */}
                  <InstitutionPreview variant="strip" className="lg:hidden" {...preview} />
                </FieldGroup>

                <FieldGroup id="grp-security" icon={Lock} title={t.groupSecurity}>
                  <InputField
                    id="password" label={t.password} placeholder={t.passwordPlaceholder} required
                    revealLabels={[t.showPassword, t.hidePassword]}
                    autoComplete="new-password" enterKeyHint="next"
                    error={passwordError} onBlur={() => markTouched('password')}
                    descriptionId="registration-password-rules"
                    type={showPass ? "text" : "password"}
                    value={formData.password} onChange={(v) => set('password', v)} icon={Lock}
                    onToggleReveal={() => setShowPass((v) => !v)}
                    revealed={showPass}
                    onCapsChange={setCapsOn}
                  />
                  <InputField
                    id="confirmPassword" label={t.confirmPassword} placeholder={t.confirmPlaceholder} required
                    revealLabels={[t.showConfirm, t.hideConfirm]}
                    autoComplete="new-password" enterKeyHint="done"
                    error={confirmPasswordError} onBlur={() => markTouched('confirmPassword')}
                    descriptionId="registration-password-rules"
                    type={showConfirm ? "text" : "password"}
                    value={formData.confirmPassword} onChange={(v) => set('confirmPassword', v)} icon={ShieldCheck}
                    onToggleReveal={() => setShowConfirm((v) => !v)}
                    revealed={showConfirm}
                  />

                  {capsOn && (
                    <p role="status" className="sk-field-message flex items-center gap-1.5 px-1 text-xs font-semibold text-status-warning-text">
                      <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0" /> {t.capsLock}
                    </p>
                  )}
                </FieldGroup>

                {/* Sits beside the password fields rather than under them, so
                    the checklist is readable while the field is being typed
                    in instead of being pushed off the fold. */}
                <FieldGroup id="grp-password-strength" icon={ShieldCheck} title={t.groupStrength}>
                  <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                    <div className="flex items-center gap-3">
                      <Progress
                        value={strength.score}
                        max={5}
                        size="sm"
                        tone={strength.tone}
                        label={t.groupStrength}
                        valueText={strength.label || t.strengthEmpty}
                        className="flex-1"
                      />
                      <p aria-hidden className={`shrink-0 text-xs font-semibold ${strength.text}`}>
                        {strength.label || "—"}
                      </p>
                    </div>
                    <RequirementChecklist
                      id="registration-password-rules"
                      items={passwordRequirements}
                      metPrefix={`${t.ruleMet}: `}
                      unmetPrefix={`${t.ruleUnmet}: `}
                      columns="container"
                      size="xs"
                    />
                  </div>
                </FieldGroup>

                {/* Consent and the actions share the closing line — a full
                    row each was ~50px of height for one checkbox. */}
                <div className="flex flex-col gap-4 border-t border-border-subtle pt-4 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-6 @2xl:col-span-2 @min-[52rem]:col-span-3">
                  {/* Explicit consent. Required — a school signing up is agreeing
                      on behalf of its pupils' data, so it cannot be implied. */}
                  <label className="flex min-w-0 cursor-pointer items-start gap-2.5 px-1 select-none">
                    <Checkbox
                      id="acceptedTerms"
                      checked={formData.acceptedTerms}
                      onChange={(e) => set('acceptedTerms', e.target.checked)}
                      aria-invalid={(formError === t.problemTerms && !formData.acceptedTerms) || undefined}
                      className="mt-px"
                    />
                    <span className="text-sm leading-relaxed text-ink-muted">
                      {t.agreePrefix}{" "}
                      <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="sk-link">{t.privacyPolicy}</Link>
                      {" "}{t.and}{" "}
                      <Link href="/ai-governance" target="_blank" rel="noopener noreferrer" className="sk-link">{t.aiPolicy}</Link>
                      {t.agreeSuffix}
                    </span>
                  </label>
                  {/* The submit's 10rem basis lets it drop under Back when the
                      text is enlarged, instead of being squeezed until its label spills out. */}
                  <div className="flex shrink-0 flex-wrap gap-3">
                    <IconButton
                      label={t.back}
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="h-12 w-12 min-h-12 min-w-12"
                    >
                      <ChevronLeft aria-hidden className="rtl:rotate-180" />
                    </IconButton>
                    <Button
                      type="submit"
                      loading={loading}
                      className="sk-nudge-trigger min-h-12 flex-1 basis-40 @xl:flex-none @xl:w-52"
                    >
                      {loading
                        ? t.creating
                        : <>
                            {t.create}
                            <span aria-hidden className="sk-nudge inline-flex">
                              <ArrowRight className="size-4 rtl:rotate-180" />
                            </span>
                          </>}
                    </Button>
                  </div>
                </div>
              </div>
              </fieldset>
            </form>
          </motion.div>
        )}

        {/* ─── Step 3: Check your email ─── */}
        {step === 3 && (
          <motion.div
            key="s3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="sk-panel sk-gradient-border p-6 text-center shadow-xl sm:p-9"
          >
            <SealedEnvelope size="md" className="mx-auto" />
            <h2
              ref={sentHeadingRef}
              tabIndex={-1}
              className="mt-5 text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl"
            >
              {t.createdTitle}
            </h2>

            {/* The address lives only in the plate; the cover and envelope never print it. */}
            <div className="mt-6">
              <MailHandoff
                language={language}
                email={email}
                kind="verify"
                intro={(
                  <p className="text-sm leading-relaxed text-ink-muted">
                    {fillNodes(t.sentBody, <bdi className="font-semibold text-ink-strong">{formData.schoolName.trim()}</bdi>)}
                  </p>
                )}
                action={<VerificationResend language={language} email={email} />}
              />
            </div>

            {/* What actually happens next, so the wait is not a black box. At
                lg+ the cover's index already lists these three lines (with
                icons), so the card does not print them a second time. */}
            <section aria-labelledby="register-next-title" className="mt-7 rounded-3xl border border-border-subtle bg-surface-subtle p-5 text-start lg:hidden">
              <h3 id="register-next-title" className="sk-eyebrow mb-4 text-primary">{t.nextTitle}</h3>
              <ol className="sk-stagger">
                {nextLines.map(({ title }, i) => (
                  <li key={title} className="relative flex items-start gap-3 pb-4 last:pb-0">
                    {i < nextLines.length - 1 && (
                      <span aria-hidden className="absolute bottom-0 start-3 top-6 w-px -translate-x-1/2 bg-edge/40 rtl:translate-x-1/2" />
                    )}
                    <span
                      aria-hidden
                      className={`relative grid size-6 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums shadow-sm ${
                        i === 0 ? "bg-primary text-white" : "bg-white text-primary ring-1 ring-border-subtle"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 pt-0.5 text-sm font-medium text-ink">{title}</span>
                  </li>
                ))}
              </ol>
            </section>

            <Link href="/login" className={buttonVariants({ className: "sk-nudge-trigger mt-7 min-h-12 w-full" })}>
              {t.goToLogin}
              <span aria-hidden className="sk-nudge inline-flex">
                <ArrowRight className="size-4 rtl:rotate-180" />
              </span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}

/** Three-stop progress rail above the card, so the flow's length is visible. */
function StepRail({ step, labels, label: railLabel, stepOf, className = "mb-6" }: { step: number; labels: string[]; label: string; stepOf: string; className?: string }) {
  return (
    <div role="list" aria-label={railLabel} className={`flex items-center gap-2 px-1 ${className}`}>
      {labels.map((label, i) => {
        const num = i + 1;
        const done = step > num;
        const active = step === num;
        return (
          <React.Fragment key={i}>
            <div role="listitem" aria-current={active ? "step" : undefined} aria-label={fillText(stepOf, num, labels.length, label)} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-2xs font-bold tabular-nums transition-all duration-300 ${
                  done
                    ? "bg-status-success-text text-white"
                    : active
                    ? "bg-gradient-to-br from-primary to-brand-400 text-white shadow-md shadow-primary/25"
                    : "bg-edge/25 text-ink-subtle"
                }`}
              >
                {done ? <Check aria-hidden className="h-3 w-3" strokeWidth={3.5} /> : num}
              </span>
              <span
                className={`hidden text-2xs font-semibold uppercase tracking-wider transition-colors sm:block ${
                  active ? "text-ink-strong" : done ? "text-status-success-text" : "text-ink-subtle"
                }`}
              >
                {label}
              </span>
            </div>
            {num < labels.length && (
              <span aria-hidden className="h-px min-w-3 flex-1 rounded-full bg-edge/30">
                <span
                  className={`block h-px rounded-full bg-gradient-to-r from-primary to-status-success-text transition-all duration-500 rtl:bg-gradient-to-l ${
                    done ? "w-full" : "w-0"
                  }`}
                />
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * A titled block of related fields. Two-up, a bare 2x2 grid of inputs reads as
 * noise, so each half announces what it is asking for. Its own `@container` lets
 * the fields inside react to the column width rather than the whole card's — a
 * name/email pair splits when the group is full-width and stacks when it is a
 * column.
 */
function FieldGroup({
  id: headingId,
  icon: Icon,
  title,
  className,
  children,
}: {
  className?: string;
  /** Explicit, language-independent heading id (a title-derived id collapses for Arabic/Urdu). */
  id: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  // The heading is only a visual cue unless it names the group, and side-by-side
  // columns are exactly where a screen reader loses the thread.
  return (
    <section role="group" aria-labelledby={headingId} className={`@container space-y-4 ${className ?? ""}`}>
      <div className="flex items-center gap-2 px-1">
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-lg bg-brand-50 text-primary ring-1 ring-brand-100">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 id={headingId} className="min-w-0 text-sm font-bold text-ink-strong">{title}</h3>
      </div>
      {children}
    </section>
  );
}

/** One institution-type radio. Its tile draws the structure itself: three sealed campuses, or one. */
function TypeOption({ value, active, onClick, title, desc }: TypeOptionProps) {
  return (
    <Button variant="choice"
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      data-option={value}
      className="relative group flex w-full items-center justify-start gap-4 overflow-hidden p-4 text-start sm:gap-5 sm:p-5"
    >
      {/* Spans, not div/h3/p: a button may only hold phrasing content. */}
      <span aria-hidden className={`grid shrink-0 place-items-center rounded-2xl p-1.5 transition-all duration-200 group-hover:scale-105 ${active ? 'bg-gradient-to-br from-primary to-brand-400 text-white shadow-lg shadow-primary/20' : 'bg-white text-ink-subtle shadow-xs group-hover:bg-primary/5 group-hover:text-primary'}`}>
        <CampusDiorama type={value} size="glyph" className="size-11" />
      </span>
      {/* Only the title keeps clear of the check badge; the description runs
          the full width under it, so it does not break with a one-word orphan. */}
      <span className="block min-w-0 flex-1">
        <span className="block pe-6 text-start text-sm font-bold text-ink-strong">{title}</span>
        <span className="mt-1 block text-start text-xs font-normal leading-snug text-pretty text-ink-muted">{desc}</span>
      </span>
      {active && (
        <motion.span aria-hidden initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute end-4 top-4 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-primary p-1 text-white shadow-md">
          <CheckCircle className="h-3 w-3" />
        </motion.span>
      )}
    </Button>
  );
}

function InputField({
  id, label, placeholder, value, onChange, icon: Icon, type = "text", className = "",
  required, autoComplete, error, hint, descriptionId, onBlur, onToggleReveal, revealed, onCapsChange, revealLabels,
  inputMode, autoCapitalize, spellCheck, enterKeyHint,
}: InputFieldProps & {
  onToggleReveal?: () => void;
  revealed?: boolean;
  onCapsChange?: (on: boolean) => void;
  /** [show, hide] accessible names for the reveal action. */
  revealLabels?: [string, string];
}) {
  const trackCaps = onCapsChange
    ? (e: React.KeyboardEvent<HTMLInputElement>) => onCapsChange(e.getModifierState?.("CapsLock") ?? false)
    : undefined;
  const revealLabel = revealLabels ? revealLabels[revealed ? 1 : 0] : `${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`;

  return (
    <FormField name={id} id={id} label={label} required={required} error={error} hint={hint}>
      <InputGroup>
        <Icon aria-hidden data-field-affix="start" className="h-4 w-4 text-ink-subtle group-focus-within:text-primary" />
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          spellCheck={spellCheck}
          enterKeyHint={enterKeyHint}
          aria-describedby={descriptionId}
          onChange={e => onChange(e.target.value)}
          onKeyUp={trackCaps}
          onKeyDown={trackCaps}
          onBlur={() => { onBlur?.(); onCapsChange?.(false); }}
          className={className}
        />
        {onToggleReveal && (
          <Tooltip content={revealLabel} describe={false}>
            <FieldAction data-field-affix="end"
              type="button"
              onClick={onToggleReveal}
              aria-label={revealLabel}
              aria-controls={id}
              aria-pressed={Boolean(revealed)}
              className="text-ink-subtle"
            >
              {revealed ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
            </FieldAction>
          </Tooltip>
        )}
      </InputGroup>
    </FormField>
  );
}
