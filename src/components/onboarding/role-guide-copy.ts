import type { Language } from "@/lib/locale/package";
import type { UserRole } from "@/lib/roles";
import type { GuideScene } from "./stage-copy";

type Localized = readonly [string, string, string];
type Scene = {
  caption: Localized;
  status: Localized;
  cards: readonly [Localized, Localized, Localized];
};
type Narrative = {
  title: Localized;
  introduction: Localized;
  preparationTitle: Localized;
  preparation: Localized;
  scopeTitle: Localized;
  scopeHint: Localized;
  reviewTitle: Localized;
  reviewHint: Localized;
  chooseTitle: Localized;
  greeting: Localized;
  scenes: readonly [Scene, Scene, Scene];
};

// These are orientation scenes, not claims that records, assignments or AI drafts already exist.
const narratives: Record<UserRole, Narrative> = {
  SUPER_ADMIN: {
    title: ["Your vision. A school ready to grow.", "رؤيتك. مدرسة مستعدة للنمو.", "آپ کا وژن۔ ترقی کے لیے تیار اسکول۔"],
    introduction: ["You set the direction. Start with your institution, connect its campuses, then shape the plans your teams will review.", "أنت تحدد الاتجاه. ابدأ بمؤسستك واربط فروعها ثم جهّز الخطط التي ستراجعها فرقك.", "آپ سمت طے کرتے ہیں۔ ادارے سے آغاز کریں، کیمپس جوڑیں، پھر ٹیموں کے جائزے کے لیے منصوبے تیار کریں۔"],
    preparationTitle: ["Start with a strong foundation", "ابدأ بأساس متين", "مضبوط بنیاد سے آغاز کریں"],
    preparation: ["Have your school details, first campus and academic dates ready. Build one campus at a time.", "جهّز بيانات المدرسة والفرع الأول والتواريخ الدراسية. أعدّ كل فرع على حدة.", "اسکول کی تفصیلات، پہلا کیمپس اور تعلیمی تاریخیں تیار رکھیں۔ ایک وقت میں ایک کیمپس تیار کریں۔"],
    scopeTitle: ["The institution comes first", "المؤسسة أولًا", "پہلے ادارے کی بنیاد"],
    scopeHint: ["Choose the correct campus before planning. Each campus keeps its own setup and assignments.", "اختر الفرع الصحيح قبل التخطيط. لكل فرع إعداداته وتكليفاته.", "منصوبہ بندی سے پہلے درست کیمپس چنیں۔ ہر کیمپس کی ترتیب اور ذمہ داریاں الگ ہیں۔"],
    reviewTitle: ["Your team owns the final decision", "القرار النهائي لفريقك", "حتمی فیصلہ آپ کی ٹیم کا ہے"],
    reviewHint: ["AI can prepare drafts in your available workflows. Check dates, staffing and school policies before applying them.", "يمكن للذكاء إعداد مسودات ضمن المسارات المتاحة لك. راجع التواريخ والموظفين وسياسات المدرسة قبل التطبيق.", "دستیاب ورک فلوز میں اے آئی مسودے تیار کر سکتا ہے۔ لاگو کرنے سے پہلے تاریخیں، عملہ اور اسکول کی پالیسیاں دیکھیں۔"],
    chooseTitle: ["Choose where your school begins", "اختر بداية مدرستك", "اسکول کے آغاز کا راستہ چنیں"],
    greeting: ["Let’s turn your school vision into a practical first step.", "لنحوّل رؤيتك للمدرسة إلى خطوة عملية.", "آئیں اسکول کے وژن کو پہلے عملی قدم میں بدلیں۔"],
    scenes: [
      {
        caption: ["Your school’s next chapter starts with you.", "الفصل التالي لمدرستك يبدأ بك.", "اسکول کے نئے باب کا آغاز آپ سے۔"],
        status: ["Meet your institution guide", "تعرّف إلى دليل مؤسستك", "ادارے کے رہنما سے ملیں"],
        cards: [["Your institution", "مؤسستك", "آپ کا ادارہ"], ["Your campuses", "فروعك", "آپ کے کیمپس"], ["Your school community", "مجتمع مدرستك", "آپ کا اسکول خاندان"]],
      },
      {
        caption: ["Give your plans a clear foundation.", "امنح خططك أساسًا واضحًا.", "منصوبوں کو واضح بنیاد دیں۔"],
        status: ["Prepare the details that matter", "جهّز التفاصيل الأساسية", "ضروری تفصیلات تیار کریں"],
        cards: [["School identity", "هوية المدرسة", "اسکول کی شناخت"], ["First campus details", "بيانات الفرع الأول", "پہلے کیمپس کی تفصیلات"], ["Academic dates", "التواريخ الدراسية", "تعلیمی تاریخیں"]],
      },
      {
        caption: ["Choose a campus, then take the next useful step.", "اختر فرعًا ثم انتقل إلى الخطوة المفيدة التالية.", "کیمپس چنیں، پھر اگلا مفید قدم اٹھائیں۔"],
        status: ["Open your institution workspace", "افتح مساحة مؤسستك", "ادارے کی ورک اسپیس کھولیں"],
        cards: [["Confirm the foundation", "أكد الأساس", "بنیاد کی تصدیق"], ["Explore available plans", "استكشف الخطط المتاحة", "دستیاب منصوبے دیکھیں"], ["Review before applying", "راجع قبل التطبيق", "لاگو کرنے سے پہلے جائزہ"]],
      },
    ],
  },
  ADMIN: {
    title: ["Bring your school’s moving parts together.", "اجمع تفاصيل مدرستك في مكان واحد.", "اسکول کے تمام کاموں کو مربوط کریں۔"],
    introduction: ["People, records and schedules meet at your desk. Start with your assigned campus and find the next task your team needs.", "يلتقي الأشخاص والسجلات والجداول عند مكتبك. ابدأ بفرعك المعيّن وحدد المهمة التالية لفريقك.", "افراد، ریکارڈ اور اوقات آپ کے دفتر سے جڑتے ہیں۔ اپنے مقررہ کیمپس سے آغاز کریں اور ٹیم کا اگلا ضروری کام دیکھیں۔"],
    preparationTitle: ["Get the school details together", "اجمع بيانات المدرسة", "اسکول کی تفصیلات یکجا کریں"],
    preparation: ["Check campus contacts, grade lists and term dates. Keep the staff information you need for school coordination ready.", "راجع جهات اتصال الفرع والصفوف وتواريخ الفصل. جهّز بيانات الموظفين اللازمة للتنسيق.", "کیمپس کے رابطے، جماعتیں اور تعلیمی تاریخیں دیکھیں۔ اسکول کے کاموں کے لیے متعلقہ عملے کی معلومات تیار رکھیں۔"],
    scopeTitle: ["Coordinate within your assigned campus", "نسّق ضمن فرعك المعيّن", "اپنے مقررہ کیمپس میں انتظام کریں"],
    scopeHint: ["Your tools follow your campus assignment and school permissions. If either is missing, ask the institution owner to check your access.", "تتبع أدواتك الفرع المعيّن وصلاحيات المدرسة. عند وجود نقص، اطلب من مالك المؤسسة مراجعة صلاحياتك.", "سہولتیں مقررہ کیمپس اور اسکول کی اجازت کے مطابق ہیں۔ کمی ہو تو ادارے کے مالک سے رسائی چیک کروائیں۔"],
    reviewTitle: ["Check the details before they spread", "تحقق من التفاصيل قبل اعتمادها", "منظوری سے پہلے تفصیلات دیکھیں"],
    reviewHint: ["Review any AI draft against school records. Confirm names, dates and recipients before applying or sending changes.", "طابق أي مسودة ذكية مع سجلات المدرسة. أكد الأسماء والتواريخ والمستلمين قبل التطبيق أو الإرسال.", "اے آئی کے مسودے کو اسکول ریکارڈ سے ملائیں۔ تبدیلی لاگو یا ارسال کرنے سے پہلے نام، تاریخیں اور وصول کنندگان چیک کریں۔"],
    chooseTitle: ["Choose your first coordination task", "اختر أول مهمة تنسيق", "انتظام کا پہلا کام چنیں"],
    greeting: ["Let’s make your next school task easier to find.", "لنجعل العثور على مهمتك المدرسية التالية أسهل.", "آئیں اسکول کا اگلا کام آسانی سے تلاش کریں۔"],
    scenes: [
      {
        caption: ["You keep the school connected.", "أنت تحافظ على ترابط المدرسة.", "آپ اسکول کے کاموں کو جوڑتے ہیں۔"],
        status: ["Meet your school coordination guide", "تعرّف إلى دليل التنسيق المدرسي", "اسکول انتظام کے رہنما سے ملیں"],
        cards: [["School operations", "عمليات المدرسة", "اسکول کے انتظامی کام"], ["Campus contacts", "جهات اتصال الفروع", "کیمپس کے رابطے"], ["Team responsibilities", "مسؤوليات الفريق", "ٹیم کی ذمہ داریاں"]],
      },
      {
        caption: ["Good coordination starts with accurate records.", "التنسيق الجيد يبدأ بسجلات دقيقة.", "بہتر انتظام درست ریکارڈ سے شروع ہوتا ہے۔"],
        status: ["Prepare your school context", "جهّز سياق مدرستك", "اسکول کا سیاق تیار کریں"],
        cards: [["Confirm your campus", "أكد فرعك", "کیمپس کی تصدیق"], ["Check school details", "راجع بيانات المدرسة", "اسکول کی تفصیلات دیکھیں"], ["Gather term dates", "اجمع تواريخ الفصل", "تعلیمی تاریخیں یکجا کریں"]],
      },
      {
        caption: ["Pick the task that helps your team today.", "اختر المهمة التي تفيد فريقك اليوم.", "آج اپنی ٹیم کے لیے مفید کام چنیں۔"],
        status: ["Your coordination workspace awaits", "مساحة التنسيق بانتظارك", "انتظامی ورک اسپیس کھولیں"],
        cards: [["Review campus records", "راجع سجلات الفرع", "کیمپس کا ریکارڈ دیکھیں"], ["Open permitted workflows", "افتح المسارات المسموحة", "مجاز ورک فلوز کھولیں"], ["Confirm before sharing", "أكد قبل المشاركة", "شیئر کرنے سے پہلے تصدیق"]],
      },
    ],
  },
  CAMPUS_ADMIN: {
    title: ["Your campus. Ready for the school day.", "فرعك. مستعد لليوم الدراسي.", "آپ کا کیمپس۔ اسکول کے دن کے لیے تیار۔"],
    introduction: ["You make the campus work day to day. Bring together its people, spaces and academic plans, starting with the details you know best.", "أنت تدير عمل الفرع يومًا بيوم. اجمع أفراده ومرافقه وخططه الدراسية، بدءًا بالتفاصيل التي تعرفها.", "آپ کیمپس کا روزمرہ نظام چلاتے ہیں۔ افراد، جگہوں اور تعلیمی منصوبوں کو اپنی معلومات سے جوڑیں۔"],
    preparationTitle: ["Have your campus essentials ready", "جهّز أساسيات فرعك", "کیمپس کی ضروری معلومات تیار رکھیں"],
    preparation: ["Gather grades, working days, term dates and staff details. Where AI setup is available, your answers can shape drafts for review.", "اجمع الصفوف وأيام العمل وتواريخ الفصل وبيانات الموظفين. عند توفر الإعداد بالذكاء، تصوغ إجاباتك مسودات للمراجعة.", "جماعتیں، کام کے دن، تعلیمی تاریخیں اور عملے کی تفصیلات جمع کریں۔ اے آئی ترتیب دستیاب ہو تو جوابوں سے قابلِ جائزہ مسودے بن سکتے ہیں۔"],
    scopeTitle: ["Keep this campus in focus", "ركّز على هذا الفرع", "اسی کیمپس پر توجہ رکھیں"],
    scopeHint: ["Confirm your assigned campus before setup. A missing campus link needs your school administrator’s help.", "أكد الفرع المعيّن لك قبل الإعداد. يلزم مسؤول المدرسة لإكمال ربط الفرع الناقص.", "ترتیب سے پہلے مقررہ کیمپس کی تصدیق کریں۔ کیمپس منسلک نہ ہو تو اسکول منتظم سے مدد لیں۔"],
    reviewTitle: ["Make every draft fit your campus", "اجعل كل مسودة مناسبة لفرعك", "ہر مسودے کو اپنے کیمپس کے مطابق بنائیں"],
    reviewHint: ["Check proposed grades, staffing and schedules against your campus records before approving changes.", "طابق الصفوف والموظفين والجداول المقترحة مع سجلات الفرع قبل اعتماد التغييرات.", "تبدیلی منظور کرنے سے پہلے مجوزہ جماعتیں، عملہ اور اوقات کیمپس کے ریکارڈ سے ملائیں۔"],
    chooseTitle: ["Choose your campus’s next step", "اختر الخطوة التالية لفرعك", "کیمپس کا اگلا قدم چنیں"],
    greeting: ["Let’s get your campus details working together.", "لنجمع تفاصيل فرعك في صورة واضحة.", "آئیں کیمپس کی تفصیلات کو مربوط کریں۔"],
    scenes: [
      {
        caption: ["A well-run campus starts with your local knowledge.", "فرع منظّم يبدأ بمعرفتك بتفاصيله.", "منظم کیمپس کا آغاز آپ کی مقامی معلومات سے۔"],
        status: ["Meet your campus operations guide", "تعرّف إلى دليل إدارة الفرع", "کیمپس انتظام کے رہنما سے ملیں"],
        cards: [["Your campus team", "فريق فرعك", "آپ کے کیمپس کی ٹیم"], ["Rooms & resources", "الغرف والموارد", "کمرے اور وسائل"], ["The campus day", "يوم الفرع", "کیمپس کا روزمرہ دن"]],
      },
      {
        caption: ["Bring the details. Shape a plan you can check.", "قدّم التفاصيل وصغ خطة يمكنك مراجعتها.", "تفصیلات دیں اور قابلِ جائزہ منصوبہ بنائیں۔"],
        status: ["Prepare your campus details", "جهّز تفاصيل فرعك", "کیمپس کی تفصیلات تیار کریں"],
        cards: [["Grades & subjects", "الصفوف والمواد", "جماعتیں اور مضامین"], ["Working days & terms", "أيام العمل والفصول", "کام کے دن اور تعلیمی ادوار"], ["Staff & resources", "الموظفون والموارد", "عملہ اور وسائل"]],
      },
      {
        caption: ["Choose an available campus task and take it one step at a time.", "اختر مهمة فرع متاحة وتابعها خطوة بخطوة.", "کیمپس کا دستیاب کام چنیں اور قدم بہ قدم آگے بڑھیں۔"],
        status: ["Open your campus workspace", "افتح مساحة فرعك", "کیمپس کی ورک اسپیس کھولیں"],
        cards: [["Check campus details", "راجع تفاصيل الفرع", "کیمپس کی تفصیلات دیکھیں"], ["Explore available setup", "استكشف الإعداد المتاح", "دستیاب ترتیب دیکھیں"], ["Review before applying", "راجع قبل التطبيق", "لاگو کرنے سے پہلے جائزہ"]],
      },
    ],
  },
  PRINCIPAL: {
    title: ["Lead the learning. See the whole picture.", "قُد التعلّم. شاهد الصورة كاملة.", "تعلیم کی قیادت کریں۔ پوری تصویر دیکھیں۔"],
    introduction: ["Your focus is the learning day. Start with academic structure, teaching responsibilities and the plans that need your judgment.", "تركيزك هو اليوم التعليمي. ابدأ بالبنية الأكاديمية ومسؤوليات التدريس والخطط التي تحتاج إلى حكمك.", "آپ کی توجہ تعلیمی دن پر ہے۔ تعلیمی ترتیب، تدریسی ذمہ داریوں اور اپنے جائزے کے منتظر منصوبوں سے آغاز کریں۔"],
    preparationTitle: ["Bring your academic priorities", "جهّز أولوياتك الأكاديمية", "اپنی تعلیمی ترجیحات تیار رکھیں"],
    preparation: ["Check grades, subjects, term dates and teaching needs. Use the tools your school has made available for academic planning.", "راجع الصفوف والمواد وتواريخ الفصل واحتياجات التدريس. استخدم أدوات التخطيط الأكاديمي التي تتيحها مدرستك.", "جماعتیں، مضامین، تعلیمی تاریخیں اور تدریسی ضروریات دیکھیں۔ منصوبہ بندی کے لیے اسکول کی دستیاب سہولتیں استعمال کریں۔"],
    scopeTitle: ["Lead within your campus context", "قُد ضمن سياق فرعك", "اپنے کیمپس کے سیاق میں قیادت کریں"],
    scopeHint: ["Academic views follow your assigned campus and permissions. Ask your school administrator to correct missing access or assignments.", "تتبع الصفحات الأكاديمية فرعك وصلاحياتك. اطلب من مسؤول المدرسة تصحيح الوصول أو التكليفات الناقصة.", "تعلیمی صفحات مقررہ کیمپس اور اجازت کے مطابق ہیں۔ نامکمل رسائی یا ذمہ داریاں اسکول منتظم سے درست کروائیں۔"],
    reviewTitle: ["Keep educational judgment human", "القرار التربوي يبقى بيدك", "تعلیمی فیصلہ آپ کے پاس رہے"],
    reviewHint: ["Treat AI plans as drafts. Check curriculum fit, teacher workload and practical schedules before approving them.", "تعامل مع خطط الذكاء كمسودات. راجع توافق المنهج وأعباء المعلمين وإمكانية تنفيذ الجداول قبل الاعتماد.", "اے آئی کے منصوبوں کو مسودہ سمجھیں۔ منظوری سے پہلے نصاب، اساتذہ کے کام اور قابلِ عمل اوقات دیکھیں۔"],
    chooseTitle: ["Choose your first academic focus", "اختر أول أولوية أكاديمية", "پہلی تعلیمی ترجیح چنیں"],
    greeting: ["Let’s find the next step for your teaching community.", "لنجد الخطوة التالية لمجتمعك التعليمي.", "آئیں اپنے تعلیمی حلقے کا اگلا قدم تلاش کریں۔"],
    scenes: [
      {
        caption: ["Your leadership gives the learning day direction.", "قيادتك تمنح اليوم التعليمي اتجاهه.", "آپ کی قیادت تعلیمی دن کو سمت دیتی ہے۔"],
        status: ["Meet your academic leadership guide", "تعرّف إلى دليل القيادة الأكاديمية", "تعلیمی قیادت کے رہنما سے ملیں"],
        cards: [["Academic direction", "التوجه الأكاديمي", "تعلیمی سمت"], ["Teaching community", "مجتمع المعلمين", "تدریسی حلقہ"], ["Learning structure", "بنية التعلم", "تعلیمی ترتیب"]],
      },
      {
        caption: ["Put curriculum, people and time in context.", "اربط المنهج والأفراد والوقت بالسياق.", "نصاب، افراد اور وقت کو ایک سیاق میں دیکھیں۔"],
        status: ["Prepare for academic decisions", "استعد للقرارات الأكاديمية", "تعلیمی فیصلوں کی تیاری"],
        cards: [["Curriculum & subjects", "المنهج والمواد", "نصاب اور مضامین"], ["Teaching responsibilities", "مسؤوليات التدريس", "تدریسی ذمہ داریاں"], ["Term & timetable needs", "احتياجات الفصل والجدول", "تعلیمی دور اور اوقات کی ضروریات"]],
      },
      {
        caption: ["Choose the academic work that needs your attention.", "اختر العمل الأكاديمي الذي يحتاج إلى اهتمامك.", "وہ تعلیمی کام چنیں جو آپ کی توجہ چاہتا ہے۔"],
        status: ["Open your leadership workspace", "افتح مساحة القيادة", "قیادت کی ورک اسپیس کھولیں"],
        cards: [["Review academic structure", "راجع البنية الأكاديمية", "تعلیمی ترتیب دیکھیں"], ["Explore planning tools", "استكشف أدوات التخطيط", "منصوبہ بندی کی سہولتیں دیکھیں"], ["Check before approval", "تحقق قبل الاعتماد", "منظوری سے پہلے تصدیق"]],
      },
    ],
  },
  TEACHER: {
    title: ["Your classroom. Your next great lesson.", "صفك. درسك المميز القادم.", "آپ کی جماعت۔ آپ کا اگلا بہترین سبق۔"],
    introduction: ["Your teaching starts here. Check your profile and school assignments, then find the tools for the classes and subjects you teach.", "تدريسك يبدأ هنا. راجع ملفك وتكليفات المدرسة ثم اعثر على أدوات الصفوف والمواد التي تدرّسها.", "تدریس کا آغاز یہاں سے کریں۔ پروفائل اور اسکول کی ذمہ داریاں دیکھیں، پھر اپنی جماعتوں اور مضامین کی سہولتیں کھولیں۔"],
    preparationTitle: ["Make your teaching profile yours", "أكمل ملفك التدريسي", "تدریسی پروفائل اپنے مطابق بنائیں"],
    preparation: ["Confirm your contact details and teaching specialties. Check the classes and subjects assigned by your school.", "أكد بيانات التواصل وتخصصاتك التدريسية. راجع الصفوف والمواد التي تعيّنها مدرستك.", "رابطے اور تدریسی مہارتوں کی تصدیق کریں۔ اسکول کی مقرر کردہ جماعتیں اور مضامین دیکھیں۔"],
    scopeTitle: ["Your classes come from your school", "مدرستك تعيّن صفوفك", "جماعتیں آپ کا اسکول مقرر کرتا ہے"],
    scopeHint: ["No class or subject yet? Ask the school office to link your teaching assignments. This guide does not create them.", "لم يظهر صف أو مادة بعد؟ اطلب من الإدارة ربط تكليفاتك التدريسية. هذا الدليل لا ينشئها.", "ابھی جماعت یا مضمون نہیں؟ اسکول دفتر سے تدریسی ذمہ داریاں منسلک کروائیں۔ یہ رہنمائی خود انہیں نہیں بناتی۔"],
    reviewTitle: ["Keep your teaching judgment", "حافظ على حكمك التربوي", "تدریسی فیصلہ آپ کا ہے"],
    reviewHint: ["When AI tools are available, check every draft for accuracy, subject coverage and suitability before using it with students.", "عند توفر أدوات الذكاء، راجع دقة كل مسودة وتغطيتها للمادة وملاءمتها قبل استخدامها مع الطلاب.", "اے آئی سہولت دستیاب ہو تو طلبہ کے لیے استعمال سے پہلے ہر مسودے کی درستگی، مضمون اور موزونیت دیکھیں۔"],
    chooseTitle: ["Choose your next teaching step", "اختر خطوتك التدريسية التالية", "تدریس کا اگلا قدم چنیں"],
    greeting: ["Let’s get you ready for your next teaching day.", "لنستعد ليومك التدريسي التالي.", "آئیں آپ کے اگلے تدریسی دن کی تیاری کریں۔"],
    scenes: [
      {
        caption: ["Good teaching starts with a space that knows your role.", "التدريس الجيد يبدأ بمساحة تناسب دورك.", "بہتر تدریس کا آغاز آپ کے کردار کی جگہ سے۔"],
        status: ["Meet your teaching guide", "تعرّف إلى دليلك التدريسي", "تدریسی رہنما سے ملیں"],
        cards: [["Your teaching profile", "ملفك التدريسي", "آپ کا تدریسی پروفائل"], ["Your assigned classes", "صفوفك المعيّنة", "آپ کی مقررہ جماعتیں"], ["Your subject knowledge", "معرفتك بالمادة", "آپ کا مضمون پر عبور"]],
      },
      {
        caption: ["Check your assignments before preparing the lesson.", "راجع تكليفاتك قبل تجهيز الدرس.", "سبق تیار کرنے سے پہلے ذمہ داریاں دیکھیں۔"],
        status: ["Prepare for your classroom", "استعد لصفك", "اپنی جماعت کی تیاری کریں"],
        cards: [["Profile & specialties", "الملف والتخصصات", "پروفائل اور مہارتیں"], ["Classes & subjects", "الصفوف والمواد", "جماعتیں اور مضامین"], ["Teaching timetable", "جدول التدريس", "تدریسی ٹائم ٹیبل"]],
      },
      {
        caption: ["Choose the teaching tool you need next.", "اختر أداة التدريس التي تحتاجها الآن.", "اگلی ضروری تدریسی سہولت چنیں۔"],
        status: ["Open your teaching workspace", "افتح مساحة التدريس", "تدریسی ورک اسپیس کھولیں"],
        cards: [["Complete your profile", "أكمل ملفك", "پروفائل مکمل کریں"], ["See assigned lessons", "شاهد حصصك المعيّنة", "مقررہ اسباق دیکھیں"], ["Review available drafts", "راجع المسودات المتاحة", "دستیاب مسودے دیکھیں"]],
      },
    ],
  },
  STUDENT: {
    title: ["Your learning. Your next discovery.", "تعلّمك. اكتشافك القادم.", "آپ کی تعلیم۔ آپ کی اگلی دریافت۔"],
    introduction: ["This is your place to find your timetable, teacher-assigned work and school updates. Let’s help you find your way around.", "هنا تجد جدولك والمهام التي يكلّفك بها المعلمون وتحديثات المدرسة. لنساعدك على معرفة الطريق.", "یہاں اپنا ٹائم ٹیبل، استاد کے دیے ہوئے کام اور اسکول کی خبریں تلاش کریں۔ آئیں راستہ جانیں۔"],
    preparationTitle: ["First, check that this is your class", "أولًا، تحقق من صفك", "پہلے اپنی جماعت کی تصدیق کریں"],
    preparation: ["Check your name and class. Then look for your timetable and any work your teachers have assigned.", "تحقق من اسمك وصفك ثم ابحث عن جدولك والمهام التي حدّدها معلموك.", "نام اور جماعت چیک کریں۔ پھر ٹائم ٹیبل اور اساتذہ کے دیے ہوئے کام دیکھیں۔"],
    scopeTitle: ["Your school connects your learning", "مدرستك تربطك بتعلّمك", "اسکول آپ کی تعلیم کو جوڑتا ہے"],
    scopeHint: ["No class or tasks yet? That can mean your school has not linked them. Ask your teacher or school office for help.", "لم يظهر صف أو مهام بعد؟ قد لا تكون المدرسة قد ربطتها. اطلب المساعدة من معلمك أو الإدارة.", "ابھی جماعت یا کام نہیں؟ ممکن ہے اسکول نے انہیں منسلک نہ کیا ہو۔ استاد یا اسکول دفتر سے مدد لیں۔"],
    reviewTitle: ["Learn with your teacher’s guidance", "تعلّم بإرشاد معلمك", "استاد کی رہنمائی میں سیکھیں"],
    reviewHint: ["Read each task’s instructions and due date. Ask your teacher if something is unclear, and keep your sign-in details private.", "اقرأ تعليمات كل مهمة وموعدها. اسأل معلمك عما لا تفهمه، وحافظ على سرية بيانات الدخول.", "ہر کام کی ہدایات اور آخری تاریخ پڑھیں۔ بات واضح نہ ہو تو استاد سے پوچھیں اور لاگ اِن کی معلومات محفوظ رکھیں۔"],
    chooseTitle: ["Where would you like to begin?", "من أين تود أن تبدأ؟", "آپ کہاں سے شروع کرنا چاہیں گے؟"],
    greeting: ["Ready to find your next learning step?", "مستعد لاكتشاف خطوتك التعليمية التالية؟", "اپنا اگلا تعلیمی قدم تلاش کرنے کے لیے تیار؟"],
    scenes: [
      {
        caption: ["A little curiosity can take you a long way.", "قليل من الفضول يفتح لك آفاقًا كثيرة.", "تھوڑا سا تجسس نئی راہیں کھولتا ہے۔"],
        status: ["Meet your learning guide", "تعرّف إلى دليل تعلّمك", "تعلیمی رہنما سے ملیں"],
        cards: [["Your class", "صفك", "آپ کی جماعت"], ["Your school day", "يومك الدراسي", "آپ کا اسکول کا دن"], ["Your next discovery", "اكتشافك القادم", "آپ کی اگلی دریافت"]],
      },
      {
        caption: ["Find your class, then see what your teachers have shared.", "اعثر على صفك ثم شاهد ما شاركه معلموك.", "اپنی جماعت دیکھیں، پھر اساتذہ کا دیا ہوا کام تلاش کریں۔"],
        status: ["Get to know your learning space", "تعرّف إلى مساحة تعلّمك", "اپنی تعلیمی جگہ کو جانیں"],
        cards: [["Name & class", "الاسم والصف", "نام اور جماعت"], ["Lesson timetable", "جدول الحصص", "اسباق کا ٹائم ٹیبل"], ["Teacher-assigned work", "مهام المعلمين", "استاد کے دیے ہوئے کام"]],
      },
      {
        caption: ["Your next step is waiting in your learning workspace.", "خطوتك التالية في مساحة تعلّمك.", "اگلا قدم آپ کی تعلیمی ورک اسپیس میں ہے۔"],
        status: ["Open your student workspace", "افتح مساحة الطالب", "طالب علم کی ورک اسپیس کھولیں"],
        cards: [["Explore your timetable", "استكشف جدولك", "اپنا ٹائم ٹیبل دیکھیں"], ["Read task instructions", "اقرأ تعليمات المهام", "کام کی ہدایات پڑھیں"], ["Ask when you need help", "اسأل عند الحاجة", "ضرورت ہو تو مدد لیں"]],
      },
    ],
  },
  PARENT: {
    title: ["Their school day. A little closer.", "يومهم الدراسي. أقرب إليك.", "ان کے اسکول کے دن سے زیادہ باخبر۔"],
    introduction: ["Stay connected to the children linked to your account. Find attendance, schedules and school updates in your family workspace.", "ابقَ على تواصل مع الأبناء المرتبطين بحسابك. تجد الحضور والجداول وتحديثات المدرسة في مساحة الأسرة.", "اکاؤنٹ سے منسلک بچوں کے اسکول سے باخبر رہیں۔ فیملی ورک اسپیس میں حاضری، اوقات اور اسکول کی خبریں دیکھیں۔"],
    preparationTitle: ["Begin with your family links", "ابدأ بروابط أبنائك", "بچوں کے تعلق کی تصدیق سے آغاز کریں"],
    preparation: ["Check that the correct children and classes appear. Keep your contact details accurate so the school can reach you.", "تحقق من ظهور الأبناء والصفوف الصحيحة. حافظ على دقة بيانات تواصلك لتتمكن المدرسة من الوصول إليك.", "درست بچوں اور جماعتوں کی تصدیق کریں۔ رابطے کی تفصیلات درست رکھیں تاکہ اسکول آپ سے رابطہ کر سکے۔"],
    scopeTitle: ["Your children, securely linked", "أبناؤك، مرتبطون بأمان", "آپ کے بچے، محفوظ تعلق کے ساتھ"],
    scopeHint: ["No child listed, or an incorrect link? Contact the school office. Family links are managed by your school.", "لم يظهر ابن، أو الرابط غير صحيح؟ تواصل مع الإدارة. تدير مدرستك روابط الأسرة.", "کوئی بچہ نظر نہیں آ رہا یا تعلق غلط ہے؟ اسکول دفتر سے رابطہ کریں۔ بچوں کے روابط اسکول طے کرتا ہے۔"],
    reviewTitle: ["Check the child and the date", "تحقق من الابن والتاريخ", "بچے اور تاریخ کی تصدیق کریں"],
    reviewHint: ["When reviewing attendance or updates, confirm which child and date you are viewing. Ask the office about any record that looks wrong.", "عند مراجعة الحضور أو التحديثات، تأكد من الابن والتاريخ. اسأل الإدارة عن أي سجل يبدو غير صحيح.", "حاضری یا خبریں دیکھتے ہوئے بچے اور تاریخ کی تصدیق کریں۔ ریکارڈ غلط لگے تو دفتر سے پوچھیں۔"],
    chooseTitle: ["Open your family’s school day", "افتح يوم أسرتك الدراسي", "اپنے بچوں کا اسکول کا دن دیکھیں"],
    greeting: ["Let’s bring your children’s school day a little closer.", "لنجعل يوم أبنائك الدراسي أقرب إليك.", "آئیں بچوں کے اسکول کے دن سے زیادہ باخبر ہوں۔"],
    scenes: [
      {
        caption: ["A familiar connection to their school day.", "صلة قريبة بيومهم الدراسي.", "ان کے اسکول کے دن سے ایک قریبی تعلق۔"],
        status: ["Meet your family guide", "تعرّف إلى دليل الأسرة", "فیملی رہنما سے ملیں"],
        cards: [["Your linked children", "أبناؤك المرتبطون", "آپ کے منسلک بچے"], ["Their daily attendance", "حضورهم اليومي", "ان کی روزانہ حاضری"], ["Their school updates", "تحديثات مدرستهم", "ان کے اسکول کی خبریں"]],
      },
      {
        caption: ["Start by making sure the family details are right.", "ابدأ بالتأكد من صحة بيانات الأسرة.", "پہلے خاندان کی تفصیلات درست ہونے کی تصدیق کریں۔"],
        status: ["Check your family connections", "تحقق من روابط الأسرة", "بچوں کے تعلقات چیک کریں"],
        cards: [["Children & classes", "الأبناء والصفوف", "بچے اور جماعتیں"], ["Your contact details", "بيانات تواصلك", "آپ کے رابطے کی تفصیلات"], ["School-managed links", "روابط تديرها المدرسة", "اسکول کے مقرر کردہ روابط"]],
      },
      {
        caption: ["Choose a child’s view and explore their school day.", "اختر صفحة أحد أبنائك واستكشف يومه الدراسي.", "بچے کا صفحہ چنیں اور اس کا اسکول کا دن دیکھیں۔"],
        status: ["Open your family workspace", "افتح مساحة الأسرة", "فیملی ورک اسپیس کھولیں"],
        cards: [["Check attendance", "راجع الحضور", "حاضری دیکھیں"], ["See school schedules", "شاهد جداول المدرسة", "اسکول کے اوقات دیکھیں"], ["Read school updates", "اقرأ تحديثات المدرسة", "اسکول کی خبریں پڑھیں"]],
      },
    ],
  },
  ACCOUNTANT: {
    title: ["Every figure. In the right context.", "كل رقم. في سياقه الصحيح.", "ہر رقم۔ درست سیاق میں۔"],
    introduction: ["Your work keeps school finances clear. Begin with the right campus and fee period, then review the records that need your attention.", "عملك يحافظ على وضوح مالية المدرسة. ابدأ بالفرع وفترة الرسوم الصحيحين ثم راجع السجلات التي تحتاج إلى اهتمامك.", "آپ کا کام اسکول کے مالی ریکارڈ کو واضح رکھتا ہے۔ درست کیمپس اور فیس کی مدت چنیں، پھر متعلقہ ریکارڈ دیکھیں۔"],
    preparationTitle: ["Prepare the financial context", "جهّز السياق المالي", "مالی سیاق تیار کریں"],
    preparation: ["Have fee structures, opening balances and the relevant billing period ready. Confirm your campus before working on records.", "جهّز هياكل الرسوم والأرصدة الافتتاحية وفترة الفوترة المعنية. أكد فرعك قبل العمل على السجلات.", "فیس کا ڈھانچہ، ابتدائی بقایا اور متعلقہ مدت تیار رکھیں۔ ریکارڈ پر کام سے پہلے کیمپس کی تصدیق کریں۔"],
    scopeTitle: ["Finance access follows your assignment", "صلاحيات المالية تتبع تكليفك", "مالی رسائی ذمہ داری کے مطابق ہے"],
    scopeHint: ["Only use the campus and finance tools assigned to you. Ask your administrator if an expected record or permission is missing.", "استخدم فقط الفرع وأدوات المالية المعيّنة لك. اسأل المسؤول عن السجلات أو الصلاحيات المتوقعة غير الظاهرة.", "صرف مقررہ کیمپس اور مالی سہولتیں استعمال کریں۔ متوقع ریکارڈ یا اجازت غائب ہو تو منتظم سے پوچھیں۔"],
    reviewTitle: ["Verify before recording a payment", "تحقق قبل تسجيل دفعة", "ادائیگی درج کرنے سے پہلے تصدیق"],
    reviewHint: ["Confirm the student, amount, period and payment details. Check existing records to avoid duplicate entries.", "أكد الطالب والمبلغ والفترة وبيانات الدفع. راجع السجلات الحالية لتجنب التكرار.", "طالب علم، رقم، مدت اور ادائیگی کی تفصیلات چیک کریں۔ دہرے اندراج سے بچنے کے لیے موجودہ ریکارڈ دیکھیں۔"],
    chooseTitle: ["Choose your first finance task", "اختر أول مهمة مالية", "پہلا مالی کام چنیں"],
    greeting: ["Let’s put your next finance task in the right context.", "لنضع مهمتك المالية التالية في سياقها الصحيح.", "آئیں اگلے مالی کام کا درست سیاق چنیں۔"],
    scenes: [
      {
        caption: ["Clear school finances begin with careful records.", "مالية مدرسية واضحة تبدأ بسجلات دقيقة.", "واضح اسکول مالیات کا آغاز محتاط ریکارڈ سے۔"],
        status: ["Meet your finance guide", "تعرّف إلى دليل المالية", "مالیاتی رہنما سے ملیں"],
        cards: [["Campus finances", "مالية الفرع", "کیمپس کے مالیات"], ["Fee records", "سجلات الرسوم", "فیس کا ریکارڈ"], ["Payment accuracy", "دقة المدفوعات", "ادائیگی کی درستگی"]],
      },
      {
        caption: ["Check the campus, period and figures together.", "راجع الفرع والفترة والأرقام معًا.", "کیمپس، مدت اور رقم ایک ساتھ چیک کریں۔"],
        status: ["Prepare your financial records", "جهّز سجلاتك المالية", "مالی ریکارڈ کی تیاری"],
        cards: [["Campus & billing period", "الفرع وفترة الفوترة", "کیمپس اور بل کی مدت"], ["Fee structures", "هياكل الرسوم", "فیس کا ڈھانچہ"], ["Opening balances", "الأرصدة الافتتاحية", "ابتدائی بقایا"]],
      },
      {
        caption: ["Open the records, then verify before posting.", "افتح السجلات ثم تحقق قبل التسجيل.", "ریکارڈ کھولیں، پھر اندراج سے پہلے تصدیق کریں۔"],
        status: ["Open your finance workspace", "افتح مساحة المالية", "مالیاتی ورک اسپیس کھولیں"],
        cards: [["Review fee records", "راجع سجلات الرسوم", "فیس کا ریکارڈ دیکھیں"], ["Check outstanding balances", "تحقق من الأرصدة المستحقة", "بقایا رقم چیک کریں"], ["Confirm payment details", "أكد بيانات الدفع", "ادائیگی کی تصدیق کریں"]],
      },
    ],
  },
  LIBRARIAN: {
    title: ["Every book. A new possibility.", "كل كتاب. فرصة جديدة.", "ہر کتاب۔ ایک نیا امکان۔"],
    introduction: ["You connect readers with the right resources. Start with your catalogue, member records and the borrowing details that keep the library moving.", "تصل القراء بالموارد المناسبة. ابدأ بالفهرس وسجلات الأعضاء وتفاصيل الاستعارة التي تنظّم المكتبة.", "آپ قارئ کو درست وسیلے سے جوڑتے ہیں۔ فہرست، اراکین اور ادھار کی تفصیلات سے لائبریری منظم کریں۔"],
    preparationTitle: ["Get the library details ready", "جهّز بيانات المكتبة", "لائبریری کی تفصیلات تیار کریں"],
    preparation: ["Prepare book identifiers, catalogue details and borrowing rules. Check that member records belong to the correct school context.", "جهّز معرّفات الكتب وبيانات الفهرس وقواعد الاستعارة. تأكد من انتماء سجلات الأعضاء إلى المدرسة الصحيحة.", "کتابوں کی شناخت، فہرست اور ادھار کے اصول تیار رکھیں۔ ارکان کا ریکارڈ درست اسکول سے متعلق ہونا چیک کریں۔"],
    scopeTitle: ["Your library, your assigned access", "مكتبتك وصلاحياتك المعيّنة", "آپ کی لائبریری، مقررہ رسائی"],
    scopeHint: ["Library records depend on your campus and access. Ask your administrator about a missing campus or member link.", "تعتمد سجلات المكتبة على فرعك وصلاحياتك. اسأل المسؤول عن ربط فرع أو عضو غير ظاهر.", "لائبریری ریکارڈ کیمپس اور رسائی کے مطابق ہے۔ کیمپس یا رکن منسلک نہ ہو تو منتظم سے پوچھیں۔"],
    reviewTitle: ["Check the copy and the borrower", "تحقق من النسخة والمستعير", "کتاب اور لینے والے کی تصدیق"],
    reviewHint: ["Match the book identifier and member before issuing or returning a copy. Check borrowing dates and existing records.", "طابق معرّف الكتاب والعضو قبل الإعارة أو الإرجاع. راجع تواريخ الاستعارة والسجلات الحالية.", "کتاب دینے یا واپس لینے سے پہلے شناخت اور رکن کو ملائیں۔ ادھار کی تاریخیں اور موجودہ ریکارڈ دیکھیں۔"],
    chooseTitle: ["Choose your first library task", "اختر أول مهمة للمكتبة", "لائبریری کا پہلا کام چنیں"],
    greeting: ["Let’s help your library’s next chapter begin.", "لنبدأ الفصل التالي لمكتبتك.", "آئیں لائبریری کا نیا باب شروع کریں۔"],
    scenes: [
      {
        caption: ["You help the next good book find its reader.", "أنت تساعد الكتاب المناسب في الوصول إلى قارئه.", "آپ اچھی کتاب کو اس کے قاری تک پہنچاتے ہیں۔"],
        status: ["Meet your library guide", "تعرّف إلى دليل المكتبة", "لائبریری رہنما سے ملیں"],
        cards: [["Your catalogue", "فهرسك", "آپ کی کتابوں کی فہرست"], ["Your readers", "قراؤك", "آپ کے قارئین"], ["Books in circulation", "الكتب المتداولة", "زیرِ استعمال کتابیں"]],
      },
      {
        caption: ["Give each copy and member a reliable record.", "امنح كل نسخة وعضو سجلًا دقيقًا.", "ہر کتاب اور رکن کا درست ریکارڈ رکھیں۔"],
        status: ["Prepare your library records", "جهّز سجلات المكتبة", "لائبریری ریکارڈ کی تیاری"],
        cards: [["Book identifiers", "معرّفات الكتب", "کتابوں کی شناخت"], ["Borrowing rules", "قواعد الاستعارة", "ادھار کے اصول"], ["Member details", "بيانات الأعضاء", "اراکین کی تفصیلات"]],
      },
      {
        caption: ["Open your library and find the next useful task.", "افتح مكتبتك وحدد المهمة المفيدة التالية.", "لائبریری کھولیں اور اگلا مفید کام تلاش کریں۔"],
        status: ["Open your library workspace", "افتح مساحة المكتبة", "لائبریری ورک اسپیس کھولیں"],
        cards: [["Explore the catalogue", "استكشف الفهرس", "کتابوں کی فہرست دیکھیں"], ["Review borrowing records", "راجع سجلات الاستعارة", "ادھار کا ریکارڈ دیکھیں"], ["Confirm member details", "أكد بيانات الأعضاء", "رکن کی تفصیلات چیک کریں"]],
      },
    ],
  },
  RECEPTIONIST: {
    title: ["A thoughtful welcome starts with you.", "ترحيب مدروس يبدأ بك.", "خوش دلی سے استقبال کا آغاز آپ سے۔"],
    introduction: ["You are often the school’s first hello. Start with the right campus, then find visitor records, admissions enquiries and your daily front-desk tools.", "أنت غالبًا أول من يرحب في المدرسة. ابدأ بالفرع الصحيح ثم استعرض سجلات الزوار واستفسارات القبول وأدوات الاستقبال.", "اکثر اسکول میں پہلا سلام آپ کا ہوتا ہے۔ درست کیمپس سے آغاز کریں، پھر زائرین، داخلہ سوالات اور استقبالیہ کی سہولتیں دیکھیں۔"],
    preparationTitle: ["Prepare for the next arrival", "استعد للزائر التالي", "اگلی آمد کے لیے تیار ہوں"],
    preparation: ["Confirm your campus and school contact details. Keep the information needed for visitor and admissions records ready.", "أكد فرعك وبيانات تواصل المدرسة. جهّز المعلومات اللازمة لسجلات الزوار والقبول.", "کیمپس اور اسکول کے رابطوں کی تصدیق کریں۔ زائرین اور داخلہ ریکارڈ کی ضروری معلومات تیار رکھیں۔"],
    scopeTitle: ["The right desk for your campus", "مكتب الاستقبال المناسب لفرعك", "اپنے کیمپس کا درست استقبالیہ"],
    scopeHint: ["Your tools follow your campus assignment. Ask the school administrator to resolve missing campus access.", "تتبع أدواتك الفرع المعيّن لك. اطلب من مسؤول المدرسة معالجة الوصول الناقص للفرع.", "سہولتیں مقررہ کیمپس کے مطابق ہیں۔ کیمپس کی رسائی نہ ہو تو اسکول منتظم سے مدد لیں۔"],
    reviewTitle: ["A warm welcome, careful records", "ترحيب لطيف وسجلات دقيقة", "گرمجوش استقبال، محتاط ریکارڈ"],
    reviewHint: ["Confirm names and contact details. Record only what the school needs and keep visitor and family information private.", "أكد الأسماء وبيانات التواصل. سجّل ما تحتاجه المدرسة فقط واحفظ خصوصية معلومات الزوار والأسر.", "نام اور رابطے چیک کریں۔ صرف اسکول کی ضروری معلومات لکھیں اور زائرین و خاندانوں کی معلومات نجی رکھیں۔"],
    chooseTitle: ["Choose your first front-desk task", "اختر أول مهمة استقبال", "استقبالیہ کا پہلا کام چنیں"],
    greeting: ["Let’s get your front desk ready for the school day.", "لنجهّز مكتب الاستقبال لليوم الدراسي.", "آئیں استقبالیہ کو اسکول کے دن کے لیے تیار کریں۔"],
    scenes: [
      {
        caption: ["The school day often begins with your hello.", "اليوم الدراسي يبدأ غالبًا بترحيبك.", "اسکول کا دن اکثر آپ کے سلام سے شروع ہوتا ہے۔"],
        status: ["Meet your front-desk guide", "تعرّف إلى دليل الاستقبال", "استقبالیہ رہنما سے ملیں"],
        cards: [["A welcoming front desk", "مكتب استقبال مرحّب", "خوش آمدید کہتا استقبالیہ"], ["School visitors", "زوار المدرسة", "اسکول کے زائرین"], ["Family enquiries", "استفسارات الأسر", "خاندانوں کے سوالات"]],
      },
      {
        caption: ["Have the right campus and contact details at hand.", "احتفظ ببيانات الفرع والتواصل الصحيحة.", "درست کیمپس اور رابطے کی تفصیلات تیار رکھیں۔"],
        status: ["Prepare for daily arrivals", "استعد للاستقبال اليومي", "روزانہ آمد کی تیاری"],
        cards: [["Assigned campus", "الفرع المعيّن", "مقررہ کیمپس"], ["School contact details", "بيانات تواصل المدرسة", "اسکول کے رابطے"], ["Necessary visitor details", "بيانات الزوار اللازمة", "زائرین کی ضروری تفصیلات"]],
      },
      {
        caption: ["Open your desk and take the next enquiry.", "افتح مكتبك وتابع الاستفسار التالي.", "استقبالیہ کھولیں اور اگلا سوال دیکھیں۔"],
        status: ["Open your front-desk workspace", "افتح مساحة الاستقبال", "استقبالیہ ورک اسپیس کھولیں"],
        cards: [["Review visitor records", "راجع سجلات الزوار", "زائرین کا ریکارڈ دیکھیں"], ["Open admissions enquiries", "افتح استفسارات القبول", "داخلہ سوالات کھولیں"], ["Check details before saving", "تحقق قبل الحفظ", "محفوظ کرنے سے پہلے تصدیق"]],
      },
    ],
  },
  APP_OWNER: {
    title: ["A clear view across your platform.", "رؤية واضحة لمنصتك.", "اپنے پلیٹ فارم کا واضح جائزہ۔"],
    introduction: ["You look after the platform behind the schools. Start with school accounts and service context, then choose the administrative task you need.", "أنت تدير المنصة التي تخدم المدارس. ابدأ بحسابات المدارس وسياق الخدمة ثم اختر المهمة الإدارية المطلوبة.", "آپ اسکولوں کے لیے پلیٹ فارم سنبھالتے ہیں۔ اسکول اکاؤنٹس اور سروس کے سیاق سے آغاز کریں، پھر ضروری انتظامی کام چنیں۔"],
    preparationTitle: ["Choose the right school context", "اختر سياق المدرسة الصحيح", "درست اسکول کا سیاق چنیں"],
    preparation: ["Confirm the school account and the purpose of your task. Review available account, access and service information before making changes.", "أكد حساب المدرسة وغرض المهمة. راجع معلومات الحساب والوصول والخدمة المتاحة قبل التغيير.", "اسکول اکاؤنٹ اور کام کے مقصد کی تصدیق کریں۔ تبدیلی سے پہلے دستیاب اکاؤنٹ، رسائی اور سروس کی معلومات دیکھیں۔"],
    scopeTitle: ["Keep school boundaries clear", "حافظ على حدود المدارس", "اسکولوں کی حدود واضح رکھیں"],
    scopeHint: ["Platform administration and school work have different contexts. Check the selected school and permitted tools before continuing.", "لإدارة المنصة والعمل المدرسي سياقان مختلفان. تحقق من المدرسة المختارة والأدوات المسموحة قبل المتابعة.", "پلیٹ فارم انتظام اور اسکول کا کام الگ سیاق رکھتے ہیں۔ آگے بڑھنے سے پہلے منتخب اسکول اور مجاز سہولتیں دیکھیں۔"],
    reviewTitle: ["Verify the impact of each change", "تحقق من أثر كل تغيير", "ہر تبدیلی کا اثر چیک کریں"],
    reviewHint: ["Check the affected account and access level before updating settings. Handle school information only within your authorized task.", "تحقق من الحساب المتأثر ومستوى الوصول قبل تحديث الإعدادات. استخدم بيانات المدرسة ضمن مهمتك المصرّح بها فقط.", "ترتیب بدلنے سے پہلے متعلقہ اکاؤنٹ اور رسائی کی سطح دیکھیں۔ اسکول کی معلومات صرف مجاز کام کے لیے استعمال کریں۔"],
    chooseTitle: ["Choose your platform starting point", "اختر نقطة بدء إدارة المنصة", "پلیٹ فارم کے آغاز کا راستہ چنیں"],
    greeting: ["Let’s find the right context for your platform work.", "لنجد السياق المناسب لعملك على المنصة.", "آئیں پلیٹ فارم کے کام کا درست سیاق چنیں۔"],
    scenes: [
      {
        caption: ["Behind every school is a platform you help care for.", "خلف كل مدرسة منصة تساعد على إدارتها.", "ہر اسکول کے پیچھے پلیٹ فارم کی دیکھ بھال آپ کرتے ہیں۔"],
        status: ["Meet your platform guide", "تعرّف إلى دليل المنصة", "پلیٹ فارم رہنما سے ملیں"],
        cards: [["School accounts", "حسابات المدارس", "اسکول اکاؤنٹس"], ["Platform services", "خدمات المنصة", "پلیٹ فارم کی سروسز"], ["Access boundaries", "حدود الوصول", "رسائی کی حدود"]],
      },
      {
        caption: ["Choose the account before you choose the change.", "اختر الحساب قبل اختيار التغيير.", "تبدیلی سے پہلے اکاؤنٹ چنیں۔"],
        status: ["Prepare your administrative context", "جهّز سياقك الإداري", "انتظامی سیاق کی تیاری"],
        cards: [["Selected school", "المدرسة المختارة", "منتخب اسکول"], ["Account permissions", "صلاحيات الحساب", "اکاؤنٹ کی اجازتیں"], ["Available service details", "بيانات الخدمة المتاحة", "دستیاب سروس کی تفصیلات"]],
      },
      {
        caption: ["Open the platform overview with a clear purpose.", "افتح نظرة المنصة بهدف واضح.", "واضح مقصد کے ساتھ پلیٹ فارم کا جائزہ کھولیں۔"],
        status: ["Open your platform workspace", "افتح مساحة المنصة", "پلیٹ فارم ورک اسپیس کھولیں"],
        cards: [["Review school accounts", "راجع حسابات المدارس", "اسکول اکاؤنٹس دیکھیں"], ["Confirm the target context", "أكد السياق المستهدف", "متعلقہ سیاق کی تصدیق"], ["Check changes carefully", "راجع التغييرات بعناية", "تبدیلیوں کا محتاط جائزہ"]],
      },
    ],
  },
};

