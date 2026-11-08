import type { TourDef } from "./types";
import { helpStep } from "./resolve";

/**
 * Front desk (RECEPTIONIST). SPEC §9.7 `receptionist` v1.
 * Offers are made by "your admin": a campus admin in a group, the school admin (or a deputy) in a standalone school
 * (§1.5 labels); no capability key visible to the desks tells the two apart, so the copy stays neutral.
 */
export const receptionistTour: TourDef = {
  id: "receptionist", version: 1, console: "receptionist",
  steps: [
    {
      id: "summary", anchor: "reception.today.summary", view: "dashboard",
      title: ["On site now", "في المدرسة الآن", "اس وقت موجود"],
      body: [
        "Who is on site, callbacks due and pickups waiting.",
        "من في المدرسة، والمكالمات التي يجب معاودتها، وحالات الاستلام المنتظرة.",
        "کون اسکول میں موجود ہے، کن کالز کا جواب دینا ہے اور کون سے بچے لینے والے منتظر ہیں۔",
      ],
    },
    {
      id: "check-in", anchor: "page.primary-action", view: "dashboard",
      title: ["Check in a visitor", "تسجيل دخول زائر", "مہمان کی آمد درج کریں"],
      body: [
        "Check a visitor in; check them out from the same list.",
        "سجّل دخول الزائر، وسجّل خروجه من القائمة نفسها.",
        "مہمان کی آمد درج کریں؛ اسی فہرست سے رخصتی بھی درج کریں۔",
      ],
    },
    {
      id: "pickup", anchor: "shell.nav.pickup", requires: ["front-desk"],
      title: ["Pickup", "الاستلام", "وصولی"],
      body: [
        "Verify the family's pickup code before releasing a child; escalate anything unusual.",
        "تحقق من رمز الاستلام الخاص بالأسرة قبل تسليم الطفل، وصعّد أي أمر غير معتاد.",
        "بچہ حوالے کرنے سے پہلے خاندان کا پک اپ کوڈ تصدیق کریں؛ کوئی غیر معمولی بات ہو تو آگے بڑھائیں۔",
      ],
    },
    {
      id: "pickup-check", anchor: "reception.pickup.check", view: "pickup", requires: ["front-desk"],
      title: ["Check the code", "تحقق من الرمز", "کوڈ جانچیں"],
      body: [
        "Enter or scan the code here.",
        "أدخل الرمز أو امسحه هنا.",
        "کوڈ یہاں درج کریں یا اسکین کریں۔",
      ],
    },
    {
      id: "admissions", anchor: "shell.nav.admissions", requires: ["admissions"],
      title: ["Admissions", "القبول", "داخلے"],
      body: [
        "Log enquiries and move applications forward; your admin makes offers.",
        "سجّل الاستفسارات وتابع الطلبات؛ وتقدّم الإدارة عروض القبول.",
        "داخلے کے سوالات درج کریں اور درخواستیں آگے بڑھائیں؛ داخلے کی پیشکش انتظامیہ کرتی ہے۔",
      ],
    },
    {
      id: "calls", anchor: "shell.nav.calls", requires: ["front-desk"],
      title: ["Phone calls", "المكالمات الهاتفية", "فون کالز"],
      body: [
        "Log calls and the callbacks you owe.",
        "سجّل المكالمات والمكالمات التي عليك معاودتها.",
        "کالز اور واپس کی جانے والی کالز درج کریں۔",
      ],
    },
    {
      id: "complaints", anchor: "shell.nav.complaints", requires: ["front-desk"],
      title: ["Complaints", "الشكاوى", "شکایات"],
      body: [
        "Record complaints; confidential ones go straight to your leaders.",
        "سجّل الشكاوى؛ وتذهب السرية منها مباشرةً إلى القيادة.",
        "شکایات درج کریں؛ خفیہ شکایات براہِ راست انتظامیہ کو جاتی ہیں۔",
      ],
    },
    {
      id: "documents", anchor: "shell.nav.documents", requires: ["front-desk"],
      title: ["Documents", "المستندات", "دستاویزات"],
      body: [
        "Issue certificates from approved templates.",
        "أصدر الشهادات من القوالب المعتمدة.",
        "منظور شدہ سانچوں سے سرٹیفکیٹ جاری کریں۔",
      ],
    },
    helpStep([
      "Report a problem, record a concern or replay this tour from Help.",
      "من «المساعدة» أبلغ عن مشكلة، أو سجّل مخاوف، أو أعد هذه الجولة.",
      "«مدد» سے مسئلہ رپورٹ کریں، تشویش درج کریں یا یہ تعارفی دورہ دوبارہ دیکھیں۔",
    ]),
  ],
};
