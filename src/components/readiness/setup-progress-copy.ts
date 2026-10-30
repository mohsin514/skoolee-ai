// SKAI-160 setup progress copy. `{0}`-style slots are filled by the component; numbers stay Latin digits in <bdi>.
type SetupProgressCopy = {
  title: string; help: string; overall: string; refresh: string; refreshing: string; refreshed: string;
  stale: string; staleBody: string; partial: string; partialBody: string; partialSources: Record<string, string>;
  mismatch: string; mismatchBody: string; reconciled: string;
  areas: string; followUps: string; checks: string; campuses: string; ofTotal: string;
  buckets: { done: string; inProgress: string; open: string; deferred: string };
  campusReady: string; classes: string; pupils: string; schoolTotal: string; openRecords: string;
  definitionsTitle: string; definitions: string[]; mine: string; empty: string;
};

const en: SetupProgressCopy = {
  title: "Setup progress", help: "Counts come from the setup records below. Open any count to see the records behind it.",
  overall: "{0}% of setup done", refresh: "Refresh", refreshing: "Refreshing…", refreshed: "Last refreshed {0}",
  stale: "These numbers may be out of date", staleBody: "They were read more than 15 minutes ago. Refresh before you act on them.",
  partial: "Some numbers are partial", partialBody: "Not every record could be counted: {0}. Totals may be lower than the real figure.",
  partialSources: { imports: "only the 50 most recent import batches were read" },
  mismatch: "Campus totals do not match the school totals", mismatchBody: "Some classes or pupils belong to an archived campus. Check the class and pupil lists.",
  reconciled: "Totals match the records",
  areas: "Setup areas", followUps: "Follow-ups", checks: "Required checks", campuses: "Campuses ready", ofTotal: "{0} of {1}",
  buckets: { done: "Done", inProgress: "In progress", open: "Not started", deferred: "Later" },
  campusReady: "Ready", classes: "classes", pupils: "pupils", schoolTotal: "School total", openRecords: "Open records",
  definitionsTitle: "How progress is counted",
  definitions: [
    "A setup area is done when its task is marked done. “Later” and “In progress” are not done.",
    "Follow-ups count every setup task, including the setup areas.",
    "Required checks are the go-live checks your adoption mode requires.",
    "Overall progress = setup areas done plus required checks passed, out of both totals.",
    "A campus is ready with at least one class and one pupil. Archived classes and pupils are not counted.",
  ],
  mine: "Your follow-ups", empty: "No setup records yet.",
};

const ar: SetupProgressCopy = {
  title: "تقدّم الإعداد", help: "الأرقام مأخوذة من سجلات الإعداد أدناه. افتح أي رقم لترى السجلات التي خلفه.",
  overall: "اكتمل {0}% من الإعداد", refresh: "تحديث", refreshing: "جارٍ التحديث…", refreshed: "آخر تحديث {0}",
  stale: "قد تكون هذه الأرقام قديمة", staleBody: "قُرئت قبل أكثر من 15 دقيقة. حدّثها قبل أن تعتمد عليها.",
  partial: "بعض الأرقام جزئية", partialBody: "تعذّر عدّ كل السجلات: {0}. قد تكون الإجماليات أقل من الرقم الفعلي.",
  partialSources: { imports: "قُرئت أحدث 50 دفعة استيراد فقط" },
  mismatch: "إجماليات الفروع لا تطابق إجماليات المدرسة", mismatchBody: "بعض الصفوف أو الطلاب تابعون لفرع مؤرشف. راجع قوائم الصفوف والطلاب.",
  reconciled: "الإجماليات مطابقة للسجلات",
  areas: "مجالات الإعداد", followUps: "المتابعات", checks: "الفحوص المطلوبة", campuses: "الفروع الجاهزة", ofTotal: "{0} من {1}",
  buckets: { done: "مكتملة", inProgress: "قيد التنفيذ", open: "لم تبدأ", deferred: "لاحقًا" },
  campusReady: "جاهز", classes: "صفوف", pupils: "طلاب", schoolTotal: "إجمالي المدرسة", openRecords: "فتح السجلات",
  definitionsTitle: "كيف يُحسب التقدّم",
  definitions: [
    "يكتمل مجال الإعداد عندما تُعلَّم مهمته مكتملة. «لاحقًا» و«قيد التنفيذ» ليست مكتملة.",
    "تشمل المتابعات كل مهام الإعداد، ومنها مجالات الإعداد.",
    "الفحوص المطلوبة هي فحوص الإطلاق التي يتطلبها نمط التبنّي لديك.",
    "التقدّم الكلي = مجالات الإعداد المكتملة مع الفحوص المطلوبة الناجحة، من مجموعهما.",
    "يكون الفرع جاهزًا بصف واحد وطالب واحد على الأقل. لا تُحسب الصفوف والطلاب المؤرشفون.",
  ],
  mine: "متابعاتك", empty: "لا توجد سجلات إعداد بعد.",
};

