import type { Localized, TourDef } from "./types";
import { aiWorkflowsStep, examStudioStep, flagshipCardStep, helpStep } from "./resolve";

/**
 * School console: the ADMIN of a STANDALONE school (operations + the school's account). SPEC §9.7 `admin-school` v1,
 * plus the flagships (addendum 2026-10-22): the Today cards first (Exam Studio only while the admin is the academic
 * lead), then their sidebar entries right after the Today steps, in sidebar order.
 */
/** The school's setup is the authority's to draft: the questionnaire, then everyday runs (shared with admin-campus). */
export const ADMIN_AI_CARD: Localized = [
  "Answer a short questionnaire and AI drafts your school's setup, from classes and calendar to fees and messages; nothing applies until you approve it.",
  "أجب عن استبيان قصير ليُعدّ الذكاء الاصطناعي مسودة إعداد مدرستك، من الصفوف والتقويم إلى الرسوم والرسائل؛ ولا يُطبَّق شيء قبل موافقتك.",
  "ایک مختصر سوالنامے کے جواب دیں اور اے آئی آپ کے اسکول کی ترتیب کا مسودہ بناتا ہے، جماعتوں اور کیلنڈر سے فیس اور پیغامات تک؛ آپ کی منظوری سے پہلے کچھ لاگو نہیں ہوتا۔",
];
/** A campus operator sees the Exam Studio card only while it is the academic lead (no principal appointed). */
export const ADMIN_EXAM_CARD: Localized = [
  "Until a principal is appointed, create exams here: AI builds the paper, you review it, then it is delivered and marked securely.",
  "إلى أن يُعيَّن مدير أكاديمي، أنشئ الاختبارات من هنا: يبني الذكاء الاصطناعي الورقة، وتراجعها أنت، ثم تُقدَّم وتُصحَّح بأمان.",
  "تعلیمی سربراہ کی تقرری تک امتحان یہیں بنائیں: اے آئی پرچہ تیار کرتا ہے، آپ جائزہ لیتے ہیں، پھر یہ محفوظ طریقے سے لیا اور جانچا جاتا ہے۔",
];

