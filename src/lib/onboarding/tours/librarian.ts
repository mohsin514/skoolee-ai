import type { TourDef } from "./types";
import { helpStep } from "./resolve";

/** Library (LIBRARIAN). SPEC §9.7 `librarian` v1. */
export const librarianTour: TourDef = {
  id: "librarian", version: 1, console: "librarian",
  steps: [
    {
      id: "summary", anchor: "library.today.summary", view: "dashboard",
      title: ["Library today", "المكتبة اليوم", "آج لائبریری میں"],
      body: [
        "Books on loan, overdue items and charges waiting.",
        "الكتب المُعارة والمتأخرة والرسوم المنتظرة.",
        "ادھار دی گئی کتابیں، تاخیر والی اشیا اور منتظر واجبات۔",
      ],
    },
    {
      id: "lending", anchor: "shell.nav.lending", requires: ["library"],
      title: ["Lending desk", "مكتب الإعارة", "اجرا کاؤنٹر"],
      body: [
        "The lending desk: issue, renew and return by scanning.",
        "مكتب الإعارة: أعِر وجدّد واستلم بالمسح الضوئي.",
        "اجرا کاؤنٹر: اسکین کر کے کتاب جاری کریں، تجدید کریں اور واپس لیں۔",
      ],
    },
    {
      id: "scan", anchor: "library.lending.scan", view: "lending", requires: ["library"],
      title: ["Scan to start", "امسح للبدء", "شروع کرنے کے لیے اسکین کریں"],
      body: [
        "Scan a reader card or a book barcode to start.",
        "امسح بطاقة القارئ أو الرمز الشريطي للكتاب للبدء.",
        "شروع کرنے کے لیے قاری کا کارڈ یا کتاب کا بارکوڈ اسکین کریں۔",
      ],
    },
    {
      id: "return", anchor: "library.lending.return", view: "lending", requires: ["library"],
      title: ["Return a book", "إرجاع كتاب", "کتاب واپس لیں"],
      body: [
        "Check the book's condition and confirm the return; any fine is shown first.",
        "تحقق من حالة الكتاب وأكّد الإرجاع؛ وتظهر أي غرامة أولًا.",
        "کتاب کی حالت دیکھیں اور واپسی کی تصدیق کریں؛ کوئی جرمانہ ہو تو پہلے دکھایا جاتا ہے۔",
      ],
    },
    {
      id: "catalogue", anchor: "shell.nav.catalogue", requires: ["library"],
      title: ["Catalogue & members", "الفهرس والأعضاء", "کیٹلاگ اور اراکین"],
      body: [
        "Add titles and barcoded copies, and manage members.",
        "أضف العناوين والنسخ ذات الرموز الشريطية، وأدر الأعضاء.",
        "عنوانات اور بارکوڈ والی کاپیاں شامل کریں اور اراکین کا انتظام کریں۔",
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
