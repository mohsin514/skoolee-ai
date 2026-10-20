import type { Language } from "@/lib/locale/package";
import type { LaunchJourney } from "@/lib/onboarding/launch-plan";

type StageCard = { label: string; title: string };
export type GuideScene = {
  caption: string;
  status: string;
  cards: readonly [StageCard, StageCard, StageCard];
};

const scenes: Record<Language, readonly [GuideScene, GuideScene, GuideScene]> = {
  en: [
    {
      caption: "Hello! Let’s build your school’s next chapter.",
      status: "Meet your Skoolee guide",
      cards: [
        { label: "YOUR FOUNDATION", title: "Your campus" },
        { label: "YOUR COMMUNITY", title: "Your people" },
        { label: "YOUR STARTING POINT", title: "A path for your role" },
      ],
    },
    {
      caption: "You bring the details. AI shapes a first draft.",
      status: "From your answers to a clear plan",
      cards: [
        { label: "01 · YOU ANSWER", title: "Campus & academic plans" },
        { label: "02 · AI PREPARES", title: "Editable setup drafts" },
        { label: "03 · YOU REVIEW", title: "Check every detail" },
      ],
    },
    {
      caption: "Choose your next step. I’ll guide you from there.",
      status: "Ready to open your workspace",
      cards: [
        { label: "START", title: "Open your next task" },
        { label: "CONTINUE", title: "Resume saved progress" },
        { label: "MAKE IT YOURS", title: "Review, edit & approve" },
      ],
    },
  ],
  ar: [
    {
      caption: "مرحبًا! لنبدأ الفصل التالي لمدرستك.",
      status: "تعرّف إلى دليلك في Skoolee",
      cards: [
        { label: "أساس مدرستك", title: "فرعك" },
        { label: "مجتمع مدرستك", title: "فريقك" },
        { label: "نقطة البداية", title: "مسار يناسب دورك" },
      ],
    },
    {
      caption: "أنت تقدّم التفاصيل، والذكاء يصيغ المسودة.",
      status: "من إجاباتك إلى خطة واضحة",
      cards: [
        { label: "١ · أنت تجيب", title: "الفرع والخطط الأكاديمية" },
        { label: "٢ · الذكاء يعدّ", title: "مسودات إعداد قابلة للتعديل" },
        { label: "٣ · أنت تراجع", title: "تحقق من كل التفاصيل" },
      ],
    },
    {
      caption: "اختر خطوتك التالية، وسأرشدك من هناك.",
      status: "مستعد لفتح مساحة عملك",
      cards: [
        { label: "ابدأ", title: "افتح مهمتك التالية" },
        { label: "تابع", title: "استأنف تقدمك المحفوظ" },
        { label: "اجعلها مناسبة لك", title: "راجع وعدّل واعتمد" },
      ],
    },
  ],
  ur: [
    {
      caption: "سلام! آپ کے اسکول کا نیا باب شروع کریں۔",
      status: "اپنے Skoolee رہنما سے ملیں",
      cards: [
        { label: "آپ کی بنیاد", title: "آپ کا کیمپس" },
        { label: "آپ کا حلقہ", title: "آپ کی ٹیم" },
        { label: "آپ کا آغاز", title: "آپ کے کردار کا راستہ" },
      ],
    },
    {
      caption: "آپ تفصیلات دیں۔ اے آئی پہلا مسودہ بنائے گا۔",
      status: "آپ کے جوابوں سے ایک واضح منصوبہ",
      cards: [
        { label: "۱ · آپ جواب دیں", title: "کیمپس اور تعلیمی منصوبے" },
        { label: "۲ · اے آئی تیار کرے", title: "قابلِ ترمیم ترتیب کے مسودے" },
        { label: "۳ · آپ جائزہ لیں", title: "ہر تفصیل کی تصدیق" },
      ],
    },
    {
      caption: "اگلا قدم چنیں۔ میں آگے کی رہنمائی کروں گا۔",
      status: "آپ کی ورک اسپیس کھولنے کے لیے تیار",
      cards: [
        { label: "آغاز", title: "اپنا اگلا کام کھولیں" },
        { label: "جاری رکھیں", title: "محفوظ پیش رفت سے شروع کریں" },
        { label: "اپنے مطابق بنائیں", title: "جائزہ، ترمیم اور منظوری" },
      ],
    },
  ],
};