const sceneLabels: readonly (readonly [Localized, Localized, Localized])[] = [
  [
    ["YOUR START", "بدايتك", "آپ کا آغاز"],
    ["IN FOCUS", "محور الاهتمام", "توجہ کا مرکز"],
    ["LOOK AHEAD", "نظرة للأمام", "آگے کی طرف"],
  ],
  [
    ["01 · CHECK", "١ · تحقق", "۱ · تصدیق"],
    ["02 · PREPARE", "٢ · جهّز", "۲ · تیاری"],
    ["03 · CONFIRM", "٣ · أكد", "۳ · توثیق"],
  ],
  [
    ["YOUR NEXT STEP", "خطوتك التالية", "آپ کا اگلا قدم"],
    ["EXPLORE", "استكشف", "دریافت کریں"],
    ["TAKE IT FORWARD", "تابع التقدم", "آگے بڑھیں"],
  ],
];
const saveTitle: Localized = ["Return whenever you need a hand", "عُد عندما تحتاج إلى إرشاد", "مدد چاہیے ہو تو دوبارہ آئیں"];
const saveHint: Localized = ["You can replay this guide from your workspace. Replaying it does not reset your saved work.", "يمكنك إعادة هذا الدليل من مساحة عملك. إعادته لا تمسح عملك المحفوظ.", "ورک اسپیس سے یہ رہنمائی دوبارہ دیکھ سکتے ہیں۔ دوبارہ دیکھنے سے محفوظ کام حذف نہیں ہوگا۔"];

