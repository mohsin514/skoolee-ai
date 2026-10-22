import type { TourDef } from "./types";
import { helpStep } from "./resolve";

/**
 * Finance desk (ACCOUNTANT). SPEC §9.7 `accountant` v1.
 * The checker is named "your admin": a campus admin in a group, the school admin (or a deputy) in a standalone school
 * (§1.5 labels). No capability key visible to the desks tells the two structures apart, so the copy stays neutral.
 */
export const accountantTour: TourDef = {
  id: "accountant", version: 1, console: "accountant",
  steps: [
    {
      id: "summary", anchor: "accountant.today.summary", view: "dashboard",
      title: ["Today's figures", "أرقام اليوم", "آج کے اعداد"],
      body: [
        "What was collected today, what is outstanding and what is waiting on you.",
        "ما حُصّل اليوم، وما هو مستحق، وما ينتظرك.",
        "آج کتنی وصولی ہوئی، کتنا باقی ہے اور کیا آپ کا منتظر ہے۔",
      ],
    },
    {
      id: "record-payment", anchor: "page.primary-action", view: "dashboard",
      title: ["Record a payment", "تسجيل دفعة", "ادائیگی درج کریں"],
      body: [
        "Record a payment and print the receipt.",
        "سجّل دفعة واطبع الإيصال.",
        "ادائیگی درج کریں اور رسید پرنٹ کریں۔",
      ],
    },
    {
      id: "collect", anchor: "shell.nav.collect", requires: ["fees"],
      title: ["Collect", "التحصيل", "وصولی"],
      body: [
        "Payments, receipts, bank imports and reconciliation.",
        "المدفوعات والإيصالات واستيراد كشوف البنك والتسوية.",
        "ادائیگیاں، رسیدیں، بینک اسٹیٹمنٹ کی درآمد اور مطابقت۔",
      ],
    },
    {
      id: "invoices", anchor: "shell.nav.invoices", requires: ["fees"],
      title: ["Invoices", "الفواتير", "بل"],
      body: [
        "Generate monthly invoices; refunds and waivers you request go to your admin for approval.",
        "أنشئ الفواتير الشهرية؛ وتذهب طلبات الاسترداد والإعفاء إلى الإدارة لاعتمادها.",
        "ماہانہ بل بنائیں؛ رقم کی واپسی اور چھوٹ کی آپ کی درخواستیں منظوری کے لیے انتظامیہ کو جاتی ہیں۔",
      ],
    },
    {
      id: "reports", anchor: "shell.nav.reports", requires: ["reports"],
      title: ["Reports & reminders", "التقارير والتذكيرات", "رپورٹیں اور یاد دہانیاں"],
      body: [
        "Find defaulters and send fee reminders.",
        "اعثر على المتأخرين في السداد وأرسل تذكيرات الرسوم.",
        "نادہندگان تلاش کریں اور فیس کی یاد دہانیاں بھیجیں۔",
      ],
    },
    {
      id: "books", anchor: "shell.nav-group.books",
      title: ["Books", "الدفاتر المالية", "مالی کھاتے"],
      body: [
        "Ledger, bank accounts and tax packages.",
        "دفتر الأستاذ والحسابات البنكية والحزم الضريبية.",
        "لیجر، بینک اکاؤنٹس اور ٹیکس پیکجز۔",
      ],
    },
    {
      id: "payroll", anchor: "shell.nav.payroll", requires: ["payroll"],
      title: ["Payroll", "الرواتب", "تنخواہیں"],
      body: [
        "Prepare the payroll run; your admin approves it.",
        "جهّز دورة الرواتب، وتعتمدها الإدارة.",
        "تنخواہوں کا مرحلہ تیار کریں؛ انتظامیہ اسے منظور کرتی ہے۔",
      ],
    },
    {
      id: "setup", anchor: "shell.nav-group.setup",
      title: ["Setup", "الإعداد", "تیاری"],
      body: [
        "Fee structures, discounts and fine rules; usually set once a year.",
        "هياكل الرسوم والخصومات وقواعد الغرامات؛ وتُضبط عادةً مرة في السنة.",
        "فیس کے ڈھانچے، رعایتیں اور جرمانے کے اصول؛ عموماً سال میں ایک بار طے ہوتے ہیں۔",
      ],
    },
    {
      id: "my-leave", anchor: "shell.header.account", requires: ["leave"],
      title: ["My leave", "إجازاتي", "میری رخصت"],
      body: [
        "Apply for leave from your account menu.",
        "قدّم طلب إجازة من قائمة حسابك.",
        "اپنے اکاؤنٹ مینو سے چھٹی کی درخواست دیں۔",
      ],
    },
    helpStep([
      "Replay this tour or report a problem from Help.",
      "من «المساعدة» أعد هذه الجولة أو أبلغ عن مشكلة.",
      "«مدد» سے یہ تعارفی دورہ دوبارہ دیکھیں یا مسئلہ رپورٹ کریں۔",
    ]),
  ],
};
