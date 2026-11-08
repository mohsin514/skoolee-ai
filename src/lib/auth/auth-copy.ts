/**
 * Copy shared by every auth screen (splash, login, register, forgot password,
 * email verified). Pages keep their own page-specific strings and read the
 * shared ones from here, so a claim or a policy label can never drift
 * between screens.
 *
 * Truthfulness: every claim below is provable today. Link lifetimes mirror
 * src/lib/auth/link-expiry.ts. No sender name, counts or "live" data.
 *
 * All Arabic and Urdu strings need native-speaker review before release.
 * No class names live here (the login fixture builds Tailwind from components only).
 */
import type { Language } from "@/lib/locale/package";
import type { GreetingBucket } from "./greeting";

export type AuthClaimId = "campuses" | "encrypted" | "human" | "languages" | "singleUse" | "resetExpiry";
export type AuthClaimCopy = { title: string; short: string; body?: string };

export type AuthCopy = {
  language: string;
  policies: string;
  privacy: string;
  security: string;
  aiGovernance: string;
  trustLabel: string;
  claims: Record<AuthClaimId, AuthClaimCopy>;
  greeting: Record<GreetingBucket, string>;
  mail: {
    sentTo: string; requestedFor: string; openInbox: string;
    gmail: string; outlook: string; microsoft365: string; yahoo: string; icloud: string;
    newTab: string; customDomain: string; lookFor: string; retryBy: string;
    helpTitle: string; tipSpam: string; tipSearch: string; tipFilters: string;
    tipResetExpiry: string; tipVerifyExpiry: string; useDifferent: string;
  };
  resend: { send: string; sending: string; sent: string; wait: string; failed: string };
  typo: { didYouMean: string };
  preview: { badge: string; placeholder: string; idLabel: string; countryLabel: string; printsAs: string };
};

/**
 * Each right-to-left name is wrapped in FSI … PDI (U+2068 … U+2069). Without the
 * isolates, an LTR page's bidi algorithm merges "العربية · اردو" into one RTL run
 * and English readers see Urdu before Arabic; isolated, the logical order holds
 * in both directions and matches the language select.
 */
const LANGUAGES_TITLE = "English · \u2068العربية\u2069 · \u2068اردو\u2069";
const LANGUAGES_SHORT = "EN · \u2068عربي\u2069 · \u2068اردو\u2069";

