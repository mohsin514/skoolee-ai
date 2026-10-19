/** Shared by delivery and inbox guidance so translated subjects stay in sync. */
export type AuthEmailLanguage = "en" | "ar" | "ur";
export function authEmailLanguage(value?: string | null): AuthEmailLanguage {
  const code = value?.slice(0, 2).toLowerCase();
  return code === "ar" || code === "ur" ? code : "en";
}
export const authEmailCopy = {
  en: {
    verify: {
      subject: "Verify your SkooleeAI Account", eyebrow: "Account setup", title: "Welcome to SkooleeAI", action: "Verify email address",
      body: "Please verify your email address to complete registration and access your school dashboard.",
      note: "This link works for 24 hours. If you did not create a SkooleeAI account, you can safely ignore this email.",
    },
    reset: {
      subject: "Reset your SkooleeAI Password", eyebrow: "Account security", title: "Reset your password", action: "Choose a new password",
      body: "We received a request to reset your SkooleeAI password. Use the button below to choose a new password.",
      note: "This single-use link expires in 1 hour. If you did not ask to reset your password, your account is still safe and you can ignore this email.",
    },
  },
  ar: {
    verify: {
      subject: "تأكيد حسابك في SkooleeAI", eyebrow: "إعداد الحساب", title: "مرحبًا بك في SkooleeAI", action: "تأكيد البريد الإلكتروني",
      body: "يرجى تأكيد عنوان بريدك الإلكتروني لإكمال التسجيل والوصول إلى لوحة إدارة مدرستك.",
      note: "هذا الرابط صالح لمدة 24 ساعة. إذا لم تنشئ حسابًا في SkooleeAI، يمكنك تجاهل هذه الرسالة بأمان.",
    },
    reset: {
      subject: "إعادة تعيين كلمة مرور SkooleeAI", eyebrow: "أمان الحساب", title: "إعادة تعيين كلمة المرور", action: "اختيار كلمة مرور جديدة",
      body: "تلقينا طلبًا لإعادة تعيين كلمة مرور حسابك في SkooleeAI. استخدم الزر أدناه لاختيار كلمة مرور جديدة.",
      note: "تنتهي صلاحية هذا الرابط بعد ساعة واحدة ويُستخدم مرة واحدة فقط. إذا لم تطلب إعادة تعيين كلمة المرور، فحسابك آمن ويمكنك تجاهل هذه الرسالة.",
    },
  },
  ur: {
    verify: {
      subject: "اپنے SkooleeAI اکاؤنٹ کی تصدیق کریں", eyebrow: "اکاؤنٹ سیٹ اپ", title: "SkooleeAI میں خوش آمدید", action: "ای میل کی تصدیق کریں",
      body: "رجسٹریشن مکمل کرنے اور اپنے اسکول کے ڈیش بورڈ تک رسائی کے لیے اپنے ای میل پتے کی تصدیق کریں۔",
      note: "یہ لنک 24 گھنٹے تک کارآمد ہے۔ اگر آپ نے SkooleeAI اکاؤنٹ نہیں بنایا تو اس ای میل کو نظر انداز کر سکتے ہیں۔",
    },
    reset: {
      subject: "اپنا SkooleeAI پاس ورڈ دوبارہ ترتیب دیں", eyebrow: "اکاؤنٹ کی حفاظت", title: "پاس ورڈ دوبارہ ترتیب دیں", action: "نیا پاس ورڈ منتخب کریں",
      body: "ہمیں آپ کے SkooleeAI پاس ورڈ کو دوبارہ ترتیب دینے کی درخواست موصول ہوئی ہے۔ نیا پاس ورڈ منتخب کرنے کے لیے نیچے دیا گیا بٹن استعمال کریں۔",
      note: "یہ لنک صرف ایک بار استعمال ہو سکتا ہے اور ایک گھنٹے بعد ختم ہو جائے گا۔ اگر آپ نے پاس ورڈ کی تبدیلی کی درخواست نہیں کی تو آپ کا اکاؤنٹ محفوظ ہے اور آپ اس ای میل کو نظر انداز کر سکتے ہیں۔",
    },
  },
} as const;