export function roleGuideCopy(role: UserRole, language: Language) {
  const index = language === "ar" ? 1 : language === "ur" ? 2 : 0;
  const narrative = narratives[role];
  const text = (value: Localized) => value[index];
  const scene = (value: Scene, stage: 0 | 1 | 2): GuideScene => ({
    caption: text(value.caption),
    status: text(value.status),
    cards: [
      { label: text(sceneLabels[stage][0]), title: text(value.cards[0]) },
      { label: text(sceneLabels[stage][1]), title: text(value.cards[1]) },
      { label: text(sceneLabels[stage][2]), title: text(value.cards[2]) },
    ],
  });
  return {
    title: text(narrative.title),
    introduction: text(narrative.introduction),
    preparationTitle: text(narrative.preparationTitle),
    preparation: text(narrative.preparation),
    scopeTitle: text(narrative.scopeTitle),
    scopeHint: text(narrative.scopeHint),
    reviewTitle: text(narrative.reviewTitle),
    reviewHint: text(narrative.reviewHint),
    saveTitle: text(saveTitle),
    saveHint: text(saveHint),
    chooseTitle: text(narrative.chooseTitle),
    greeting: text(narrative.greeting),
    scenes: [
      scene(narrative.scenes[0], 0),
      scene(narrative.scenes[1], 1),
      scene(narrative.scenes[2], 2),
    ] as const,
  };
}
