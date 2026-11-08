import type { TourDef } from "./types";
import { helpStep } from "./resolve";

/** Family (PARENT, path console). SPEC §9.7 `parent` v1. */
export const parentTour: TourDef = {
  id: "parent", version: 1, console: "parent",
  steps: [
    {
      id: "child-switcher", anchor: "shell.parent.child-switcher", requires: ["multiChild"],
      title: ["Your children", "أبناؤك", "آپ کے بچے"],
      body: [
        "Switch between your children; every page follows your choice.",
        "بدّل بين أبنائك؛ وتتبع كل الصفحات اختيارك.",
        "اپنے بچوں کے درمیان انتخاب بدلیں؛ ہر صفحہ آپ کے انتخاب کے مطابق ہوتا ہے۔",
      ],
    },
    {
      id: "inbox", anchor: "parent.home.inbox", route: "/parent",
      title: ["Needs you first", "يحتاجك أولًا", "پہلے آپ کی توجہ"],
      body: [
        "Things that need you, such as consents, payments and absences, come first.",
        "تظهر أولًا الأمور التي تحتاجك، مثل الموافقات والمدفوعات والغياب.",
        "آپ کی توجہ کے منتظر معاملات، جیسے اجازت نامے، ادائیگیاں اور غیر حاضریاں، سب سے پہلے آتے ہیں۔",
      ],
    },
    {
      id: "fees", anchor: "shell.nav.fees", requires: ["fees"],
      title: ["Fees", "الرسوم", "فیس"],
      body: [
        "See what is due and pay online.",
        "اطّلع على المستحقات وادفع عبر الإنترنت.",
        "واجب الادا رقم دیکھیں اور آن لائن ادائیگی کریں۔",
      ],
    },
    {
      id: "attendance", anchor: "shell.nav.attendance", requires: ["attendance"],
      title: ["Attendance", "الحضور", "حاضری"],
      body: [
        "Explain an absence or ask for leave.",
        "برّر غيابًا أو اطلب إجازة.",
        "غیر حاضری کی وضاحت کریں یا چھٹی کی درخواست دیں۔",
      ],
    },
    {
      id: "results", anchor: "shell.nav.results", requires: ["reports"],
      title: ["Results", "النتائج", "نتائج"],
      body: [
        "Report cards and marks; download any card.",
        "بطاقات التقارير والدرجات؛ ويمكنك تنزيل أي بطاقة.",
        "رپورٹ کارڈ اور نمبر؛ کوئی بھی کارڈ ڈاؤن لوڈ کریں۔",
      ],
    },
    {
      id: "more", anchor: "shell.nav-group.more", mobile: { anchor: "shell.mobile.more" },
      title: ["More", "المزيد", "مزید"],
      body: [
        "Teacher meetings, timetable, activities, pickup and more live under More.",
        "اجتماعات المعلمين والجدول والأنشطة والاستلام وغيرها تجدها ضمن «المزيد».",
        "اساتذہ سے ملاقاتیں، نظام الاوقات، سرگرمیاں، واپسی اور بہت کچھ «مزید» میں موجود ہے۔",
      ],
    },
    helpStep([
      "Ask the school a question or replay this tour.",
      "اطرح سؤالًا على المدرسة أو أعد هذه الجولة.",
      "اسکول سے سوال پوچھیں یا یہ تعارفی دورہ دوبارہ دیکھیں۔",
    ]),
  ],
};