export const adminSchoolTour: TourDef = {
  id: "admin-school", version: 1, console: "admin",
  steps: [
    {
      id: "two-hats", anchor: "shell.header.account",
      title: ["Your two roles", "دوراك", "آپ کے دو کردار"],
      // Account ownership (and billing) is claimed only for the subscription holder (`billing` = canOwnSubscription);
      // a standalone ADMIN without the owner flag or a purchase delegation (legacy, provisioned rows) reads the rest.
      body: [
        "You are the school admin: daily operations and school-wide settings are both yours.",
        "أنت مدير المدرسة: العمليات اليومية والإعدادات على مستوى المدرسة كلاهما من مسؤوليتك.",
        "آپ اسکول منتظم ہیں: روزمرہ انتظام اور پورے اسکول کی ترتیبات دونوں آپ کے ذمے ہیں۔",
      ],
      variants: [{
        when: "billing",
        body: [
          "You are the school admin and the account owner: daily operations and the school's account are both yours.",
          "أنت مدير المدرسة ومالك الحساب: العمليات اليومية وحساب المدرسة كلاهما من مسؤوليتك.",
          "آپ اسکول منتظم بھی ہیں اور اکاؤنٹ کے مالک بھی: روزمرہ انتظام اور اسکول کا اکاؤنٹ دونوں آپ کے ذمے ہیں۔",
        ],
      }],
    },
    flagshipCardStep("admin", "ai", ADMIN_AI_CARD, { view: "overview" }),
    flagshipCardStep("admin", "exams", ADMIN_EXAM_CARD, { view: "overview" }, ["academicLead"]),
    {
      id: "queue", anchor: "work.today.queue", view: "overview",
      title: ["Waiting on you", "بانتظارك", "آپ کے منتظر"],
      body: [
        "Registers, leave, refunds and complaints waiting on you, in one list.",
        "سجلات الحضور والإجازات والمبالغ المستردة والشكاوى التي تنتظرك، في قائمة واحدة.",
        "حاضری رجسٹر، چھٹیاں، رقم کی واپسی اور شکایات جو آپ کی منتظر ہیں، ایک ہی فہرست میں۔",
      ],
    },
    {
      // Today's header actions, not the primary button: while AI setup is pending the flagship card is THE primary
      // action of the screen and Add student steps down to a secondary, so `page.primary-action` would not exist.
      // The action row holds Add student and Bulk import in both states (button names as the UI translates them).
      id: "add-student", anchor: "page.actions", view: "overview",
      title: ["Enrol students", "تسجيل الطلاب", "طلبہ کا داخلہ"],
      body: [
        "Enrol one student with Add student, or a whole class at once with Bulk import.",
        "سجّل طالبًا واحدًا عبر «إضافة طالب»، أو صفًا كاملًا دفعة واحدة عبر «استيراد جماعي».",
        "«طالب علم شامل کریں» سے ایک طالب علم داخل کریں، یا «اجتماعی درآمد» سے پوری جماعت ایک ساتھ۔",
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
      id: "academics", anchor: "shell.nav-group.academics",
      title: ["Academics", "الشؤون الأكاديمية", "تعلیمی امور"],
      body: [
        "Classes, timetable, exams and report cards; academic approvals move to your principal once you appoint one.",
        "الصفوف والجدول والامتحانات وبطاقات التقارير؛ وتنتقل الموافقات الأكاديمية إلى المدير الأكاديمي بمجرد تعيينه.",
        "جماعتیں، نظام الاوقات، امتحانات اور رپورٹ کارڈ؛ تعلیمی سربراہ مقرر کرنے کے بعد تعلیمی منظوریاں اس کے پاس چلی جاتی ہیں۔",
      ],
      variants: [{
        when: "hasPrincipal",
        body: [
          "Classes and the academic overview; your principal runs timetable, exams and results.",
          "الصفوف والنظرة الأكاديمية العامة؛ ويتولى المدير الأكاديمي الجدول والامتحانات والنتائج.",
          "جماعتیں اور تعلیمی جائزہ؛ نظام الاوقات، امتحانات اور نتائج آپ کا تعلیمی سربراہ سنبھالتا ہے۔",
        ],
      }],
    },
    {
      id: "staff", anchor: "shell.nav.staff-invites",
      title: ["Staff & leaders", "الموظفون والقادة", "عملہ اور سربراہان"],
      body: [
        "Invite teachers and office staff, and appoint your principal.",
        "ادعُ المعلمين وموظفي المكتب، وعيّن مديرك الأكاديمي.",
        "اساتذہ اور دفتری عملے کو مدعو کریں اور اپنا تعلیمی سربراہ مقرر کریں۔",
      ],
    },
    {
      id: "fees", anchor: "shell.nav.fees", requires: ["fees"],
      title: ["Fees", "الرسوم", "فیس"],
      body: [
        "Your accountant records payments; you follow collection and approve refunds.",
        "يسجّل المحاسب المدفوعات، وأنت تتابع التحصيل وتوافق على المبالغ المستردة.",
        "ادائیگیاں آپ کا اکاؤنٹنٹ درج کرتا ہے؛ آپ وصولی پر نظر رکھتے ہیں اور رقم کی واپسی منظور کرتے ہیں۔",
      ],
      variants: [{
        when: "financeDesk",
        body: [
          "Issue invoices, record payments and approve refunds until you add an accountant.",
          "أصدر الفواتير وسجّل المدفوعات ووافق على المبالغ المستردة حتى تضيف محاسبًا.",
          "اکاؤنٹنٹ شامل کرنے تک انوائس جاری کریں، ادائیگیاں درج کریں اور رقم کی واپسی منظور کریں۔",
        ],
      }],
    },
    {
      id: "your-school", anchor: "shell.nav-group.your-school", requires: ["standaloneOwner"],
      title: ["Your school", "مدرستك", "آپ کا اسکول"],
      body: [
        "School-wide tools: support approvals, who can manage members, and school settings.",
        "أدوات المدرسة: موافقات الدعم، ومن يمكنه إدارة الأعضاء، وإعدادات المدرسة.",
        "پورے اسکول کے اختیارات: سپورٹ کی منظوریاں، اراکین کا انتظام کون کرے، اور اسکول کی ترتیبات۔",
      ],
      variants: [{
        when: "billing",
        body: [
          "Owner tools: billing, support approvals, who can manage members, and school settings.",
          "أدوات المالك: الفوترة، وموافقات الدعم، ومن يمكنه إدارة الأعضاء، وإعدادات المدرسة.",
          "مالک کے اختیارات: بلنگ، سپورٹ کی منظوریاں، اراکین کا انتظام کون کرے، اور اسکول کی ترتیبات۔",
        ],
      }],
    },
    {
      id: "billing", anchor: "shell.nav.billing", requires: ["billing"],
      title: ["Billing & plan", "الفوترة والخطة", "بلنگ اور پلان"],
      body: [
        "Your SkooleeAI plan, kept separate from family fees; only you can see it.",
        "خطة SkooleeAI الخاصة بك، منفصلة عن رسوم الأسر؛ ولا يراها أحد سواك.",
        "آپ کا SkooleeAI پلان، خاندانوں کی فیس سے الگ؛ اسے صرف آپ دیکھ سکتے ہیں۔",
      ],
    },
    helpStep([
      "Replay this tour, report a problem or check your role from Help.",
      "من «المساعدة» أعد هذه الجولة، أو أبلغ عن مشكلة، أو راجع دورك.",
      "«مدد» سے یہ تعارفی دورہ دوبارہ دیکھیں، مسئلہ رپورٹ کریں یا اپنا کردار دیکھیں۔",
    ]),
  ],
};