type Localized = readonly [string, string, string];
const roleScenes: Record<Exclude<LaunchJourney, "campus" | "institution">, { caption: Localized; status: Localized; cards: readonly [Localized, Localized, Localized]; next: Localized }> = {
  teacher: {
    caption: ["Check your profile, then explore your teaching tools.", "راجع ملفك ثم استكشف أدوات التدريس.", "پروفائل دیکھیں، پھر تدریسی سہولتیں دریافت کریں۔"],
    status: ["Your next teaching day starts here", "يومك التدريسي التالي يبدأ هنا", "آپ کے اگلے تدریسی دن کا آغاز"],
    cards: [
      ["Teaching profile", "ملف المعلم", "تدریسی پروفائل"],
      ["Classes & subjects", "الصفوف والمواد", "جماعتیں اور مضامین"],
      ["School assignments", "تكليفات المدرسة", "اسکول کی ذمہ داریاں"],
    ],
    next: ["Open teaching tools", "افتح أدوات التدريس", "تدریسی سہولتیں کھولیں"],
  },
  student: {
    caption: ["Your class, your timetable, your next discovery.", "صفك وجدولك واكتشافك القادم.", "آپ کی جماعت، ٹائم ٹیبل اور اگلی دریافت۔"],
    status: ["Find your next learning task", "اعثر على مهمتك التعليمية التالية", "اپنا اگلا تعلیمی کام تلاش کریں"],
    cards: [
      ["Name & class", "الاسم والصف", "نام اور جماعت"],
      ["Your timetable", "جدولك الدراسي", "آپ کا ٹائم ٹیبل"],
      ["Assigned learning", "مهام التعلم المكلّف بها", "دیے گئے تعلیمی کام"],
    ],
    next: ["Open learning workspace", "افتح مساحة التعلم", "تعلیمی ورک اسپیس کھولیں"],
  },
  family: {
    caption: ["Your children and their school day, in one place.", "أبناؤك ويومهم الدراسي في مكان واحد.", "آپ کے بچے اور ان کا اسکول کا دن، ایک جگہ۔"],
    status: ["A closer connection to their school day", "تواصل أقرب مع يومهم الدراسي", "ان کے اسکول کے دن سے باخبر رہیں"],
    cards: [
      ["Linked children", "الأبناء المرتبطون", "منسلک بچے"],
      ["Attendance & timetable", "الحضور والجدول", "حاضری اور ٹائم ٹیبل"],
      ["School updates", "تحديثات المدرسة", "اسکول کی خبریں"],
    ],
    next: ["Open family workspace", "افتح مساحة الأسرة", "فیملی ورک اسپیس کھولیں"],
  },
  finance: {
    caption: ["Clear records begin with the right details.", "سجلات واضحة تبدأ بتفاصيل صحيحة.", "واضح ریکارڈ کا آغاز درست تفصیلات سے۔"],
    status: ["Prepare your financial workspace", "جهّز مساحة المالية", "مالیاتی ورک اسپیس تیار کریں"],
    cards: [
      ["Campus & fee period", "الفرع وفترة الرسوم", "کیمپس اور فیس کی مدت"],
      ["Fees & balances", "الرسوم والأرصدة", "فیس اور بقایا"],
      ["Review before posting", "راجع قبل التسجيل", "درج کرنے سے پہلے جائزہ"],
    ],
    next: ["Open finance workspace", "افتح مساحة المالية", "مالیاتی ورک اسپیس کھولیں"],
  },
  library: {
    caption: ["Let’s give every book its place.", "لنمنح كل كتاب مكانه.", "ہر کتاب کو اس کی جگہ دیں۔"],
    status: ["Prepare your library workspace", "جهّز مساحة المكتبة", "لائبریری ورک اسپیس تیار کریں"],
    cards: [
      ["Book catalogue", "فهرس الكتب", "کتابوں کی فہرست"],
      ["Borrowing rules", "قواعد الاستعارة", "ادھار کے اصول"],
      ["Member details", "بيانات الأعضاء", "ارکان کی تفصیلات"],
    ],
    next: ["Open library workspace", "افتح مساحة المكتبة", "لائبریری ورک اسپیس کھولیں"],
  },
  frontDesk: {
    caption: ["A thoughtful welcome starts with you.", "ترحيب مدروس يبدأ بك.", "خوش دلی سے استقبال کا آغاز آپ سے۔"],
    status: ["Get ready for the school day", "استعد لليوم الدراسي", "اسکول کے دن کی تیاری کریں"],
    cards: [
      ["Assigned campus", "الفرع المعيّن", "مقررہ کیمپس"],
      ["Admissions enquiries", "استفسارات القبول", "داخلے کے سوالات"],
      ["Visitor records", "سجلات الزوار", "زائرین کا ریکارڈ"],
    ],
    next: ["Open front desk", "افتح مكتب الاستقبال", "استقبالیہ کھولیں"],
  },
  platform: {
    caption: ["See your schools, then choose the right context.", "استعرض مدارسك ثم اختر السياق المناسب.", "اسکول دیکھیں، پھر متعلقہ اسکول کا انتخاب کریں۔"],
    status: ["Your schools and services in view", "مدارسك وخدماتك أمامك", "آپ کے اسکول اور سہولتیں سامنے"],
    cards: [
      ["School accounts", "حسابات المدارس", "اسکول کے اکاؤنٹس"],
      ["Access & roles", "الوصول والأدوار", "رسائی اور کردار"],
      ["Service status", "حالة الخدمة", "سروس کی حالت"],
    ],
    next: ["Open school overview", "افتح نظرة المدارس", "اسکولوں کا جائزہ کھولیں"],
  },
};

