import type { Language } from "@/lib/locale/package";
import type { StudioCopyArea } from "./exam-studio-copy";

// SKO-408 R19, task 24.3: evidence pack panel copy. Placeholders are {0}, {1}…; each value is a
// whole phrase in its own language.
const en = {
  title: "Evidence pack",
  intro: "One export with the full record chain of this assessment and a manifest anyone can verify with standard tools. Answer keys and capture recordings stay out unless you include them and hold the right to read them.",
  scopeAssessment: "Whole assessment",
  includeKeys: "Include answer keys and rubrics",
  includeCapture: "Include capture recording references",
  captureReason: "Reason for including recordings",
  captureReasonHint: "Recorded with your name and the time. At least ten characters.",
  produce: "Produce evidence pack",
  producing: "Producing…",
  produced: "Evidence pack produced: {0} files, {1} records.",
  none: "No evidence pack has been produced for this assessment yet.",
  listTitle: "Produced packs",
  filesCount: "{0} files",
  recordsCount: "{0} records",
  gapsCount: "{0} missing records named in the manifest",
  noGaps: "Complete chain",
  withKeys: "Includes answer keys",
  withCapture: "Includes recording references",
  producedAt: "Produced {0}",
  downloadedAt: "Last downloaded {0}",
  download: "Download ZIP",
  verifyHint: "Verify a download by unzipping it and comparing each file's SHA-256 with {0}, for example using {1}.",
  failed: "Producing the evidence pack failed. Try again.",
};
type EvidenceCopy = typeof en;
const ar: EvidenceCopy = {
  title: "حزمة الأدلة",
  intro: "تصدير واحد يضم سلسلة السجلات الكاملة لهذا التقييم مع بيان يمكن لأي شخص التحقق منه بأدوات قياسية. تبقى مفاتيح الإجابة وتسجيلات المراقبة خارجه ما لم تُضمّنها وتكن مخوّلًا بذلك.",
  scopeAssessment: "التقييم كاملًا",
  includeKeys: "تضمين مفاتيح الإجابة وسلالم التقدير",
  includeCapture: "تضمين مراجع تسجيلات المراقبة",
  captureReason: "سبب تضمين التسجيلات",
  captureReasonHint: "يُسجَّل مع اسمك والوقت. عشرة أحرف على الأقل.",
  produce: "إنشاء حزمة الأدلة",
  producing: "جارٍ الإنشاء…",
  produced: "أُنشئت حزمة الأدلة: {0} ملفات، {1} سجلات.",
  none: "لم تُنشأ أي حزمة أدلة لهذا التقييم بعد.",
  listTitle: "الحزم المُنشأة",
  filesCount: "{0} ملفات",
  recordsCount: "{0} سجلات",
  gapsCount: "{0} سجلات مفقودة مسمّاة في البيان",
  noGaps: "سلسلة مكتملة",
  withKeys: "تتضمن مفاتيح الإجابة",
  withCapture: "تتضمن مراجع التسجيلات",
  producedAt: "أُنشئت في {0}",
  downloadedAt: "آخر تنزيل في {0}",
  download: "تنزيل ملف ZIP",
  verifyHint: "للتحقق من ملف مُنزَّل: فُكّ ضغطه وقارن بصمة SHA-256 لكل ملف بما في {0}، مثلًا باستخدام {1}.",
  failed: "تعذّر إنشاء حزمة الأدلة.",
};
const ur: EvidenceCopy = {
  title: "شواہد کا پیکج",
  intro: "اس جائزے کے ریکارڈ کی مکمل زنجیر اور ایک ایسی فہرست کے ساتھ ایک برآمد جسے کوئی بھی عام ٹولز سے جانچ سکتا ہے۔ جوابی کلید اور نگرانی کی ریکارڈنگ اس میں شامل نہیں ہوتیں جب تک آپ انہیں شامل نہ کریں اور آپ کو اس کی اجازت نہ ہو۔",
  scopeAssessment: "پورا جائزہ",
  includeKeys: "جوابی کلید اور روبرک شامل کریں",
  includeCapture: "نگرانی کی ریکارڈنگ کے حوالے شامل کریں",
  captureReason: "ریکارڈنگ شامل کرنے کی وجہ",
  captureReasonHint: "آپ کے نام اور وقت کے ساتھ محفوظ ہوگی۔ کم از کم دس حروف۔",
  produce: "شواہد کا پیکج بنائیں",
  producing: "بنایا جا رہا ہے…",
  produced: "شواہد کا پیکج بن گیا: {0} فائلیں، {1} ریکارڈ۔",
  none: "اس جائزے کے لیے ابھی تک کوئی شواہد کا پیکج نہیں بنا۔",
  listTitle: "بنائے گئے پیکج",
  filesCount: "{0} فائلیں",
  recordsCount: "{0} ریکارڈ",
  gapsCount: "فہرست میں {0} گمشدہ ریکارڈ نام سے درج ہیں",
  noGaps: "مکمل زنجیر",
  withKeys: "جوابی کلید شامل ہے",
  withCapture: "ریکارڈنگ کے حوالے شامل ہیں",
  producedAt: "بنایا گیا {0}",
  downloadedAt: "آخری ڈاؤن لوڈ {0}",
  download: "ZIP ڈاؤن لوڈ کریں",
  verifyHint: "ڈاؤن لوڈ جانچنے کے لیے اسے ان زِپ کریں اور ہر فائل کا SHA-256 {0} سے ملائیں، مثلاً {1} استعمال کر کے۔",
  failed: "شواہد کا پیکج نہیں بن سکا۔",
};

export const STUDIO_EVIDENCE_COPY: StudioCopyArea<EvidenceCopy> = { area: "evidence", en, ar, ur };
// A type-only import above keeps this module out of a cycle with exam-studio-copy.ts.
export const studioEvidenceCopy = (language: Language): EvidenceCopy => (language === "ar" ? ar : language === "ur" ? ur : en);
export type StudioEvidenceCopy = EvidenceCopy;
