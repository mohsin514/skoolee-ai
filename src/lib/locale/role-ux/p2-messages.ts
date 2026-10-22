/**
 * P2 (navigation registry, shell, frames, Help menu, legacy retirement) — Arabic and Urdu for every new or
 * changed EN UI key in P2 files (registry labels, summaries, denied reasons, retired notices, header, Help,
 * access notices, /403). Aggregated by P9 into arabicRoleUxUi / urduRoleUxUi (src/lib/locale/role-ux/index.ts).
 * Entries are [en, ar, ur]; keys already translated elsewhere are not repeated.
 *
 * Urdu navigation vocabulary (one word per concept, integration round 1): setup = سیٹ اپ (never تیاری / ترتیب, which
 * reads as Settings = ترتیبات); pickup = وصولی (the reviewed "Pickup"), so the finance desk's "Collect" is
 * فیس کی وصولی; group = گروپ (the reviewed "Group" / "Group policy" and the §1.5 console name گروپ کنسول).
 */
const entries: ReadonlyArray<readonly [string, string, string]> = [
  // ── Console names (registry eyebrows, SPEC §1.5) ─────────────────────────
  // The header reads each console name through its own "Console name: <EN>" key (role-nav `consoleName`), because
  // the bare words are also ordinary labels with a different meaning: "Teaching" is the principal's nav group and a
  // staff tab, "Family" / "Learner" / "Library" appear in records and filters. The bare keys keep their generic
  // translation; only the console names below carry the §1.5 wording.
  ["Console name: Group console", "لوحة المجموعة", "گروپ کنسول"],
  ["Console name: Campus console", "لوحة الفرع", "کیمپس کنسول"],
  ["Console name: School console", "لوحة المدرسة", "اسکول کنسول"],
  ["Console name: Academic console", "اللوحة الأكاديمية", "تعلیمی کنسول"],
  ["Console name: Teaching", "مساحة التدريس", "تدریس"],
  ["Console name: Finance desk", "مكتب المالية", "شعبۂ مالیات"],
  ["Console name: Front desk", "مكتب الاستقبال", "استقبالیہ"],
  ["Console name: Library", "المكتبة", "لائبریری"],
  ["Console name: Family", "بوابة الأسرة", "خاندانی پورٹل"],
  ["Console name: Learner", "بوابة الطالب", "طالب علم پورٹل"],
  ["Console name: Platform operations", "تشغيل المنصة", "پلیٹ فارم آپریشنز"],
  ["Group console", "لوحة المجموعة", "گروپ کنسول"],
  ["Campus console", "لوحة الفرع", "کیمپس کنسول"],
  ["School console", "لوحة المدرسة", "اسکول کنسول"],
  ["Academic console", "اللوحة الأكاديمية", "تعلیمی کنسول"],
  // Generic: the principal's "Teaching" nav group and the staff "Teaching" tab (the console name is above).
  ["Teaching", "التدريس", "تدریس"],
  ["Finance desk", "مكتب المالية", "شعبۂ مالیات"],
  ["Front desk", "مكتب الاستقبال", "استقبالیہ"],
  ["Platform operations", "تشغيل المنصة", "پلیٹ فارم آپریشنز"],

  // ── Group console ────────────────────────────────────────────────────────
  ["Decisions waiting on you and how every campus is doing.", "القرارات التي تنتظرك وأداء كل فرع.", "آپ کے منتظر فیصلے اور ہر کیمپس کی کارکردگی۔"],
  ["Open a campus to see its numbers and the people who run it.", "افتح فرعاً لترى أرقامه والقائمين عليه.", "کسی کیمپس کو کھولیں تاکہ اس کے اعداد و شمار اور اسے چلانے والے افراد دیکھ سکیں۔"],
  ["Approvals", "الموافقات", "منظوریاں"],
  ["Support access, tax sign-off and policy reviews waiting for you.", "طلبات وصول الدعم واعتماد الضرائب ومراجعات السياسات التي تنتظرك.", "سپورٹ رسائی، ٹیکس کی منظوری اور پالیسی جائزے جو آپ کے منتظر ہیں۔"],
  ["People & access", "الأشخاص والصلاحيات", "افراد اور رسائی"],
  ["Campus leaders, who may manage members, and role permissions.", "قادة الفروع، ومن يحق له إدارة الأعضاء، وصلاحيات الأدوار.", "کیمپس کے سربراہان، کون اراکین کا انتظام کر سکتا ہے، اور کرداروں کی اجازتیں۔"],
  ["Group standards", "معايير المجموعة", "گروپ کے معیارات"],
  ["Curriculum templates and group policy every campus follows.", "قوالب المناهج وسياسة المجموعة التي تتبعها كل الفروع.", "نصاب کے سانچے اور گروپ پالیسی جن پر ہر کیمپس عمل کرتا ہے۔"],
  ["Your SkooleeAI plan, AI credits and payment method.", "خطة SkooleeAI ورصيد الذكاء الاصطناعي وطريقة الدفع.", "آپ کا SkooleeAI پلان، اے آئی کریڈٹس اور ادائیگی کا طریقہ۔"],
  ["The subscription is managed by the account owner.", "يدير مالك الحساب هذا الاشتراك.", "یہ سبسکرپشن اکاؤنٹ کے مالک کے زیرِ انتظام ہے۔"],
  ["School profile, language, sign-in, integrations, data and activity.", "ملف المدرسة واللغة وتسجيل الدخول والتكاملات والبيانات وسجل النشاط.", "اسکول کا پروفائل، زبان، سائن اِن، انضمام، ڈیٹا اور سرگرمی۔"],

  // ── Campus / School console ─────────────────────────────────────────────
  ["What needs you on this campus today.", "ما يحتاج إليك في هذا الفرع اليوم.", "اس کیمپس پر آج آپ کی ضرورت کہاں ہے۔"],
  ["Student list", "قائمة الطلاب", "طلبہ کی فہرست"],
  ["Enquiries, applications and the online form.", "الاستفسارات والطلبات والنموذج الإلكتروني.", "استفسارات، درخواستیں اور آن لائن فارم۔"],
  ["Link guardians to children and choose what each can see.", "اربط أولياء الأمور بالأبناء واختر ما يمكن لكل منهم رؤيته.", "سرپرستوں کو بچوں سے منسلک کریں اور طے کریں کہ ہر ایک کیا دیکھ سکتا ہے۔"],
  ["Family communication", "التواصل مع الأسر", "خاندانوں سے رابطہ"],
  ["Messages sent to families, failed deliveries and reminders.", "الرسائل المرسلة إلى الأسر والرسائل التي تعذّر تسليمها والتذكيرات.", "خاندانوں کو بھیجے گئے پیغامات، ناکام ترسیلات اور یاد دہانیاں۔"],
  ["Year end & promotion", "نهاية العام والترفيع", "سال کا اختتام اور ترقی"],
  ["Staff & invites", "الموظفون والدعوات", "عملہ اور دعوت نامے"],
  ["Staff & leaders", "الموظفون والقادة", "عملہ اور سربراہان"],
  ["Leave approvals", "الموافقة على الإجازات", "رخصت کی منظوریاں"],
  ["Staff structure", "الهيكل الوظيفي", "عملے کا ڈھانچہ"],
  ["Teacher performance", "أداء المعلمين", "اساتذہ کی کارکردگی"],
  ["Academic overview", "نظرة أكاديمية عامة", "تعلیمی جائزہ"],
  ["Classes & subjects", "الصفوف والمواد", "جماعتیں اور مضامین"],
  ["Your principal publishes the timetable.", "مديرك الأكاديمي هو من ينشر الجدول الدراسي.", "نظام الاوقات آپ کے تعلیمی سربراہ شائع کرتے ہیں۔"],
  ["Exams & results", "الامتحانات والنتائج", "امتحانات اور نتائج"],
  ["Your principal runs exams and results.", "مديرك الأكاديمي يدير الامتحانات والنتائج.", "امتحانات اور نتائج آپ کے تعلیمی سربراہ کے ذمے ہیں۔"],
  ["Report cards", "الشهادات المدرسية", "رپورٹ کارڈز"],
  ["AI assistant", "المساعد الذكي", "اے آئی معاون"],
  ["Access plans", "خطط التسهيلات", "سہولت کے منصوبے"],
  ["Secure exam delivery", "تقديم الامتحانات الآمن", "محفوظ امتحانی ترسیل"],
  ["Money", "المال", "مالیات"],
  ["Family tuition: invoices, payments and approvals.", "رسوم الأسر الدراسية: الفواتير والمدفوعات والموافقات.", "خاندانوں کی ٹیوشن فیس: بل، ادائیگیاں اور منظوریاں۔"],
  ["Payroll approvals", "اعتماد الرواتب", "تنخواہوں کی منظوری"],
  ["Record corrections", "تصحيحات السجلات", "ریکارڈ کی تصحیحات"],
  ["Approve payment corrections and, without a principal, mark corrections.", "اعتمد تصحيحات المدفوعات، وتصحيحات الدرجات عند عدم وجود مدير أكاديمي.", "ادائیگی کی تصحیحات منظور کریں، اور تعلیمی سربراہ نہ ہونے کی صورت میں نمبروں کی تصحیحات بھی۔"],
  ["Campus services", "خدمات الفرع", "کیمپس کی خدمات"],
  ["Complaints, certificates and, when no receptionist is on duty, visitors, calls and post.", "الشكاوى والشهادات، والزوار والمكالمات والبريد عند غياب موظف الاستقبال.", "شکایات، اسناد، اور جب استقبالیہ عملہ موجود نہ ہو تو ملاقاتی، کالیں اور ڈاک۔"],
  ["Inventory & purchasing", "المخزون والمشتريات", "انوینٹری اور خریداری"],
  ["Your librarian runs the library.", "أمين المكتبة هو من يدير المكتبة.", "لائبریری آپ کے لائبریرین چلاتے ہیں۔"],
  ["Care & safeguarding", "الرعاية والحماية", "نگہداشت اور تحفظ"],
  ["The SkooleeAI subscription is managed by the account owner.", "يدير مالك الحساب اشتراك SkooleeAI.", "SkooleeAI سبسکرپشن اکاؤنٹ کے مالک کے زیرِ انتظام ہے۔"],
  ["School settings", "إعدادات المدرسة", "اسکول کی ترتیبات"],
  ["Campus setup", "إعداد الفرع", "کیمپس سیٹ اپ"],
  ["School setup", "إعداد المدرسة", "اسکول سیٹ اپ"],
  ["Year setup, calendar, periods, rooms, categories, policies and packages.", "إعداد العام والتقويم والحصص والقاعات والفئات والسياسات والباقات.", "سال کا سیٹ اپ، کیلنڈر، پیریڈز، کمرے، زمرے، پالیسیاں اور پیکجز۔"],

  // ── Academic console ─────────────────────────────────────────────────────
  ["Academic decisions waiting on you.", "القرارات الأكاديمية التي تنتظرك.", "آپ کے منتظر تعلیمی فیصلے۔"],
  ["Mark corrections", "تصحيحات الدرجات", "نمبروں کی تصحیحات"],
  ["Timetable & cover", "الجدول والبدلاء", "نظام الاوقات اور متبادل"],
  ["Curriculum & grading", "المنهج والتقدير", "نصاب اور درجہ بندی"],
  ["School calendar", "التقويم المدرسي", "اسکول کیلنڈر"],
  ["Learners", "المتعلمون", "طلبہ"],
  ["Promotion approval", "اعتماد الترفيع", "ترقی کی منظوری"],
  ["Report delivery", "إرسال الشهادات", "رپورٹوں کی ترسیل"],
  ["Objective map", "خريطة الأهداف", "مقاصد کا نقشہ"],
  ["Learning resources", "مصادر التعلم", "تعلیمی وسائل"],
  ["My leave", "إجازاتي", "میری رخصت"],
  ["This now lives with your campus admin.", "أصبح هذا الآن من مهام مدير الفرع.", "اب یہ آپ کے کیمپس منتظم کے پاس ہے۔"],
  ["Staff access and appointments are managed by your school's administrator.", "يدير مسؤول مدرستك صلاحيات الموظفين وتعييناتهم.", "عملے کی رسائی اور تقرریاں آپ کے اسکول کے منتظم کے زیرِ انتظام ہیں۔"],

  // ── Teaching ─────────────────────────────────────────────────────────────
  ["Tests & quizzes", "الاختبارات القصيرة", "ٹیسٹ اور کوئز"],
  ["Homework", "الواجبات المنزلية", "ہوم ورک"],
  ["My classes", "صفوفي", "میری جماعتیں"],
  ["Resources", "المصادر", "وسائل"],
  ["Calendar & meetings", "التقويم والاجتماعات", "کیلنڈر اور ملاقاتیں"],
  ["Today's trip", "رحلة اليوم", "آج کا سفر"],

  // ── Finance desk ─────────────────────────────────────────────────────────
  ["Collected today, outstanding, and what is waiting on you.", "ما حُصّل اليوم، والمستحقات، وما ينتظرك.", "آج کی وصولی، بقایا جات، اور جو آپ کا منتظر ہے۔"],
  ["Collect", "التحصيل", "فیس کی وصولی"],
  ["Record payments, print receipts, import bank statements and reconcile.", "سجّل المدفوعات واطبع الإيصالات واستورد كشوف البنك وطابقها.", "ادائیگیاں درج کریں، رسیدیں پرنٹ کریں، بینک اسٹیٹمنٹ درآمد کریں اور مطابقت کریں۔"],
  ["Generate invoices, set instalments and request adjustments.", "أصدر الفواتير وحدّد الأقساط واطلب التعديلات.", "بل بنائیں، اقساط مقرر کریں اور ترامیم کی درخواست دیں۔"],
  ["Reports & reminders", "التقارير والتذكيرات", "رپورٹیں اور یاد دہانیاں"],
  ["Books", "الدفاتر المالية", "مالی کھاتے"],
  ["Accounts & ledger", "الحسابات ودفتر الأستاذ", "اکاؤنٹس اور لیجر"],
  ["Tax packages", "الحزم الضريبية", "ٹیکس پیکجز"],
  ["Prepare the payroll run; your campus admin approves it.", "جهّز دورة الرواتب؛ ويعتمدها مدير الفرع.", "تنخواہوں کی تیاری کریں؛ منظوری آپ کے کیمپس منتظم دیتے ہیں۔"],
  ["Setup", "الإعداد", "سیٹ اپ"],
  ["Fee setup", "إعداد الرسوم", "فیس سیٹ اپ"],
  ["Payment corrections", "تصحيحات المدفوعات", "ادائیگی کی تصحیحات"],

  // ── Front desk ───────────────────────────────────────────────────────────
  ["Who is on site, callbacks due and pickups waiting.", "من في المبنى، والمكالمات المستحقة، والاستلامات المنتظرة.", "کون احاطے میں ہے، کن کالوں کا جواب واجب ہے اور کون سی وصولیاں منتظر ہیں۔"],
  ["Log enquiries and move applications forward; your campus admin makes offers.", "سجّل الاستفسارات وتابع الطلبات؛ ويقدّم مدير الفرع عروض القبول.", "استفسارات درج کریں اور درخواستیں آگے بڑھائیں؛ داخلے کی پیشکش آپ کے کیمپس منتظم دیتے ہیں۔"],
  ["Calls & post", "المكالمات والبريد", "کالیں اور ڈاک"],
  ["Post", "البريد", "ڈاک"],

  // ── Library ──────────────────────────────────────────────────────────────
  ["Catalogue & members", "الفهرس والأعضاء", "کیٹلاگ اور اراکین"],
  ["Inventory is managed by your campus admin.", "يدير مدير الفرع المخزون.", "انوینٹری آپ کے کیمپس منتظم کے زیرِ انتظام ہے۔"],

  // ── Family and learner ───────────────────────────────────────────────────
  ["Home", "الرئيسية", "ہوم"],
  ["Timetable & exams", "الجدول والامتحانات", "نظام الاوقات اور امتحانات"],
  ["Homework & resources", "الواجبات والمصادر", "ہوم ورک اور وسائل"],
  ["Activities & trips", "الأنشطة والرحلات", "سرگرمیاں اور دورے"],
  ["Pickup & transport", "الاستلام والنقل", "وصولی اور ٹرانسپورٹ"],
  ["Support plans", "خطط الدعم", "معاونت کے منصوبے"],
  ["My online exams", "اختباراتي الإلكترونية", "میرے آن لائن امتحانات"],
  ["Portfolio & goals", "ملف الإنجاز والأهداف", "پورٹ فولیو اور اہداف"],
  ["My class & subjects", "صفي وموادي", "میری جماعت اور مضامین"],
  ["Support plan", "خطة الدعم", "معاونت کا منصوبہ"],

  // ── Platform operations ──────────────────────────────────────────────────
  ["Commercial", "الشؤون التجارية", "تجارتی امور"],
  ["Trust & safety", "الثقة والأمان", "اعتماد اور تحفظ"],
  ["Tenant users", "مستخدمو المدارس", "اسکولوں کے صارفین"],
  ["Subscription requests", "طلبات الاشتراك", "سبسکرپشن کی درخواستیں"],
  ["Payment gateways", "بوابات الدفع", "ادائیگی کے گیٹ وے"],
  ["Plans & revenue", "الخطط والإيرادات", "پلان اور آمدنی"],
  ["Support access", "وصول الدعم", "سپورٹ رسائی"],
  ["Audit log", "سجل التدقيق", "آڈٹ لاگ"],

  // ── Shared primitives ────────────────────────────────────────────────────
  ["More actions", "إجراءات أخرى", "مزید اقدامات"],
  ["Not available with your access", "غير متاح بصلاحياتك", "آپ کی رسائی میں دستیاب نہیں"],
  ["Managed by {0}", "يديره {0}", "{0} کے زیرِ انتظام"],
  ["This workspace is not available with your current access.", "مساحة العمل هذه غير متاحة بصلاحياتك الحالية.", "آپ کی موجودہ رسائی میں یہ ورک اسپیس دستیاب نہیں۔"],

  // ── Header, scope, Help ──────────────────────────────────────────────────
  ["Acting academic lead", "القائم بأعمال القيادة الأكاديمية", "قائم مقام تعلیمی سربراہ"],
  ["Tour my workspace", "جولة في مساحة عملي", "میری ورک اسپیس کا تعارفی دورہ"],
  ["Tour this page", "جولة في هذه الصفحة", "اس صفحے کا تعارفی دورہ"],
  ["No tour is available here yet.", "لا تتوفر جولة هنا بعد.", "یہاں ابھی کوئی تعارفی دورہ دستیاب نہیں۔"],
  ["Replay welcome", "إعادة عرض الترحيب", "خوش آمدید دوبارہ دیکھیں"],
  ["Your role", "دورك", "آپ کا کردار"],
  ["Keyboard shortcuts", "اختصارات لوحة المفاتيح", "کی بورڈ شارٹ کٹس"],
  ["Report a problem", "الإبلاغ عن مشكلة", "مسئلہ رپورٹ کریں"],
  ["Ask facilities or IT to fix something.", "اطلب من فريق المرافق أو تقنية المعلومات إصلاح أمر ما.", "سہولیات یا آئی ٹی سے کچھ ٹھیک کرنے کی درخواست کریں۔"],
  ["Confidential: about a student's safety or wellbeing.", "سرّي: بشأن سلامة طالب أو رفاهه.", "رازدارانہ: کسی طالب علم کی حفاظت یا بہبود کے بارے میں۔"],
  ["Ask the school", "اسأل المدرسة", "اسکول سے پوچھیں"],
  ["Answers quoted from the school's current policies.", "إجابات مقتبسة من سياسات المدرسة الحالية.", "اسکول کی موجودہ پالیسیوں سے نقل کیے گئے جوابات۔"],
  ["Help & tour", "المساعدة والجولة", "مدد اور تعارفی دورہ"],
  ["A new tour is available", "تتوفر جولة جديدة", "ایک نیا تعارفی دورہ دستیاب ہے"],
  ["What you own", "ما تتولاه", "آپ کی ذمہ داریاں"],
  ["What you approve", "ما تعتمده", "آپ کیا منظور کرتے ہیں"],
  ["Who decides beyond you", "من يقرر بعدك", "آپ سے آگے کون فیصلہ کرتا ہے"],
  ["Collapse or expand the sidebar", "طي الشريط الجانبي أو توسيعه", "سائیڈ بار سمیٹیں یا پھیلائیں"],
  ["Open the command palette", "افتح لوحة الأوامر", "کمانڈ پیلٹ کھولیں"],
  ["Timetable, exams and report approvals, until a principal is appointed.", "الجدول والامتحانات واعتماد الشهادات، إلى أن يُعيَّن مدير أكاديمي.", "نظام الاوقات، امتحانات اور رپورٹوں کی منظوری، جب تک تعلیمی سربراہ مقرر نہ ہو۔"],
  ["Invoices and payments, until an accountant is appointed.", "الفواتير والمدفوعات، إلى أن يُعيَّن محاسب.", "بل اور ادائیگیاں، جب تک اکاؤنٹنٹ مقرر نہ ہو۔"],
  ["Visitors, calls and post, until a receptionist is on duty.", "الزوار والمكالمات والبريد، إلى أن يتوفر موظف استقبال.", "ملاقاتی، کالیں اور ڈاک، جب تک استقبالیہ عملہ موجود نہ ہو۔"],
  ["The library, until a librarian is appointed.", "المكتبة، إلى أن يُعيَّن أمين مكتبة.", "لائبریری، جب تک لائبریرین مقرر نہ ہو۔"],
  ["Campuses, campus leaders, group standards and school settings.", "الفروع وقادتها ومعايير المجموعة وإعدادات المدرسة.", "کیمپس، کیمپس کے سربراہان، گروپ کے معیارات اور اسکول کی ترتیبات۔"],
  ["The SkooleeAI subscription: plan, AI credits and payment method.", "اشتراك SkooleeAI: الخطة ورصيد الذكاء الاصطناعي وطريقة الدفع.", "SkooleeAI سبسکرپشن: پلان، اے آئی کریڈٹس اور ادائیگی کا طریقہ۔"],
  ["SkooleeAI support access, tax packages and group policy reviews.", "وصول دعم SkooleeAI والحزم الضريبية ومراجعات سياسة المجموعة.", "SkooleeAI سپورٹ رسائی، ٹیکس پیکجز اور گروپ پالیسی کے جائزے۔"],
  ["Your decisions are final and each one is recorded in the activity log.", "قراراتك نهائية ويُسجَّل كل منها في سجل النشاط.", "آپ کے فیصلے حتمی ہیں اور ہر فیصلہ سرگرمی کے ریکارڈ میں درج ہوتا ہے۔"],
  ["Daily operations of your school: students, staff, year setup and services.", "العمليات اليومية لمدرستك: الطلاب والموظفون وإعداد العام والخدمات.", "آپ کے اسکول کے روزمرہ امور: طلبہ، عملہ، سال کا سیٹ اپ اور خدمات۔"],
  ["People & access and school settings.", "الأشخاص والصلاحيات وإعدادات المدرسة.", "افراد اور رسائی، اور اسکول کی ترتیبات۔"],
  ["Fee adjustments, payroll, purchase requests, office staff leave and admission offers.", "تعديلات الرسوم والرواتب وطلبات الشراء وإجازات موظفي المكتب وعروض القبول.", "فیس کی ترامیم، تنخواہیں، خریداری کی درخواستیں، دفتری عملے کی رخصت اور داخلے کی پیشکشیں۔"],
  ["SkooleeAI support access and tax packages.", "وصول دعم SkooleeAI والحزم الضريبية.", "SkooleeAI سپورٹ رسائی اور ٹیکس پیکجز۔"],
  ["This campus: students, staff, year setup and campus services.", "هذا الفرع: الطلاب والموظفون وإعداد العام وخدمات الفرع.", "یہ کیمپس: طلبہ، عملہ، سال کا سیٹ اپ اور کیمپس کی خدمات۔"],
  ["Billing and school-wide settings stay with your school admin.", "تبقى الفوترة وإعدادات المدرسة العامة لدى مدير المدرسة.", "بلنگ اور پورے اسکول کی ترتیبات آپ کے اسکول منتظم کے پاس رہتی ہیں۔"],
  ["Billing and school-wide settings stay with your group admin.", "تبقى الفوترة وإعدادات المدرسة العامة لدى مدير المجموعة.", "بلنگ اور پورے اسکول کی ترتیبات آپ کے ادارے کے منتظم کے پاس رہتی ہیں۔"],
  ["Timetable, exams, results and report cards.", "الجدول والامتحانات والنتائج والشهادات المدرسية.", "نظام الاوقات، امتحانات، نتائج اور رپورٹ کارڈز۔"],
  ["Teacher performance and learning actions.", "أداء المعلمين وإجراءات التعلم.", "اساتذہ کی کارکردگی اور تعلیمی اقدامات۔"],
  ["Report cards, results, teachers' leave, mark corrections and promotion plans.", "الشهادات والنتائج وإجازات المعلمين وتصحيحات الدرجات وخطط الترفيع.", "رپورٹ کارڈز، نتائج، اساتذہ کی رخصت، نمبروں کی تصحیحات اور ترقی کے منصوبے۔"],
  ["No campus admin is appointed yet. Admissions, fee approvals and campus setup wait until one is appointed.", "لم يُعيَّن مدير للفرع بعد. تنتظر القبولات واعتماد الرسوم وإعداد الفرع إلى حين تعيينه.", "ابھی کوئی کیمپس منتظم مقرر نہیں ہوا۔ داخلے، فیس کی منظوریاں اور کیمپس سیٹ اپ تقرری تک رکے رہیں گے۔"],
  ["No campus admin is appointed. Admissions, fee approvals and campus setup wait until {0} appoints one.", "لم يُعيَّن مدير للفرع. تنتظر القبولات واعتماد الرسوم وإعداد الفرع إلى أن يعيّن {0} مديرًا.", "کوئی کیمپس منتظم مقرر نہیں۔ داخلے، فیس کی منظوریاں اور کیمپس سیٹ اپ اس وقت تک رکے رہیں گے جب تک {0} کسی کو مقرر نہ کریں۔"],
  ["School-wide decisions stay with {0}.", "تبقى القرارات على مستوى المدرسة بيد {0}.", "پورے اسکول کے فیصلے {0} کے پاس رہتے ہیں۔"],
  ["School-wide decisions stay with your institution's administrator.", "تبقى القرارات على مستوى المدرسة بيد مسؤول مؤسستك.", "پورے اسکول کے فیصلے آپ کے ادارے کے منتظم کے پاس رہتے ہیں۔"],
  ["Loading your role", "جارٍ تحميل دورك", "آپ کا کردار لوڈ ہو رہا ہے"],
  ["Admissions, fees and campus setup belong to your campus admin.", "القبول والرسوم وإعداد الفرع من مهام مدير الفرع.", "داخلے، فیس اور کیمپس سیٹ اپ آپ کے کیمپس منتظم کی ذمہ داری ہیں۔"],
  ["Registers, marks, homework and class tests for your classes.", "سجلات الحضور والدرجات والواجبات واختبارات صفوفك.", "آپ کی جماعتوں کے حاضری رجسٹر، نمبر، ہوم ورک اور جماعتی ٹیسٹ۔"],
  ["Absence explanations from families.", "مبررات الغياب المقدمة من الأسر.", "خاندانوں کی جانب سے غیر حاضری کی وضاحتیں۔"],
  ["Your academic lead approves report remarks, mark corrections and leave.", "يعتمد قائدك الأكاديمي ملاحظات الشهادات وتصحيحات الدرجات والإجازات.", "رپورٹ کے تبصرے، نمبروں کی تصحیحات اور رخصت آپ کے تعلیمی سربراہ منظور کرتے ہیں۔"],
  ["Invoices, payments, receipts, the ledger and payroll preparation.", "الفواتير والمدفوعات والإيصالات ودفتر الأستاذ وتجهيز الرواتب.", "بل، ادائیگیاں، رسیدیں، لیجر اور تنخواہوں کی تیاری۔"],
  ["Nothing: you prepare the work and others decide.", "لا شيء: أنت تجهّز العمل وغيرك يقرر.", "کچھ نہیں: آپ کام تیار کرتے ہیں اور فیصلہ دوسرے کرتے ہیں۔"],
  ["Your campus admin approves refunds, waivers and payroll; the school's administrator signs off tax packages.", "يعتمد مدير الفرع المبالغ المستردة والإعفاءات والرواتب؛ ويعتمد مسؤول المدرسة الحزم الضريبية.", "رقم کی واپسی، چھوٹ اور تنخواہیں آپ کے کیمپس منتظم منظور کرتے ہیں؛ ٹیکس پیکجز کی منظوری اسکول کے منتظم دیتے ہیں۔"],
  ["Visitors, pickup, calls, post, complaint intake and certificates.", "الزوار والاستلام والمكالمات والبريد واستقبال الشكاوى والشهادات.", "ملاقاتی، بچوں کی وصولی، کالیں، ڈاک، شکایات کا اندراج اور اسناد۔"],
  ["Nothing: unusual pickups and complaints go to your campus admin.", "لا شيء: حالات الاستلام غير المعتادة والشكاوى تُحال إلى مدير الفرع.", "کچھ نہیں: غیر معمولی وصولیاں اور شکایات آپ کے کیمپس منتظم کو جاتی ہیں۔"],
  ["Your campus admin makes admission offers and handles escalated complaints.", "يقدّم مدير الفرع عروض القبول ويتولى الشكاوى المصعَّدة.", "داخلے کی پیشکش اور بڑھائی گئی شکایات آپ کے کیمپس منتظم دیکھتے ہیں۔"],
  ["Lending, returns, the catalogue and library members.", "الإعارة والإرجاع والفهرس وأعضاء المكتبة.", "اجرا، واپسی، کیٹلاگ اور لائبریری کے اراکین۔"],
  ["Nothing: library charges are handed to the fees office.", "لا شيء: تُحال رسوم المكتبة إلى مكتب الرسوم.", "کچھ نہیں: لائبریری کے واجبات فیس کے دفتر کو دیے جاتے ہیں۔"],
  ["Your campus admin can waive library charges.", "يمكن لمدير الفرع الإعفاء من رسوم المكتبة.", "آپ کے کیمپس منتظم لائبریری کے واجبات معاف کر سکتے ہیں۔"],
  ["The platform: schools, pricing, payment gateways and the audit log.", "المنصة: المدارس والأسعار وبوابات الدفع وسجل التدقيق.", "پلیٹ فارم: اسکول، قیمتیں، ادائیگی کے گیٹ وے اور آڈٹ لاگ۔"],
  ["Subscription requests from schools.", "طلبات الاشتراك الواردة من المدارس.", "اسکولوں کی سبسکرپشن کی درخواستیں۔"],
  ["Support access to a school works only within a grant that school approves.", "لا يعمل وصول الدعم إلى مدرسة إلا ضمن إذن توافق عليه تلك المدرسة.", "کسی اسکول تک سپورٹ رسائی صرف اسی اجازت کے اندر کام کرتی ہے جو وہ اسکول منظور کرے۔"],
  ["Notifications, {0} unread", "الإشعارات، {0} غير مقروءة", "اطلاعات، {0} غیر پڑھی ہوئی"],
  ["Sign out with unsynced changes?", "تسجيل الخروج مع وجود تغييرات غير متزامنة؟", "غیر ہم آہنگ تبدیلیوں کے ساتھ سائن آؤٹ کریں؟"],
  ["{0} changes on this device are not synced yet. Signing out removes them from this device and cannot be undone.", "{0} من التغييرات على هذا الجهاز لم تُزامَن بعد. سيؤدي تسجيل الخروج إلى حذفها من هذا الجهاز ولا يمكن التراجع عن ذلك.", "اس ڈیوائس پر {0} تبدیلیاں ابھی ہم آہنگ نہیں ہوئیں۔ سائن آؤٹ کرنے سے یہ اس ڈیوائس سے ہٹ جائیں گی اور یہ عمل واپس نہیں ہو سکتا۔"],

  // ── /403 ─────────────────────────────────────────────────────────────────
  ["This lives in another workspace", "هذه الصفحة تتبع مساحة عمل أخرى", "یہ کسی اور ورک اسپیس کا حصہ ہے"],
  ["Access restricted", "الوصول مقيّد", "رسائی محدود ہے"],
  ["Sign in with an account that can open this page.", "سجّل الدخول بحساب يمكنه فتح هذه الصفحة.", "ایسے اکاؤنٹ سے سائن اِن کریں جو یہ صفحہ کھول سکتا ہو۔"],
  ["Your account opens a different workspace. Your own dashboard has everything you manage.", "حسابك يفتح مساحة عمل مختلفة. لوحتك تضم كل ما تديره.", "آپ کا اکاؤنٹ ایک مختلف ورک اسپیس کھولتا ہے۔ آپ کے ڈیش بورڈ میں وہ سب کچھ ہے جس کا آپ انتظام کرتے ہیں۔"],
  ["Your account cannot open this page. Your own dashboard has your work; ask your school's administrator if you need more access.", "لا يمكن لحسابك فتح هذه الصفحة. لوحتك تضم عملك؛ اطلب من مسؤول مدرستك صلاحيات إضافية إن احتجت إليها.", "آپ کا اکاؤنٹ یہ صفحہ نہیں کھول سکتا۔ آپ کا کام آپ کے ڈیش بورڈ میں ہے؛ مزید رسائی درکار ہو تو اپنے اسکول کے منتظم سے کہیں۔"],
  ["Go to my dashboard", "العودة إلى مساحة عملي", "اپنی کام کی جگہ پر واپس جائیں"],
  ["Back to login", "العودة إلى تسجيل الدخول", "لاگ اِن پر واپس جائیں"],

  // ── Framed routes ────────────────────────────────────────────────────────
  // /exam-delivery PageHeader description (the same sentence as the Safe Exam Browser copy's summary).
  ["Tested Safe Exam Browser profiles for secure exams. Only keys reported by a tested client are trusted.", "ملفات Safe Exam Browser مُختبرة للامتحانات الآمنة. لا يُوثق إلا بالمفاتيح التي يبلغ عنها عميل مُختبر.", "محفوظ امتحانات کے لیے آزمودہ Safe Exam Browser پروفائل۔ صرف آزمودہ کلائنٹ کی بتائی گئی کیز پر اعتماد کیا جاتا ہے۔"],

  // ── Paused plan (§2.1 note 2): RoleShell's Billing & plan fence for a non-payer while the plan is paused ──
  // Same wording as the consoles' own paused notices and /subscription-suspended (P4, P5 carry identical entries).
  ["Your plan is paused", "خطتك متوقفة مؤقتاً", "آپ کا پلان معطل ہے"],
  ["Your plan is paused. {0} can renew it.", "خطتك متوقفة مؤقتًا. يمكن لـ {0} تجديدها.", "آپ کا پلان عارضی طور پر رکا ہوا ہے۔ {0} اس کی تجدید کر سکتے ہیں۔"],

  // ── Flagships (addendum 2026-10-22) ──────────────────────────────────────
  // Registry rows directly after Today and their PageHeader descriptions; "Your role" lines in Help.
  ["AI Workflows", "مسارات الذكاء الاصطناعي", "اے آئی ورک فلوز"],
  ["Exam Studio", "استوديو الاختبارات", "ایگزام اسٹوڈیو"],
  ["Answer a few questions and AI drafts your school's setup and routine work; nothing applies until you approve it.", "أجب عن بضعة أسئلة فيُعدّ الذكاء الاصطناعي مسودة إعداد مدرستك وأعمالها الروتينية؛ ولا يُطبَّق شيء قبل موافقتك.", "چند سوالوں کے جواب دیں، اے آئی آپ کے اسکول کے سیٹ اپ اور روزمرہ کام کا مسودہ بنا دیتا ہے؛ آپ کی منظوری سے پہلے کچھ لاگو نہیں ہوتا۔"],
  ["Build assessments with AI, deliver them securely, mark them and plan learning recovery.", "أنشئ التقييمات بالذكاء الاصطناعي، وقدّمها بأمان، وصحّحها، وخطّط لتعويض الفاقد التعليمي.", "اے آئی سے جائزے بنائیں، انہیں محفوظ طریقے سے منعقد کریں، جانچیں اور سیکھنے کی بحالی کی منصوبہ بندی کریں۔"],
  ["AI Workflows: AI drafts your school's setup and routine runs; nothing applies until you approve it.", "مسارات الذكاء الاصطناعي: يُعدّ الذكاء الاصطناعي مسودة إعداد مدرستك والمهام الدورية؛ ولا يُطبَّق شيء قبل موافقتك.", "اے آئی ورک فلوز: اے آئی آپ کے اسکول کے سیٹ اپ اور معمول کے کاموں کا مسودہ بناتا ہے؛ آپ کی منظوری سے پہلے کچھ لاگو نہیں ہوتا۔"],
  ["Exam Studio: AI-built assessments, secure delivery, marking and learning recovery.", "استوديو الاختبارات: تقييمات يبنيها الذكاء الاصطناعي، وتقديم آمن، وتصحيح، وتعويض للفاقد التعليمي.", "ایگزام اسٹوڈیو: اے آئی سے بنے جائزے، محفوظ انعقاد، جانچ اور سیکھنے کی بحالی۔"],
  // ScopeBadge's chip for the account owner (§1.5 "Owner" badge): its own key, because the reviewed "Owner" is a task
  // owner (المسؤول / ذمہ دار). Same values as P9's entry.
  ["Account owner", "مالك الحساب", "اکاؤنٹ کا مالک"],
  // A newly arrived action item, announced to screen readers (the bell's visual cue is its shake and count).
  ["New notification: {0}", "إشعار جديد: {0}", "نئی اطلاع: {0}"],

  // ── Messages ─────────────────────────────────────────────────────────────
  ["Conversations with families and colleagues stay on the school record.", "تبقى المحادثات مع الأسر والزملاء ضمن سجل المدرسة.", "خاندانوں اور ساتھیوں سے گفتگو اسکول کے ریکارڈ میں محفوظ رہتی ہے۔"],
];

export const arabicP2Ui: Record<string, string> = Object.fromEntries(entries.map(([en, ar]) => [en, ar]));

export const urduP2Ui: Record<string, string> = Object.fromEntries(entries.map(([en, , ur]) => [en, ur]));
