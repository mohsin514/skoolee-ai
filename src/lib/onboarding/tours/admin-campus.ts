import type { Localized, TourDef } from "./types";
import { aiWorkflowsStep, examStudioStep, flagshipCardStep, helpStep } from "./resolve";
import { ADMIN_EXAM_CARD } from "./admin-school";

/** A campus operator runs its campus's AI workflows; drafting the school's setup is the authority's (admin-school). */
const CAMPUS_AI_CARD: Localized = [
  "Run AI workflows for this campus, such as setup, timetables and announcements; you review and approve every draft before it applies.",
  "شغّل مسارات الذكاء الاصطناعي لهذا الفرع، مثل الإعداد والجداول والإعلانات؛ وتراجع كل مسودة وتعتمدها قبل تطبيقها.",
  "اس کیمپس کے لیے اے آئی ورک فلوز چلائیں، جیسے ترتیب، نظام الاوقات اور اعلانات؛ ہر مسودہ لاگو ہونے سے پہلے آپ اس کا جائزہ لے کر منظوری دیتے ہیں۔",
];

/**
 * Campus console: a CAMPUS_ADMIN of a GROUP campus, a deputy campus admin of a STANDALONE school, or a legacy ADMIN
 * inside a GROUP. SPEC §9.7 `admin-campus` v1. Copy never says "group admin" to a standalone deputy [R-I11, K-I12].
 * Flagships (addendum 2026-10-22): the Today cards first (Exam Studio only while the campus has no principal), then
 * their sidebar entries right after the Today steps, in sidebar order.
 */
