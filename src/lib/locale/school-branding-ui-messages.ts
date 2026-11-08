/** SKAI-114 school identity and branding copy: [English, Arabic, Urdu]. Reviewed catalogs win for shared words. */
export const schoolBrandingUiEntries: readonly (readonly [string, string, string])[] = [
  ["Official name (Urdu)", "الاسم الرسمي (بالأردية)", "سرکاری نام (اردو)"],
  ["Official name (Arabic)", "الاسم الرسمي (بالعربية)", "سرکاری نام (عربی)"],
  ["Short name", "الاسم المختصر", "مختصر نام"],
  ["e.g. HA", "مثال: HA", "مثلاً HA"],
  ["Brand colour", "لون الهوية", "برانڈ کا رنگ"],
  ["Default", "افتراضي", "طے شدہ"],
  ["Plum", "برقوقي", "آلو بخارا"],
  ["Indigo", "نيلي داكن", "نیل"],
  ["Blue", "أزرق", "نیلا"],
  ["Teal", "أزرق مخضر", "فیروزی"],
  ["Green", "أخضر", "سبز"],
  ["Maroon", "عنابي", "عنابی"],
  ["Bronze", "برونزي", "کانسی"],
  ["Slate", "رمادي داكن", "سلیٹی"],
  ["Used on report cards, receipts and PDF headers. Every colour keeps text readable.", "يظهر في بطاقات التقارير والإيصالات وترويسات ملفات PDF. كل الألوان تُبقي النص واضحًا.", "رپورٹ کارڈ، رسیدوں اور PDF سرخیوں میں استعمال ہوتا ہے۔ ہر رنگ میں تحریر واضح رہتی ہے۔"],
  ["Urdu name must be written in Arabic script.", "يجب كتابة الاسم بالأردية بالحروف العربية.", "اردو نام عربی رسم الخط میں لکھیں۔"],
  ["Arabic name must be written in Arabic script.", "يجب كتابة الاسم العربي بالحروف العربية.", "عربی نام عربی رسم الخط میں لکھیں۔"],
  ["Urdu name must be 120 characters or fewer.", "يجب ألا يتجاوز الاسم بالأردية 120 حرفًا.", "اردو نام 120 حروف سے زیادہ نہ ہو۔"],
  ["Arabic name must be 120 characters or fewer.", "يجب ألا يتجاوز الاسم العربي 120 حرفًا.", "عربی نام 120 حروف سے زیادہ نہ ہو۔"],
  ["Short name must be 2 to 24 characters.", "يجب أن يتكون الاسم المختصر من 2 إلى 24 حرفًا.", "مختصر نام 2 سے 24 حروف کا ہو۔"],
  ["Choose a brand colour from the palette.", "اختر لون الهوية من اللوحة.", "رنگوں کی فہرست سے برانڈ کا رنگ منتخب کریں۔"],
];

export const arabicSchoolBrandingUi: Record<string, string> = Object.fromEntries(schoolBrandingUiEntries.map(([en, ar]) => [en, ar]));
export const urduSchoolBrandingUi: Record<string, string> = Object.fromEntries(schoolBrandingUiEntries.map(([en, , ur]) => [en, ur]));