const ur: SetupProgressCopy = {
  title: "سیٹ اپ کی پیش رفت", help: "یہ تعداد نیچے دیے گئے سیٹ اپ ریکارڈز سے لی گئی ہے۔ کسی بھی تعداد کو کھول کر اس کے ریکارڈ دیکھیں۔",
  overall: "سیٹ اپ {0}% مکمل", refresh: "تازہ کریں", refreshing: "تازہ ہو رہا ہے…", refreshed: "آخری بار تازہ کیا گیا {0}",
  stale: "یہ تعداد پرانی ہو سکتی ہے", staleBody: "یہ 15 منٹ سے زیادہ پہلے پڑھی گئی تھی۔ اس پر عمل کرنے سے پہلے تازہ کریں۔",
  partial: "کچھ تعداد نامکمل ہے", partialBody: "تمام ریکارڈ گنے نہیں جا سکے: {0}۔ مجموعہ اصل تعداد سے کم ہو سکتا ہے۔",
  partialSources: { imports: "صرف تازہ ترین 50 امپورٹ بیچ پڑھے گئے" },
  mismatch: "کیمپس کا مجموعہ اسکول کے مجموعے سے نہیں ملتا", mismatchBody: "کچھ کلاسیں یا طلبہ کسی آرکائیو کیمپس میں ہیں۔ کلاس اور طلبہ کی فہرستیں دیکھیں۔",
  reconciled: "مجموعہ ریکارڈز سے ملتا ہے",
  areas: "سیٹ اپ کے شعبے", followUps: "فالو اپس", checks: "لازمی جانچ", campuses: "تیار کیمپس", ofTotal: "{1} میں سے {0}",
  buckets: { done: "مکمل", inProgress: "جاری", open: "شروع نہیں ہوا", deferred: "بعد میں" },
  campusReady: "تیار", classes: "کلاسیں", pupils: "طلبہ", schoolTotal: "اسکول کا مجموعہ", openRecords: "ریکارڈ کھولیں",
  definitionsTitle: "پیش رفت کیسے گنی جاتی ہے",
  definitions: [
    "سیٹ اپ کا شعبہ تب مکمل ہوتا ہے جب اس کا کام مکمل نشان زد ہو۔ «بعد میں» اور «جاری» مکمل نہیں۔",
    "فالو اپس میں سیٹ اپ کے تمام کام شامل ہیں، سیٹ اپ کے شعبوں سمیت۔",
    "لازمی جانچ وہ لانچ جانچ ہیں جو آپ کا اپنانے کا طریقہ مانگتا ہے۔",
    "مجموعی پیش رفت = مکمل شعبے اور کامیاب لازمی جانچ، دونوں کے کل میں سے۔",
    "کیمپس کم از کم ایک کلاس اور ایک طالب علم کے ساتھ تیار ہے۔ آرکائیو کلاسیں اور طلبہ نہیں گنے جاتے۔",
  ],
  mine: "آپ کے فالو اپس", empty: "ابھی کوئی سیٹ اپ ریکارڈ نہیں۔",
};

export function getSetupProgressCopy(language: string): SetupProgressCopy {
  return language === "ar" ? ar : language === "ur" ? ur : en;
}