export function guideScenes(language: Language, journey?: LaunchJourney): readonly [GuideScene, GuideScene, GuideScene] {
  const base = scenes[language];
  if (!journey || journey === "campus" || journey === "institution") return base;
  const index = language === "ar" ? 1 : language === "ur" ? 2 : 0;
  const role = roleScenes[journey];
  const labels: readonly [Localized, Localized, Localized] = [
    ["01 · CHECK", "١ · تحقق", "۱ · تصدیق"],
    ["02 · PREPARE", "٢ · جهّز", "۲ · تیاری"],
    ["03 · EXPLORE", "٣ · استكشف", "۳ · دریافت"],
  ];
  const roleCard = (cardIndex: 0 | 1 | 2): StageCard => ({ label: labels[cardIndex][index], title: role.cards[cardIndex][index] });
  return [
    {
      ...base[0],
      caption: ["Hello! Let’s make this workspace yours.", "مرحبًا! لنجعل مساحة العمل مناسبة لك.", "سلام! اس ورک اسپیس کو آپ کے مطابق بنائیں۔"][index],
      cards: [
        { label: ["YOUR SPACE", "مساحتك", "آپ کی جگہ"][index], title: ["Your workspace", "مساحة عملك", "آپ کی ورک اسپیس"][index] },
        base[0].cards[1],
        base[0].cards[2],
      ],
    },
    {
      caption: role.caption[index],
      status: role.status[index],
      cards: [roleCard(0), roleCard(1), roleCard(2)],
    },
    {
      ...base[2],
      cards: [
        { ...base[2].cards[0], title: role.next[index] },
        { label: ["YOUR ACCESS", "صلاحياتك", "آپ کی رسائی"][index], title: ["Tools for your role", "أدوات تناسب دورك", "آپ کے کردار کی سہولتیں"][index] },
        { label: ["ANY TIME", "في أي وقت", "کسی بھی وقت"][index], title: ["Replay this guide", "أعد هذا الدليل", "یہ رہنمائی دوبارہ دیکھیں"][index] },
      ],
    },
  ];
}

export function guideGreeting(language: Language) {
  return language === "ar"
    ? "مرحبًا بك! يسعدني أن أرشدك."
    : language === "ur"
      ? "سلام! آپ کی رہنمائی کرکے خوشی ہوگی۔"
      : "Hello there! Happy to help you get started.";
}
