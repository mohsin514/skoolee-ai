import type { TourDef } from "./types";
import { aiWorkflowsStep, flagshipCardStep, helpStep } from "./resolve";

/**
 * Group console (SUPER_ADMIN of a GROUP). SPEC §9.7 `super` v1, plus the AI Workflows flagship (addendum 2026-10-22):
 * the Overview card, then its sidebar entry. AR/UR to be reviewed by a native reader.
 */
export const superTour: TourDef = {
  id: "super", version: 1, console: "super",
  steps: [
    {
      id: "scope", anchor: "shell.header.scope",
      title: ["Your scope", "نطاق عملك", "آپ کا دائرہ کار"],
      body: [
        "You are working across the whole group; open a campus and its name appears here.",
        "أنت تعمل على مستوى المجموعة كلها؛ افتح فرعًا وسيظهر اسمه هنا.",
        "آپ پورے ادارے کی سطح پر کام کر رہے ہیں؛ کوئی کیمپس کھولیں تو اس کا نام یہاں نظر آئے گا۔",
      ],
    },
    flagshipCardStep("super", "ai", [
      "Review campus readiness and delegate setup to campus administrators. Each campus team reviews and applies its own operational changes.",
      "راجع جاهزية الفروع وفوّض الإعداد إلى مسؤوليها. يراجع كل فريق تغييرات فرعه ويطبقها.",
      "کیمپس کی تیاری دیکھیں اور سیٹ اپ کیمپس منتظمین کو سونپیں۔ ہر کیمپس کی ٹیم اپنی تبدیلیوں کا جائزہ لے کر انہیں نافذ کرتی ہے۔",
    ], { view: "overview" }),
    {
      id: "attention", anchor: "super.overview.attention", view: "overview",
      title: ["Needs your decision", "بانتظار قرارك", "آپ کے فیصلے کے منتظر"],
      body: [
        "Decisions waiting on you collect here first: support access, policy reviews and campuses missing a leader.",
        "تتجمع هنا أولًا القرارات التي تنتظرك: وصول الدعم، ومراجعات السياسات، والفروع التي تفتقد قائدًا.",
        "آپ کے منتظر فیصلے سب سے پہلے یہاں جمع ہوتے ہیں: سپورٹ رسائی، پالیسی کے جائزے اور وہ کیمپس جن کا سربراہ مقرر نہیں۔",
      ],
    },
    aiWorkflowsStep([
      "Use this workspace to review shared policies and delegated setup tasks. Campus administrators complete their campus questionnaire.",
      "راجع السياسات المشتركة ومهام الإعداد المفوّضة هنا. يُكمل مسؤولو الفروع استبيان كل فرع.",
      "یہاں مشترکہ پالیسیوں اور سونپے گئے سیٹ اپ کاموں کا جائزہ لیں۔ کیمپس منتظمین اپنے کیمپس کا سوالنامہ مکمل کرتے ہیں۔",
    ]),
    {
      id: "campuses", anchor: "shell.nav.campuses",
      title: ["Campuses", "الفروع", "کیمپس"],
      body: [
        "Open a campus to see its results, edit its details or appoint who runs it.",
        "افتح فرعًا لترى نتائجه أو تعدّل بياناته أو تعيّن من يديره.",
        "کسی کیمپس کو کھول کر اس کے نتائج دیکھیں، تفصیلات میں ترمیم کریں یا اس کا منتظم مقرر کریں۔",
      ],
    },
    {
      id: "add-campus", anchor: "page.primary-action", view: "campuses",
      title: ["Add a campus", "إضافة فرع", "نیا کیمپس شامل کریں"],
      body: [
        "Add a campus; you appoint its campus admin and principal straight after.",
        "أضف فرعًا، ثم عيّن مدير الفرع والمدير الأكاديمي مباشرةً بعد ذلك.",
        "کیمپس شامل کریں؛ اس کے فوراً بعد کیمپس منتظم اور تعلیمی سربراہ مقرر کریں۔",
      ],
    },
    {
      id: "access", anchor: "shell.nav.access", requires: ["institutionAuthority"],
      title: ["People & access", "الأشخاص والصلاحيات", "افراد اور رسائی"],
      body: [
        "Appoint campus leaders, choose who may invite staff, and set role permissions.",
        "عيّن قادة الفروع، واختر من يحق له دعوة الموظفين، واضبط صلاحيات الأدوار.",
        "کیمپس کے سربراہ مقرر کریں، طے کریں کہ کون عملے کو مدعو کر سکتا ہے، اور کرداروں کی اجازتیں ترتیب دیں۔",
      ],
    },
    {
      id: "standards", anchor: "shell.nav.standards", requires: ["groupConsole"],
      title: ["Group standards", "معايير المجموعة", "گروپ کے معیارات"],
      body: [
        "Set curriculum templates and group policy once; campuses ask here for exceptions.",
        "حدّد قوالب المناهج وسياسة المجموعة مرة واحدة؛ وتطلب الفروع الاستثناءات من هنا.",
        "نصاب کے سانچے اور ادارے کی پالیسی ایک بار طے کریں؛ کیمپس استثنا کی درخواست یہیں کرتے ہیں۔",
      ],
    },
    {
      id: "approvals", anchor: "shell.nav.approvals", requires: ["institutionAuthority"],
      title: ["Approvals", "الموافقات", "منظوریاں"],
      body: [
        "Approve or revoke SkooleeAI support access and sign off tax packages; two-step sign-in is required.",
        "وافق على وصول دعم SkooleeAI أو ألغِه، واعتمد الحزم الضريبية؛ يلزم تسجيل الدخول بخطوتين.",
        "SkooleeAI سپورٹ کی رسائی منظور یا منسوخ کریں اور ٹیکس پیکج کی توثیق کریں؛ دو مرحلہ سائن اِن ضروری ہے۔",
      ],
    },
    {
      id: "billing", anchor: "shell.nav.billing", requires: ["billing"],
      title: ["Billing & plan", "الفوترة والخطة", "بلنگ اور پلان"],
      body: [
        "Only you see the SkooleeAI subscription: plan, AI credits, payment method and renewals. Family fees never appear here.",
        "أنت وحدك ترى اشتراك SkooleeAI: الخطة ورصيد الذكاء الاصطناعي وطريقة الدفع والتجديدات. لا تظهر رسوم الأسر هنا أبدًا.",
        "SkooleeAI کی سبسکرپشن صرف آپ دیکھتے ہیں: پلان، اے آئی کریڈٹس، ادائیگی کا طریقہ اور تجدید۔ خاندانوں کی فیس یہاں کبھی نظر نہیں آتی۔",
      ],
    },
    {
      id: "settings", anchor: "shell.nav.settings", requires: ["institutionAuthority"],
      title: ["Settings", "الإعدادات", "ترتیبات"],
      body: [
        "School profile, language and region, sign-in, integrations, data rules and the activity log.",
        "ملف المدرسة، واللغة والمنطقة، وتسجيل الدخول، والتكاملات، وقواعد البيانات، وسجل النشاط.",
        "اسکول کا پروفائل، زبان اور خطہ، سائن اِن، انضمامات، ڈیٹا کے اصول اور سرگرمی کا ریکارڈ۔",
      ],
    },
    helpStep([
      "Replay this tour, report a problem or check your role from Help.",
      "من «المساعدة» أعد هذه الجولة، أو أبلغ عن مشكلة، أو راجع دورك.",
      "«مدد» سے یہ تعارفی دورہ دوبارہ دیکھیں، مسئلہ رپورٹ کریں یا اپنا کردار دیکھیں۔",
    ]),
  ],
};
