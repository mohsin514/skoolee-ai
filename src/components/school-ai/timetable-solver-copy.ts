import type { Language } from "@/lib/locale/package";
const messages = {
  title: ["Build from teaching requirements", "إنشاء الجدول من متطلبات التدريس", "تدریسی ضروریات سے نظام الاوقات بنائیں"],
  hint: ["Choose weekly lesson counts, working days and rooms. Review the suggestion before replacing the periods below.", "حدد حصص الأسبوع وأيام العمل والغرف. راجع المقترح قبل استبدال الحصص أدناه.", "ہفتہ وار اسباق، کام کے دن اور کمرے منتخب کریں۔ نیچے کے پیریڈ بدلنے سے پہلے تجویز دیکھیں۔"],
  bounds: ["Uses recorded assignments, sufficient room capacity and current bookings. Dated exams reserve their weekly time conservatively. Unrecorded availability and contractual workload are not inferred. This prepares one class at a time.", "يستخدم التعيينات المسجلة وسعة الغرف والحجوزات الحالية. تحجز الاختبارات المؤرخة وقتها الأسبوعي احتياطًا. لا يستنتج التوافر غير المسجل أو العبء التعاقدي. يُعدّ صفًا واحدًا في كل مرة.", "موجودہ ذمہ داریاں، کمروں کی گنجائش اور بکنگ استعمال ہوتی ہیں۔ تاریخ والے امتحان کا ہفتہ وار وقت احتیاطاً خالی رکھا جاتا ہے۔ غیر درج دستیابی یا معاہدے کے بوجھ کا اندازہ نہیں لگایا جاتا۔ ایک وقت میں ایک جماعت تیار ہوتی ہے۔"],
  days: ["Days to use", "الأيام المتاحة", "استعمال کے دن"],
  rooms: ["Rooms to consider", "الغرف المتاحة", "زیر غور کمرے"],
  weekly: ["Lessons per week (0 to exclude)", "حصص الأسبوع (0 للاستبعاد)", "ہفتہ وار اسباق (خارج کرنے کے لیے 0)"],
  daily: ["Maximum per day", "الحد اليومي", "روزانہ زیادہ سے زیادہ"],
  solve: ["Suggest periods", "اقتراح الحصص", "پیریڈ تجویز کریں"],
  solved: ["A complete suggestion is ready for review", "مقترح كامل جاهز للمراجعة", "مکمل تجویز جائزے کے لیے تیار ہے"],
  none: ["These constraints do not fit together. Reduce lesson counts, increase the daily limit, or choose more available days and rooms.", "لا يمكن الجمع بين هذه القيود. قلل الحصص أو ارفع الحد اليومي أو اختر أيامًا وغرفًا إضافية.", "یہ پابندیاں ایک ساتھ پوری نہیں ہو سکتیں۔ اسباق کم کریں، روزانہ حد بڑھائیں یا مزید دن اور کمرے منتخب کریں۔"],
  limit: ["The search limit was reached. This does not prove the plan is impossible. Try a smaller set of requirements or arrange periods manually.", "وصل البحث إلى حده. لا يعني ذلك استحالة الخطة. جرّب متطلبات أقل أو رتب الحصص يدويًا.", "تلاش کی حد پوری ہو گئی۔ اس سے منصوبہ ناممکن ثابت نہیں ہوتا۔ ضروریات کم کریں یا پیریڈ خود ترتیب دیں۔"],
  excluded: ["Rooms excluded because capacity is missing or insufficient", "غرف مستبعدة لعدم تسجيل السعة أو عدم كفايتها", "گنجائش کم یا نامعلوم ہونے سے خارج کمرے"],
  confirm: ["I reviewed this suggestion. Replace the periods currently shown in this form.", "راجعت المقترح. استبدل الحصص المعروضة حاليًا في النموذج.", "میں نے تجویز دیکھ لی ہے۔ اس فارم میں دکھائے گئے پیریڈ بدل دیں۔"],
  use: ["Use these periods", "استخدام هذه الحصص", "یہ پیریڈ استعمال کریں"],
  invalid: ["Choose at least one subject, day and room, with valid weekly and daily counts.", "اختر مادة ويومًا وغرفة على الأقل وأعدادًا أسبوعية ويومية صحيحة.", "کم از کم ایک مضمون، دن اور کمرہ اور درست ہفتہ وار و روزانہ تعداد منتخب کریں۔"],
  SOLVER_PERIODS_REQUIRED: ["Configure valid class period times in timetable settings first.", "حدد أوقات حصص صالحة في إعدادات الجدول أولًا.", "پہلے نظام الاوقات کی ترتیبات میں درست پیریڈ اوقات درج کریں۔"],
  SOLVER_CAPACITY: ["None of the selected rooms has enough recorded capacity for this class.", "لا تكفي السعة المسجلة لأي غرفة محددة لهذا الصف.", "منتخب کمروں میں سے کسی کی درج گنجائش اس جماعت کے لیے کافی نہیں۔"],
} as const;
export function timetableSolverCopy(language: Language): Record<keyof typeof messages, string> { const index = language === "ar" ? 1 : language === "ur" ? 2 : 0; return Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, value[index]])) as Record<keyof typeof messages, string>; }