export const adminCampusTour: TourDef = {
  id: "admin-campus", version: 1, console: "admin",
  steps: [
    {
      id: "scope", anchor: "shell.header.scope",
      title: ["Your campus", "فرعك", "آپ کا کیمپس"],
      body: [
        "You manage this campus; billing and school-wide settings stay with the account owner.",
        "أنت تدير هذا الفرع؛ وتبقى الفوترة والإعدادات العامة للمدرسة لدى مالك الحساب.",
        "آپ یہ کیمپس چلاتے ہیں؛ بلنگ اور پورے اسکول کی ترتیبات اکاؤنٹ کے مالک کے پاس رہتی ہیں۔",
      ],
      variants: [
        {
          when: "groupCampus",
          body: [
            "You manage this campus; billing and school-wide settings stay with your group admin.",
            "أنت تدير هذا الفرع؛ وتبقى الفوترة والإعدادات العامة لدى مدير المجموعة.",
            "آپ یہ کیمپس چلاتے ہیں؛ بلنگ اور پورے ادارے کی ترتیبات ادارے کے منتظم کے پاس رہتی ہیں۔",
          ],
        },
        {
          when: "standaloneDeputy",
          title: ["Your school", "مدرستك", "آپ کا اسکول"],
          body: [
            "You help run this school; billing and school-wide settings stay with your school admin.",
            "أنت تساعد في إدارة هذه المدرسة؛ وتبقى الفوترة والإعدادات العامة لدى مدير المدرسة.",
            "آپ اس اسکول کے انتظام میں مدد کرتے ہیں؛ بلنگ اور پورے اسکول کی ترتیبات اسکول منتظم کے پاس رہتی ہیں۔",
          ],
        },
      ],
    },
    flagshipCardStep("admin", "ai", CAMPUS_AI_CARD, { view: "overview" }),
    flagshipCardStep("admin", "exams", ADMIN_EXAM_CARD, { view: "overview" }, ["academicLead"]),
    {
      id: "queue", anchor: "work.today.queue", view: "overview",
      title: ["Waiting on you", "بانتظارك", "آپ کے منتظر"],
      body: [
        "Registers, complaints, refunds, leave and record corrections waiting on you, in one list.",
        "سجلات الحضور والشكاوى والمبالغ المستردة والإجازات وتصحيحات السجلات التي تنتظرك، في قائمة واحدة.",
        "حاضری رجسٹر، شکایات، رقم کی واپسی، چھٹیاں اور ریکارڈ کی درستیاں جو آپ کی منتظر ہیں، ایک ہی فہرست میں۔",
      ],
    },
    {
      // The header's action row (Add student + Bulk import), present whether or not the AI setup card leads Today.
      id: "add-student", anchor: "page.actions", view: "overview",
      title: ["Enrol students", "تسجيل الطلاب", "طلبہ کا داخلہ"],
      body: [
        "Enrol one student with Add student, or a whole class with Bulk import; families get access once you link a guardian.",
        "سجّل طالبًا واحدًا عبر «إضافة طالب» أو صفًا كاملًا عبر «استيراد جماعي»؛ وتحصل الأسرة على الوصول بمجرد ربط ولي الأمر.",
        "«طالب علم شامل کریں» سے ایک طالب علم یا «اجتماعی درآمد» سے پوری جماعت داخل کریں؛ سرپرست کو منسلک کرتے ہی خاندان کو رسائی مل جاتی ہے۔",
      ],
    },
    aiWorkflowsStep(),
    examStudioStep(),
    {
      id: "guardians", anchor: "shell.nav.guardians", requires: ["campusOps"],
      title: ["Guardians & access", "أولياء الأمور والوصول", "سرپرست اور رسائی"],
      body: [
        "Link each guardian to their child and choose what they can see.",
        "اربط كل ولي أمر بطفله واختر ما يمكنه رؤيته.",
        "ہر سرپرست کو اس کے بچے سے جوڑیں اور طے کریں کہ وہ کیا دیکھ سکتا ہے۔",
      ],
    },
    {
      id: "staff", anchor: "shell.nav.staff-invites",
      title: ["Staff & invites", "الموظفون والدعوات", "عملہ اور دعوت نامے"],
      body: [
        "See the staff on this campus and who has accepted an invitation.",
        "اطّلع على موظفي هذا الفرع ومن قبل الدعوة.",
        "اس کیمپس کا عملہ اور دعوت قبول کرنے والے افراد دیکھیں۔",
      ],
      variants: [
        {
          when: "memberships",
          body: [
            "Invite teachers and office staff for this campus.",
            "ادعُ المعلمين وموظفي المكتب إلى هذا الفرع.",
            "اس کیمپس کے لیے اساتذہ اور دفتری عملے کو مدعو کریں۔",
          ],
        },
        {
          when: "groupCampus",
          body: [
            "See your staff; your group admin can let you invite.",
            "اطّلع على موظفيك؛ ويمكن لمدير المجموعة أن يمنحك صلاحية الدعوة.",
            "اپنا عملہ دیکھیں؛ ادارے کا منتظم آپ کو مدعو کرنے کی اجازت دے سکتا ہے۔",
          ],
        },
        {
          when: "standaloneDeputy",
          body: [
            "See your staff; your school admin can let you invite.",
            "اطّلع على موظفيك؛ ويمكن لمدير المدرسة أن يمنحك صلاحية الدعوة.",
            "اپنا عملہ دیکھیں؛ اسکول منتظم آپ کو مدعو کرنے کی اجازت دے سکتا ہے۔",
          ],
        },
      ],
    },
    {
      id: "fees", anchor: "shell.nav.fees", requires: ["fees"],
      title: ["Fees", "الرسوم", "فیس"],
      body: [
        "Follow collection and approve refunds; your accountant records payments.",
        "تابع التحصيل ووافق على المبالغ المستردة؛ ويسجّل المحاسب المدفوعات.",
        "وصولی پر نظر رکھیں اور رقم کی واپسی منظور کریں؛ ادائیگیاں آپ کا اکاؤنٹنٹ درج کرتا ہے۔",
      ],
      variants: [{
        when: "financeDesk",
        body: [
          "Issue invoices, record payments and chase arrears.",
          "أصدر الفواتير وسجّل المدفوعات وتابع المتأخرات.",
          "انوائس جاری کریں، ادائیگیاں درج کریں اور بقایا جات کی وصولی کریں۔",
        ],
      }],
    },
    {
      id: "academics", anchor: "shell.nav-group.academics",
      title: ["Academics", "الشؤون الأكاديمية", "تعلیمی امور"],
      body: [
        "With no principal appointed, you also run timetable, exams and report cards here.",
        "في غياب مدير أكاديمي معيّن، تتولى أيضًا الجدول والامتحانات وبطاقات التقارير من هنا.",
        "تعلیمی سربراہ مقرر نہ ہونے تک نظام الاوقات، امتحانات اور رپورٹ کارڈ بھی آپ یہیں سنبھالتے ہیں۔",
      ],
      variants: [{
        when: "hasPrincipal",
        body: [
          "Classes and year setup are yours; your principal runs timetable, exams and results.",
          "الصفوف وإعداد العام من مسؤوليتك؛ ويتولى المدير الأكاديمي الجدول والامتحانات والنتائج.",
          "جماعتیں اور سال کی ترتیب آپ کے ذمے ہیں؛ نظام الاوقات، امتحانات اور نتائج آپ کا تعلیمی سربراہ سنبھالتا ہے۔",
        ],
      }],
    },
    {
      id: "services", anchor: "shell.nav-group.services",
      title: ["Campus services", "خدمات الفرع", "کیمپس کی خدمات"],
      body: [
        "Front desk, pickup, transport and the other services switched on for your campus.",
        "مكتب الاستقبال والاستلام والنقل وبقية الخدمات المفعّلة في فرعك.",
        "استقبالیہ، بچوں کی واپسی، ٹرانسپورٹ اور آپ کے کیمپس پر فعال دیگر خدمات۔",
      ],
    },
    {
      id: "campus-setup", anchor: "shell.nav.campus-setup", requires: ["campusOps"],
      title: ["Campus setup", "إعداد الفرع", "کیمپس کی تیاری"],
      body: [
        "Year setup, calendar, periods, rooms, policies and packages; mostly set once a year.",
        "إعداد العام والتقويم والحصص والقاعات والسياسات والباقات؛ وغالبًا تُضبط مرة في السنة.",
        "سال کی ترتیب، کیلنڈر، پیریڈ، کمرے، پالیسیاں اور پیکجز؛ زیادہ تر سال میں ایک بار طے ہوتے ہیں۔",
      ],
    },
    helpStep([
      "Replay this tour, report a problem or check your role from Help.",
      "من «المساعدة» أعد هذه الجولة، أو أبلغ عن مشكلة، أو راجع دورك.",
      "«مدد» سے یہ تعارفی دورہ دوبارہ دیکھیں، مسئلہ رپورٹ کریں یا اپنا کردار دیکھیں۔",
    ]),
  ],
};