export const authCopy: Record<Language, AuthCopy> = {
  en: {
    language: "Language",
    policies: "Policies",
    privacy: "Privacy",
    security: "Security",
    aiGovernance: "AI Governance",
    trustLabel: "What you can count on",
    claims: {
      campuses: { title: "Multi-campus by design", body: "One login for the whole group. Each campus stays sealed from the others.", short: "Multi-campus" },
      encrypted: { title: "Encrypted at rest & in transit", short: "Encrypted" },
      human: { title: "Human-reviewed AI", body: "AI drafts. Your staff approve.", short: "Human-reviewed AI" },
      languages: { title: LANGUAGES_TITLE, body: "Works in English, Arabic and Urdu.", short: LANGUAGES_SHORT },
      singleUse: { title: "Single-use recovery links", body: "Each link works once.", short: "Single-use links" },
      resetExpiry: { title: "Links expire after 1 hour", short: "1-hour links" },
    },
    greeting: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", late: "Working late?" },
    mail: {
      sentTo: "Sent to",
      requestedFor: "Requested for",
      openInbox: "Open your inbox",
      gmail: "Open Gmail",
      outlook: "Open Outlook",
      microsoft365: "Open Outlook (work or school)",
      yahoo: "Open Yahoo Mail",
      icloud: "Open iCloud Mail",
      newTab: "(opens in a new tab)",
      customDomain: "Most school mail runs on one of these.",
      lookFor: "Subject to look for: {0}",
      retryBy: "Mail can take a few minutes. If nothing arrives by {0}, try again.",
      helpTitle: "Didn't arrive?",
      tipSpam: "Look in Spam, Junk or Promotions.",
      tipSearch: "Search your mail for “SkooleeAI”.",
      tipFilters: "School mail filters can hold outside messages. Ask your IT team to allow SkooleeAI.",
      tipResetExpiry: "Each link works once and expires after 1 hour.",
      tipVerifyExpiry: "Verification links last 24 hours.",
      useDifferent: "Use a different email",
    },
    resend: {
      send: "Send a new verification link",
      sending: "Sending…",
      sent: "If an account at this address is waiting for verification, a new link is on its way.",
      wait: "You can send another in {0}s",
      failed: "Couldn't send a new link. Try again in a moment.",
    },
    typo: { didYouMean: "Did you mean {0}?" },
    preview: { badge: "Preview", placeholder: "Your school name", idLabel: "Institution ID", countryLabel: "Country", printsAs: "Prints as: {0}" },
  },
  ar: {
    language: "اللغة",
    policies: "السياسات",
    privacy: "الخصوصية",
    security: "الأمان",
    aiGovernance: "حوكمة الذكاء الاصطناعي",
    trustLabel: "ما يمكنك الاعتماد عليه",
    claims: {
      campuses: { title: "متعدد الفروع بالتصميم", body: "تسجيل دخول واحد للمجموعة كلها. يبقى كل فرع معزولاً عن الآخرين.", short: "متعدد الفروع" },
      encrypted: { title: "مشفّر أثناء التخزين والنقل", short: "مشفّر" },
      human: { title: "ذكاء اصطناعي يراجعه البشر", body: "الذكاء الاصطناعي يقترح، وفريقك يعتمد.", short: "ذكاء اصطناعي يراجعه البشر" },
      languages: { title: LANGUAGES_TITLE, body: "يعمل بالإنجليزية والعربية والأردية.", short: LANGUAGES_SHORT },
      singleUse: { title: "روابط استعادة لاستخدام واحد", body: "يعمل كل رابط مرة واحدة فقط.", short: "روابط لاستخدام واحد" },
      resetExpiry: { title: "تنتهي صلاحية الروابط بعد ساعة", short: "روابط صالحة لساعة" },
    },
    greeting: { morning: "صباح الخير", afternoon: "طاب يومك", evening: "مساء الخير", late: "تعمل حتى وقت متأخر؟" },
    mail: {
      sentTo: "أُرسل إلى",
      requestedFor: "طُلب من أجل",
      openInbox: "افتح بريدك",
      gmail: "افتح Gmail",
      outlook: "افتح Outlook",
      microsoft365: "افتح Outlook (العمل أو المدرسة)",
      yahoo: "افتح Yahoo Mail",
      icloud: "افتح iCloud Mail",
      newTab: "(يفتح في علامة تبويب جديدة)",
      customDomain: "يعمل بريد معظم المدارس على إحدى هاتين الخدمتين.",
      lookFor: "العنوان الذي تبحث عنه: {0}",
      retryBy: "قد يستغرق وصول البريد بضع دقائق. إذا لم يصل شيء بحلول {0}، فحاول مجدداً.",
      helpTitle: "لم تصلك الرسالة؟",
      tipSpam: "تحقّق من مجلدات البريد غير المرغوب فيه والعروض الترويجية.",
      tipSearch: "ابحث في بريدك عن “SkooleeAI”.",
      tipFilters: "قد تحتجز مرشحات بريد المدرسة الرسائل الخارجية. اطلب من فريق تقنية المعلومات السماح برسائل SkooleeAI.",
      tipResetExpiry: "يعمل كل رابط مرة واحدة وتنتهي صلاحيته بعد ساعة.",
      tipVerifyExpiry: "تبقى روابط التحقق صالحة لمدة 24 ساعة.",
      useDifferent: "استخدم بريداً إلكترونياً آخر",
    },
    resend: {
      send: "أرسل رابط تحقق جديداً",
      sending: "جارٍ الإرسال…",
      sent: "إذا كان هناك حساب بهذا العنوان بانتظار التحقق، فرابط جديد في طريقه إليك.",
      wait: "يمكنك إرسال رابط آخر بعد {0} ث",
      failed: "تعذّر إرسال رابط جديد. حاول مجدداً بعد قليل.",
    },
    typo: { didYouMean: "هل تقصد {0}؟" },
    preview: { badge: "معاينة", placeholder: "اسم مدرستك", idLabel: "معرّف المؤسسة", countryLabel: "الدولة", printsAs: "يُطبع هكذا: {0}" },
  },
  ur: {
    language: "زبان",
    policies: "پالیسیاں",
    privacy: "رازداری",
    security: "سیکیورٹی",
    aiGovernance: "اے آئی گورننس",
    trustLabel: "جن باتوں پر آپ بھروسا کر سکتے ہیں",
    claims: {
      campuses: { title: "ملٹی کیمپس کے لیے بنایا گیا", body: "پورے گروپ کے لیے ایک لاگ اِن۔ ہر کیمپس دوسروں سے الگ اور محفوظ رہتا ہے۔", short: "ملٹی کیمپس" },
      encrypted: { title: "محفوظ شدہ اور منتقلی کے دوران خفیہ کردہ", short: "خفیہ کردہ" },
      human: { title: "انسانوں کا جائزہ لیا ہوا اے آئی", body: "اے آئی مسودہ بناتا ہے، آپ کا عملہ منظور کرتا ہے۔", short: "انسانوں کا جائزہ لیا ہوا اے آئی" },
      languages: { title: LANGUAGES_TITLE, body: "انگریزی، عربی اور اردو میں دستیاب۔", short: LANGUAGES_SHORT },
      singleUse: { title: "ایک بار استعمال ہونے والے بحالی لنک", body: "ہر لنک صرف ایک بار کام کرتا ہے۔", short: "ایک بار والے لنک" },
      resetExpiry: { title: "لنک ایک گھنٹے بعد ختم ہو جاتے ہیں", short: "ایک گھنٹے کے لنک" },
    },
    greeting: { morning: "صبح بخیر", afternoon: "سہ پہر بخیر", evening: "شام بخیر", late: "آج دیر تک کام؟" },
    mail: {
      sentTo: "بھیجا گیا",
      requestedFor: "درخواست برائے",
      openInbox: "اپنا اِن باکس کھولیں",
      gmail: "Gmail کھولیں",
      outlook: "Outlook کھولیں",
      microsoft365: "Outlook کھولیں (دفتر یا اسکول)",
      yahoo: "Yahoo Mail کھولیں",
      icloud: "iCloud Mail کھولیں",
      newTab: "(نئے ٹیب میں کھلتا ہے)",
      customDomain: "زیادہ تر اسکولوں کی ای میل انہی میں سے کسی ایک پر چلتی ہے۔",
      lookFor: "تلاش کرنے کے لیے عنوان: {0}",
      retryBy: "ای میل آنے میں چند منٹ لگ سکتے ہیں۔ اگر {0} تک کچھ نہ آئے تو دوبارہ کوشش کریں۔",
      helpTitle: "ای میل نہیں ملی؟",
      tipSpam: "اسپام، جنک یا پروموشنز فولڈر دیکھیں۔",
      tipSearch: "اپنی ای میل میں “SkooleeAI” تلاش کریں۔",
      tipFilters: "اسکول کے ای میل فلٹر باہر سے آنے والی ای میلز روک سکتے ہیں۔ اپنی آئی ٹی ٹیم سے SkooleeAI کی ای میلز کی اجازت دینے کو کہیں۔",
      tipResetExpiry: "ہر لنک ایک بار کام کرتا ہے اور ایک گھنٹے بعد ختم ہو جاتا ہے۔",
      tipVerifyExpiry: "تصدیقی لنک 24 گھنٹے تک کارآمد رہتے ہیں۔",
      useDifferent: "دوسری ای میل استعمال کریں",
    },
    resend: {
      send: "نیا تصدیقی لنک بھیجیں",
      sending: "بھیجا جا رہا ہے…",
      sent: "اگر اس پتے پر کوئی اکاؤنٹ تصدیق کا منتظر ہے تو نیا لنک بھیج دیا گیا ہے۔",
      wait: "{0} سیکنڈ بعد دوسرا لنک بھیج سکیں گے",
      failed: "نیا لنک نہیں بھیجا جا سکا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔",
    },
    typo: { didYouMean: "کیا آپ کا مطلب {0} تھا؟" },
    preview: { badge: "پیش منظر", placeholder: "آپ کے اسکول کا نام", idLabel: "ادارے کی شناخت", countryLabel: "ملک", printsAs: "یوں چھپے گا: {0}" },
  },
};
