import type { SetupAreaId } from "@/lib/onboarding/setup-areas";

type AreaCopy = Record<SetupAreaId, { title: string; why: string }>;
type SetupAreasCopy = {
  title: string; intro: string; doneSuffix: string; next: string; open: string; markDone: string; later: string; reopen: string; delegated: string;
  statuses: { OPEN: string; IN_PROGRESS: string; DONE: string; DEFERRED: string };
  areas: AreaCopy;
};

const en: SetupAreasCopy = {
  title: "Finish setting up your school",
  intro: "Work through these in order. Open one, set it up, then come back here. Choose Later to skip one for now: your progress is saved.",
  doneSuffix: "done", next: "Next", open: "Open", markDone: "Mark done", later: "Later", reopen: "Back to list",
  delegated: "Each campus admin sets this up for their campus.",
  statuses: { OPEN: "To do", IN_PROGRESS: "In progress", DONE: "Done", DEFERRED: "Later" },
  areas: {
    logo: { title: "School logo", why: "Prints on report cards, receipts and letters." },
    academicYear: { title: "Academic year", why: "Terms and dates every class and exam belongs to." },
    weekends: { title: "Weekend days", why: "Which days the school is closed each week." },
    holidays: { title: "Holidays", why: "Closures that attendance and timetables skip." },
    periods: { title: "Periods", why: "The bells of the school day for the timetable." },
    rooms: { title: "Rooms", why: "Where classes and exams take place." },
    classes: { title: "Classes and sections", why: "Grades and sections that pupils join." },
    subjects: { title: "Subjects", why: "What each class studies and who teaches it." },
    gradeWeights: { title: "Grade weights", why: "How tests, assignments and exams add up to a result." },
  },
};

const ar: SetupAreasCopy = {
  title: "أكمل إعداد مدرستك",
  intro: "أنجز هذه الخطوات بالترتيب. افتح خطوة وأعدّها ثم عُد إلى هنا. اختر «لاحقًا» لتخطي خطوة الآن: يُحفظ تقدمك.",
  doneSuffix: "منجزة", next: "التالي", open: "فتح", markDone: "تم", later: "لاحقًا", reopen: "إعادة إلى القائمة",
  delegated: "يُعدّ مسؤول كل فرع هذا لفرعه.",
  statuses: { OPEN: "للإنجاز", IN_PROGRESS: "قيد التنفيذ", DONE: "منجزة", DEFERRED: "لاحقًا" },
  areas: {
    logo: { title: "شعار المدرسة", why: "يظهر على الشهادات والإيصالات والخطابات." },
    academicYear: { title: "العام الدراسي", why: "الفصول والتواريخ التي تتبعها كل الصفوف والاختبارات." },
    weekends: { title: "أيام العطلة الأسبوعية", why: "الأيام التي تُغلق فيها المدرسة كل أسبوع." },
    holidays: { title: "العطلات", why: "أيام الإغلاق التي يتخطاها الحضور والجداول." },
    periods: { title: "الحصص", why: "توقيت اليوم الدراسي للجدول." },
    rooms: { title: "القاعات", why: "أماكن الحصص والاختبارات." },
    classes: { title: "الصفوف والشُعب", why: "الصفوف والشُعب التي ينضم إليها الطلاب." },
    subjects: { title: "المواد", why: "ما يدرسه كل صف ومن يدرّسه." },
    gradeWeights: { title: "أوزان الدرجات", why: "كيف تُحتسب الاختبارات والواجبات في النتيجة." },
  },
};

const ur: SetupAreasCopy = {
  title: "اپنے اسکول کا سیٹ اپ مکمل کریں",
  intro: "یہ مراحل ترتیب سے مکمل کریں۔ ایک کھولیں، سیٹ اپ کریں، پھر یہاں واپس آئیں۔ کسی کو ابھی چھوڑنے کے لیے «بعد میں» منتخب کریں: آپ کی پیش رفت محفوظ رہتی ہے۔",
  doneSuffix: "مکمل", next: "اگلا", open: "کھولیں", markDone: "مکمل", later: "بعد میں", reopen: "فہرست میں واپس",
  delegated: "ہر کیمپس کا ایڈمن اپنے کیمپس کے لیے یہ سیٹ اپ کرتا ہے۔",
  statuses: { OPEN: "باقی", IN_PROGRESS: "جاری", DONE: "مکمل", DEFERRED: "بعد میں" },
  areas: {
    logo: { title: "اسکول کا لوگو", why: "رپورٹ کارڈ، رسیدوں اور خطوط پر چھپتا ہے۔" },
    academicYear: { title: "تعلیمی سال", why: "وہ ٹرم اور تاریخیں جن سے ہر کلاس اور امتحان منسلک ہے۔" },
    weekends: { title: "ہفتہ وار تعطیل", why: "ہر ہفتے اسکول کن دنوں بند رہتا ہے۔" },
    holidays: { title: "تعطیلات", why: "وہ دن جنہیں حاضری اور ٹائم ٹیبل چھوڑ دیتے ہیں۔" },
    periods: { title: "پیریڈ", why: "ٹائم ٹیبل کے لیے اسکول کے دن کی گھنٹیاں۔" },
    rooms: { title: "کمرے", why: "جہاں کلاسیں اور امتحانات ہوتے ہیں۔" },
    classes: { title: "کلاسیں اور سیکشن", why: "وہ جماعتیں اور سیکشن جن میں طلبہ شامل ہوتے ہیں۔" },
    subjects: { title: "مضامین", why: "ہر کلاس کیا پڑھتی ہے اور کون پڑھاتا ہے۔" },
    gradeWeights: { title: "گریڈ کا وزن", why: "ٹیسٹ، اسائنمنٹ اور امتحان نتیجے میں کیسے شامل ہوتے ہیں۔" },
  },
};

export function getSetupAreasCopy(language: string): SetupAreasCopy {
  return language === "ar" ? ar : language === "ur" ? ur : en;
}
