const copy = {
  title: ["Role permissions", "صلاحيات الأدوار", "کردار کی اجازتیں"],
  scope: ["These defaults apply across this school. Each record still requires current campus and child access.", "تسري هذه الإعدادات على المدرسة. يظل الوصول لكل سجل مرتبطًا بصلاحية الفرع والطالب الحالية.", "یہ اجازتیں پوری اسکول پر لاگو ہیں۔ ہر ریکارڈ کے لیے موجودہ کیمپس اور بچے کی رسائی بھی ضروری ہے۔"],
  role: ["Role", "الدور", "کردار"], search: ["Find a module", "ابحث عن وحدة", "ماڈیول تلاش کریں"],
  loading: ["Checking current permissions…", "جارٍ التحقق من الصلاحيات الحالية…", "موجودہ اجازتیں جانچی جا رہی ہیں…"],
  loadError: ["Permissions could not be verified. Retry to load current access.", "تعذر التحقق من الصلاحيات. أعد المحاولة لتحميل الوصول الحالي.", "اجازتوں کی تصدیق نہیں ہو سکی۔ موجودہ رسائی کے لیے دوبارہ کوشش کریں۔"],
  saveError: ["The change was not confirmed. Review the saved permissions and retry.", "لم يتم تأكيد التغيير. راجع الصلاحيات المحفوظة وأعد المحاولة.", "تبدیلی کی تصدیق نہیں ہوئی۔ محفوظ اجازتیں دیکھ کر دوبارہ کوشش کریں۔"],
  denied: ["Your current account cannot change school-wide permissions. Ask your school's administrator.", "لا يستطيع حسابك الحالي تغيير صلاحيات المدرسة. تواصل مع مسؤول مدرستك.", "آپ کا موجودہ اکاؤنٹ پوری اسکول کی اجازتیں تبدیل نہیں کر سکتا۔ اپنے اسکول کے منتظم سے رابطہ کریں۔"],
  readOnly: ["Read only. Only your school's administrator can change these school-wide defaults, with two-step sign-in turned on.", "للقراءة فقط. يستطيع مسؤول مدرستك وحده تغيير هذه الإعدادات على مستوى المدرسة، بعد تفعيل التحقق بخطوتين.", "صرف مطالعہ۔ یہ اسکول کی عمومی اجازتیں صرف آپ کے اسکول کا منتظم دو مرحلہ سائن اِن آن کر کے بدل سکتا ہے۔"],
  mfaTitle: ["Turn on two-step sign-in to change permissions", "فعّل التحقق بخطوتين لتغيير الصلاحيات", "اجازتیں بدلنے کے لیے دو مرحلہ سائن اِن آن کریں"],
  mfaBody: ["Permission changes affect everyone in the school, so they need two-step sign-in on your account. You can still review the current permissions.", "تؤثر تغييرات الصلاحيات على جميع من في المدرسة، لذا تتطلب تفعيل التحقق بخطوتين في حسابك. يمكنك مراجعة الصلاحيات الحالية.", "اجازتوں کی تبدیلیاں پورے اسکول پر اثر ڈالتی ہیں، اس لیے آپ کے اکاؤنٹ پر دو مرحلہ سائن اِن ضروری ہے۔ آپ موجودہ اجازتیں دیکھ سکتے ہیں۔"],
  mfaAction: ["Turn on two-step sign-in", "تفعيل التحقق بخطوتين", "دو مرحلہ سائن اِن آن کریں"],
  bulkOnTitle: ["Turn on every permission in this group?", "هل تفعّل جميع الصلاحيات في هذه المجموعة؟", "کیا اس گروپ کی تمام اجازتیں آن کریں؟"],
  bulkOffTitle: ["Turn off every permission in this group?", "هل توقف جميع الصلاحيات في هذه المجموعة؟", "کیا اس گروپ کی تمام اجازتیں بند کریں؟"],
  bulkBody: ["Everyone with this role, across the school, gains or loses these actions as soon as you confirm. You can change each switch back afterwards.", "يكتسب كل من يحمل هذا الدور في المدرسة هذه الإجراءات أو يفقدها فور التأكيد. يمكنك إعادة كل مفتاح لاحقاً.", "اس کردار کے حامل پورے اسکول کے تمام افراد تصدیق کرتے ہی یہ اقدامات حاصل کریں گے یا کھو دیں گے۔ بعد میں ہر سوئچ واپس بدلا جا سکتا ہے۔"],
  bulkOn: ["Turn all on", "تفعيل الكل", "سب آن کریں"], bulkOff: ["Turn all off", "إيقاف الكل", "سب بند کریں"],
  moduleOnTitle: ["Allow every action in this module?", "هل تسمح بكل الإجراءات في هذه الوحدة؟", "کیا اس ماڈیول کے تمام اعمال کی اجازت دیں؟"],
  moduleOffTitle: ["Remove all access to this module?", "هل تزيل كل الصلاحيات في هذه الوحدة؟", "کیا اس ماڈیول کی تمام رسائی ختم کریں؟"],
  reason: ["Why are you changing these permissions?", "لماذا تغيّر هذه الصلاحيات؟", "آپ یہ اجازتیں کیوں بدل رہے ہیں؟"],
  reasonShort: ["Write at least 10 characters.", "اكتب 10 أحرف على الأقل.", "کم از کم 10 حروف لکھیں۔"],
  keepEditing: ["Keep editing", "متابعة التعديل", "ترمیم جاری رکھیں"],
  retry: ["Retry", "إعادة المحاولة", "دوبارہ کوشش"], refresh: ["Refresh permissions", "تحديث الصلاحيات", "اجازتیں تازہ کریں"],
  empty: ["No modules match this search.", "لا توجد وحدات تطابق البحث.", "اس تلاش سے کوئی ماڈیول نہیں ملا۔"],
  view: ["View", "عرض", "دیکھیں"], add: ["Add", "إضافة", "شامل کریں"], edit: ["Edit", "تعديل", "ترمیم"], delete: ["Delete", "حذف", "حذف"],
  full: ["Allow all actions", "السماح بكل الإجراءات", "تمام اعمال کی اجازت"], none: ["Remove all access", "إزالة كل الصلاحيات", "تمام رسائی ختم کریں"],
  viewFirst: ["Enable View before other actions.", "فعّل العرض قبل الإجراءات الأخرى.", "دوسرے اعمال سے پہلے دیکھنے کی اجازت دیں۔"],
  saved: ["Saved on the server.", "تم الحفظ على الخادم.", "سرور پر محفوظ ہو گیا۔"], saving: ["Saving…", "جارٍ الحفظ…", "محفوظ ہو رہا ہے…"],
  copyFrom: ["Copy from role", "نسخ من دور", "کردار سے نقل کریں"], choose: ["Choose a role", "اختر دورًا", "کردار منتخب کریں"],
  review: ["Review copy", "مراجعة النسخ", "نقل کا جائزہ"], copyTitle: ["Copy role permissions", "نسخ صلاحيات الدور", "کردار کی اجازتیں نقل کریں"],
  copyHint: ["This replaces every module for the destination role. Campus and child restrictions still apply. Successful modules remain saved if a later module fails.", "سيستبدل هذا جميع وحدات الدور المستهدف. تبقى قيود الفرع والطالب سارية. تظل الوحدات الناجحة محفوظة إذا فشلت وحدة لاحقة.", "یہ ہدف کردار کے تمام ماڈیول بدل دے گا۔ کیمپس اور بچے کی پابندیاں برقرار ہیں۔ بعد کا ماڈیول ناکام ہونے پر کامیاب تبدیلیاں محفوظ رہیں گی۔"],
  source: ["From", "من", "ماخذ"], target: ["To", "إلى", "ہدف"],
  confirm: ["Apply reviewed permissions", "تطبيق الصلاحيات المراجعة", "جائزہ شدہ اجازتیں لاگو کریں"], cancel: ["Cancel", "إلغاء", "منسوخ"],
  partial: ["Modules confirmed before the interruption:", "الوحدات المؤكدة قبل التوقف:", "رکاوٹ سے پہلے تصدیق شدہ ماڈیول:"],
  fixed: ["This role has fixed permissions.", "صلاحيات هذا الدور ثابتة.", "اس کردار کی اجازتیں مقرر ہیں۔"],
  students: ["Students", "الطلاب", "طلبہ"], academics: ["Academics", "الشؤون الأكاديمية", "تعلیم"], staff: ["Staff", "الموظفون", "عملہ"], money: ["Money", "الشؤون المالية", "مالیات"], operations: ["Operations", "العمليات", "انتظامی امور"], assistant: ["Assistant", "المساعد", "معاون"], other: ["Other", "أخرى", "دیگر"],
} as const;
export type PermissionCopyKey = keyof typeof copy;
export function permissionCopy(language: "en" | "ar" | "ur") {
  const index = language === "ar" ? 1 : language === "ur" ? 2 : 0;
  return Object.fromEntries(Object.entries(copy).map(([key, value]) => [key, value[index]])) as Record<PermissionCopyKey, string>;
}
const labels: Record<string, readonly [string, string, string]> = {
  CAMPUS_ADMIN: ["Campus admin", "مدير الفرع", "کیمپس منتظم"], ADMIN: ["Administrator", "المسؤول", "منتظم"], PRINCIPAL: ["Principal", "مدير المدرسة", "پرنسپل"], TEACHER: ["Teacher", "المعلم", "استاد"], ACCOUNTANT: ["Accountant", "المحاسب", "اکاؤنٹنٹ"], LIBRARIAN: ["Librarian", "أمين المكتبة", "لائبریرین"], RECEPTIONIST: ["Receptionist", "موظف الاستقبال", "استقبالیہ"], PARENT: ["Parent", "ولي الأمر", "والدین"], STUDENT: ["Student", "الطالب", "طالب علم"],
  students: ["Students", "الطلاب", "طلبہ"], fees: ["Fees", "الرسوم", "فیس"], payroll: ["Payroll", "الرواتب", "تنخواہیں"], leave: ["Leave", "الإجازات", "رخصت"], attendance: ["Attendance", "الحضور", "حاضری"], timetable: ["Timetable", "الجدول الدراسي", "ٹائم ٹیبل"], exams: ["Exams", "الاختبارات", "امتحانات"], reports: ["Reports", "التقارير", "رپورٹس"], staff: ["Staff", "الموظفون", "عملہ"], admissions: ["Admissions", "القبول", "داخلے"], accounts: ["Accounts", "الحسابات", "حسابات"], ai: ["AI assistant", "مساعد الذكاء الاصطناعي", "مصنوعی ذہانت معاون"], library: ["Library", "المكتبة", "لائبریری"], "front-desk": ["Front desk", "الاستقبال", "استقبالیہ"], transport: ["Transport", "النقل", "ٹرانسپورٹ"], inventory: ["Inventory", "المخزون", "انوینٹری"], dormitory: ["Dormitory", "السكن", "ہاسٹل"],
};
export const permissionLabel = (value: string, language: "en" | "ar" | "ur") => labels[value]?.[language === "ar" ? 1 : language === "ur" ? 2 : 0] ?? value;
