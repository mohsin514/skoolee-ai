/** SKAI-150 teacher allocation copy: [English, Arabic, Urdu]. Reviewed catalogs win for shared words. */
export const teacherAllocationUiEntries: readonly (readonly [string, string, string])[] = [
  ["Allocate to all {0} sections", "تعيين لجميع الشعب الـ{0}", "تمام {0} سیکشنز کو تفویض کریں"],
  ["Allocate {0} to every section?", "تعيين معلم {0} لكل الشعب؟", "{0} ہر سیکشن کو تفویض کریں؟"],
  ["Remove the {0} teacher from every section?", "إزالة معلم {0} من كل الشعب؟", "ہر سیکشن سے {0} کا استاد ہٹا دیں؟"],
  ["{0} of {1} sections change; {2} already scheduled on the timetable will move with it.", "تتغير {0} من {1} شعب؛ وستنتقل معها {2} مجدولة بالفعل في الجدول.", "{1} میں سے {0} سیکشن بدلیں گے؛ ٹائم ٹیبل پر پہلے سے شیڈول {2} بھی ساتھ منتقل ہوں گے۔"],
  ["Over the weekly limit of {0} periods", "تجاوز الحد الأسبوعي البالغ {0} حصة", "ہفتہ وار {0} پیریڈز کی حد سے زیادہ"],
  ["Allocate teacher", "تعيين المعلم", "استاد تفویض کریں"],
  ["{0} section updated", "تم تحديث {0} شعبة", "{0} سیکشن اپ ڈیٹ ہوا"],
  ["{0} sections updated", "تم تحديث {0} شعب", "{0} سیکشنز اپ ڈیٹ ہوئے"],
  ["{0}/{1} periods", "{0}/{1} حصص", "{0}/{1} پیریڈز"],
  ["Weekly periods are full", "الحصص الأسبوعية مكتملة", "ہفتہ وار پیریڈز پورے ہیں"],
  ["Could not allocate the teacher. Nothing changed; try again.", "تعذّر تعيين المعلم. لم يتغير شيء؛ حاول مرة أخرى.", "استاد تفویض نہیں ہو سکا۔ کچھ نہیں بدلا؛ دوبارہ کوشش کریں۔"],
  ["This subject's teacher changed since you opened the page. Reload to see the latest allocation, then try again.", "تغيّر معلم هذه المادة منذ فتحت الصفحة. أعد التحميل لرؤية أحدث تعيين، ثم حاول مرة أخرى.", "صفحہ کھولنے کے بعد اس مضمون کا استاد بدل گیا۔ تازہ ترین تفویض دیکھنے کے لیے دوبارہ لوڈ کریں، پھر کوشش کریں۔"],
  ["Choose at least one subject to allocate.", "اختر مادة واحدة على الأقل للتعيين.", "تفویض کے لیے کم از کم ایک مضمون منتخب کریں۔"],
  ["Each subject can be allocated once per request.", "يمكن تعيين كل مادة مرة واحدة في كل طلب.", "ہر مضمون فی درخواست ایک بار تفویض ہو سکتا ہے۔"],
];

export const arabicTeacherAllocationUi: Record<string, string> = Object.fromEntries(teacherAllocationUiEntries.map(([en, ar]) => [en, ar]));
export const urduTeacherAllocationUi: Record<string, string> = Object.fromEntries(teacherAllocationUiEntries.map(([en, , ur]) => [en, ur]));
