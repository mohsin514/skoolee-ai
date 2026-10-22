import type { Language } from "@/lib/locale/package";
import type { StudioCopyArea } from "./exam-studio-copy";

/**
 * SKO-500: copy for the exam-chain home surfaces outside the Studio rail: the head of department's
 * queue on the teacher home. English, Arabic and Urdu together; numbered placeholders only.
 */
const en = {
  queueTitle: "Department approvals",
  queueIntro: "Syllabi your department sent for approval, and big jumps on the Teaching Line.",
  queueEmpty: "Nothing is waiting for you.",
  syllabusMeta: "{0} outcomes · sent by {1}",
  sourceMeta: "Syllabus file · sent by {0}",
  approve: "Approve",
  open: "Open",
  approved: "Approved. The teacher can now mark progress against it.",
  failed: "Could not approve this syllabus.",
  jumpsTitle: "Teaching Line jumps",
  jumpRow: "{0} marked {1} outcomes taught in {2} at once, across {3} units.",
  jumpBackdated: "Dated earlier than the day it was recorded.",
  reachTitle: "Where did you reach?",
  reachIntro: "After a lesson, mark the next outcome taught. Papers then ask only about what is taught.",
  reachNext: "Next: {0}",
  reachLast: "Last marked taught: {0}",
  reachTaught: "Mark taught",
  reachDone: "Saved. {0} is marked taught.",
  reachAllTaught: "Every outcome in this syllabus is marked taught.",
  reachNoSyllabus: "No approved syllabus yet. Add it in Exam Studio.",
  reachOpenMap: "Open syllabus map",
  reachFailed: "Could not save. Try again from the syllabus map.",
};
type Copy = typeof en;
const ar: Copy = {
  queueTitle: "اعتمادات القسم",
  queueIntro: "مناهج أرسلها قسمك للاعتماد، وقفزات كبيرة على خط التدريس.",
  queueEmpty: "لا شيء بانتظارك.",
  syllabusMeta: "{0} من نواتج التعلم · أرسله {1}",
  sourceMeta: "ملف منهج · أرسله {0}",
  approve: "اعتماد",
  open: "فتح",
  approved: "تم الاعتماد. يمكن للمعلم الآن تحديد التقدم وفقه.",
  failed: "تعذّر اعتماد هذا المنهج.",
  jumpsTitle: "قفزات خط التدريس",
  jumpRow: "حدّد {0} عدد {1} من النواتج كمُدرَّسة في {2} دفعة واحدة، عبر {3} وحدات.",
  jumpBackdated: "بتاريخ أسبق من يوم تسجيله.",
  reachTitle: "إلى أين وصلت؟",
  reachIntro: "بعد الحصة، حدّد ناتج التعلم التالي كمُدرَّس. لا تسأل الأوراق إلا عمّا دُرِّس.",
  reachNext: "التالي: {0}",
  reachLast: "آخر ما حُدِّد كمُدرَّس: {0}",
  reachTaught: "تحديد كمُدرَّس",
  reachDone: "تم الحفظ. حُدِّد {0} كمُدرَّس.",
  reachAllTaught: "كل نواتج التعلم في هذا المنهج محددة كمُدرَّسة.",
  reachNoSyllabus: "لا يوجد منهج معتمد بعد. أضفه في استوديو الاختبارات.",
  reachOpenMap: "فتح خريطة المنهج",
  reachFailed: "تعذّر الحفظ. حاول مجددًا من خريطة المنهج.",
};
const ur: Copy = {
  queueTitle: "شعبہ کی منظوریاں",
  queueIntro: "آپ کے شعبہ کے بھیجے گئے نصاب، اور تدریسی لکیر پر بڑی چھلانگیں۔",
  queueEmpty: "آپ کے لیے کچھ زیرِ التوا نہیں۔",
  syllabusMeta: "{0} نتائج · بھیجنے والے {1}",
  sourceMeta: "نصاب کی فائل · بھیجنے والے {0}",
  approve: "منظور کریں",
  open: "کھولیں",
  approved: "منظور ہو گیا۔ استاد اب اس کے مطابق پیش رفت درج کر سکتا ہے۔",
  failed: "یہ نصاب منظور نہیں ہو سکا۔",
  jumpsTitle: "تدریسی لکیر کی چھلانگیں",
  jumpRow: "{0} نے {2} میں ایک ساتھ {1} نتائج پڑھائے گئے نشان کیے، {3} یونٹس پار کر کے۔",
  jumpBackdated: "تاریخ اندراج کے دن سے پہلے کی ہے۔",
  reachTitle: "آپ کہاں تک پہنچے؟",
  reachIntro: "سبق کے بعد اگلا نتیجہ پڑھایا گیا نشان کریں۔ پرچے صرف پڑھائے گئے حصے سے سوال کرتے ہیں۔",
  reachNext: "اگلا: {0}",
  reachLast: "آخری بار پڑھایا گیا: {0}",
  reachTaught: "پڑھایا گیا نشان کریں",
  reachDone: "محفوظ ہو گیا۔ {0} پڑھایا گیا نشان ہو گیا۔",
  reachAllTaught: "اس نصاب کے تمام نتائج پڑھائے گئے نشان ہیں۔",
  reachNoSyllabus: "ابھی کوئی منظور شدہ نصاب نہیں۔ اسے ایگزام اسٹوڈیو میں شامل کریں۔",
  reachOpenMap: "نصاب کا نقشہ کھولیں",
  reachFailed: "محفوظ نہیں ہو سکا۔ نصاب کے نقشے سے دوبارہ کوشش کریں۔",
};

export const STUDIO_HOME_COPY: StudioCopyArea<Copy> = { area: "home", en, ar, ur };
export const studioHomeCopy = (language: Language): Copy => (language === "ar" ? ar : language === "ur" ? ur : en);
