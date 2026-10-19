/** Wizard strings that the shared setup copy does not carry yet (English, Arabic, Urdu). */
export const LOCAL_COPY = {
  en: {
    saveFailedLabel: "Not saved",
    saveFailed: "Changes could not be saved. Check your connection and try again.",
    deleteFailed: "The campus could not be deleted. It is still in your list. Try again.",
    loadFailedTitle: "Setup could not be loaded",
    noCampusesHint: "Use the form to add your first campus. Each campus is saved as soon as you add it.",
    sessionStartHint: "Leave empty to start the session on the day you activate setup.",
    contactEmailHint: "Set when the institution was registered. It cannot be changed here.",
    logoUploadFailed: "The logo could not be uploaded. Check your connection and try again.",
  },
  ar: {
    saveFailedLabel: "لم يُحفظ",
    saveFailed: "تعذر حفظ التغييرات. تحقق من اتصالك وحاول مرة أخرى.",
    deleteFailed: "تعذر حذف الفرع. لا يزال في قائمتك. حاول مرة أخرى.",
    loadFailedTitle: "تعذر تحميل الإعداد",
    noCampusesHint: "استخدم النموذج لإضافة أول فرع. يُحفظ كل فرع فور إضافته.",
    sessionStartHint: "اتركه فارغًا لتبدأ الجلسة يوم تفعيل الإعداد.",
    contactEmailHint: "حُدد عند تسجيل المؤسسة ولا يمكن تغييره هنا.",
    logoUploadFailed: "تعذر رفع الشعار. تحقق من اتصالك وحاول مرة أخرى.",
  },
  ur: {
    saveFailedLabel: "محفوظ نہیں ہوا",
    saveFailed: "تبدیلیاں محفوظ نہیں ہو سکیں۔ اپنا کنکشن چیک کریں اور دوبارہ کوشش کریں۔",
    deleteFailed: "کیمپس حذف نہیں ہو سکا۔ یہ اب بھی آپ کی فہرست میں ہے۔ دوبارہ کوشش کریں۔",
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
