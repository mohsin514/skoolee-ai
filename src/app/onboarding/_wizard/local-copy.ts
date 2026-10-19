/** Wizard strings that the shared setup copy does not carry yet (English, Arabic, Urdu). */
export const LOCAL_COPY = {
  en: {
    loadFailedTitle: "Setup could not be loaded",
    noCampusesHint: "Use the form to add your first campus. Each campus is saved as soon as you add it.",
    sessionStartHint: "Leave empty to start the session on the day you activate setup.",
    contactEmailHint: "Set when the institution was registered. It cannot be changed here.",
    logoUploadFailed: "The logo could not be uploaded. Check your connection and try again.",
  },
  ar: {
    loadFailedTitle: "تعذر تحميل الإعداد",
    noCampusesHint: "استخدم النموذج لإضافة أول فرع. يُحفظ كل فرع فور إضافته.",
    sessionStartHint: "اتركه فارغًا لتبدأ الجلسة يوم تفعيل الإعداد.",
    contactEmailHint: "حُدد عند تسجيل المؤسسة ولا يمكن تغييره هنا.",
    logoUploadFailed: "تعذر رفع الشعار. تحقق من اتصالك وحاول مرة أخرى.",
  },
  ur: {
    loadFailedTitle: "سیٹ اپ لوڈ نہیں ہو سکا",
    noCampusesHint: "پہلا کیمپس شامل کرنے کے لیے فارم استعمال کریں۔ ہر کیمپس شامل کرتے ہی محفوظ ہو جاتا ہے۔",
    sessionStartHint: "خالی چھوڑ دیں تو سیشن سیٹ اپ فعال کرنے کے دن سے شروع ہو گا۔",
    contactEmailHint: "یہ ادارے کی رجسٹریشن کے وقت طے ہوا تھا اور یہاں تبدیل نہیں ہو سکتا۔",
    logoUploadFailed: "لوگو اپ لوڈ نہیں ہو سکا۔ اپنا کنکشن چیک کریں اور دوبارہ کوشش کریں۔",
  },
} as const;

export type LocalCopy = (typeof LOCAL_COPY)[keyof typeof LOCAL_COPY];

export function localCopy(language: string | null | undefined): LocalCopy {
  const code = (language || "en").slice(0, 2).toLowerCase();
  return LOCAL_COPY[code === "ar" ? "ar" : code === "ur" ? "ur" : "en"];
}
