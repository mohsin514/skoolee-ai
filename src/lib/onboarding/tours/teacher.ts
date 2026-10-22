import type { TourDef } from "./types";
import { EXAM_CARD_BODY, examStudioStep, flagshipCardStep, helpStep } from "./resolve";

/**
 * Teaching (TEACHER, path console). SPEC §9.7 `teacher` v1, plus the teacher's flagship (addendum 2026-10-22): the
 * Exam Studio card on Today, then its sidebar entry right after the Today steps.
 */
export const teacherTour: TourDef = {
  id: "teacher", version: 1, console: "teacher",
  steps: [
    {
      id: "check-in", anchor: "teacher.today.checkin", route: "/teacher",
      title: ["Check in", "تسجيل الحضور", "آمد درج کریں"],
      body: [
        "Tap once when you arrive to check in.",
        "اضغط مرة واحدة عند وصولك لتسجيل حضورك.",
        "پہنچنے پر ایک بار ٹیپ کر کے اپنی آمد درج کریں۔",
      ],
    },
    {
      id: "schedule", anchor: "teacher.today.schedule", route: "/teacher",
      title: ["Today's lessons", "حصص اليوم", "آج کے اسباق"],
      body: [
        "Your lessons today, with rooms and times.",
        "حصصك اليوم مع القاعات والأوقات.",
        "آج کے آپ کے اسباق، کمروں اور اوقات کے ساتھ۔",
      ],
    },
    flagshipCardStep("teacher", "exams", EXAM_CARD_BODY, { route: "/teacher" }),
    {
      id: "take-register", anchor: "page.primary-action", route: "/teacher",
      title: ["Take register", "أخذ الحضور", "حاضری لیں"],
      body: [
        "Open the register for your next class.",
        "افتح سجل الحضور لصفك التالي.",
        "اپنی اگلی جماعت کا حاضری رجسٹر کھولیں۔",
      ],
    },
    examStudioStep(),
    {
      id: "attendance", anchor: "shell.nav.attendance", requires: ["attendance"],
      title: ["Attendance", "الحضور", "حاضری"],
      body: [
        "Mark, review and submit registers, and decide absence explanations.",
        "سجّل الحضور وراجعه وأرسله، وقرّر في مبررات الغياب.",
        "حاضری لگائیں، دیکھیں اور جمع کرائیں، اور غیر حاضری کی وضاحتوں کا فیصلہ کریں۔",
      ],
    },
    {
      id: "marks", anchor: "shell.nav.marks", requires: ["exams"],
      title: ["Marks", "الدرجات", "نمبر"],
      body: [
        "Enter marks in the grid; save when the bar asks.",
        "أدخل الدرجات في الجدول، واحفظ عندما يطلب منك الشريط ذلك.",
        "گرڈ میں نمبر درج کریں؛ پٹی کہے تو محفوظ کریں۔",
      ],
    },
    {
      id: "tests", anchor: "shell.nav.tests", requires: ["exams"],
      title: ["Tests & quizzes", "الاختبارات القصيرة", "ٹیسٹ اور کوئز"],
      body: [
        "Create quizzes and class tests, then lock the marks when you have finished.",
        "أنشئ الاختبارات القصيرة والصفية، ثم اقفل الدرجات عند الانتهاء.",
        "کوئز اور جماعتی ٹیسٹ بنائیں، پھر کام مکمل ہونے پر نمبر لاک کریں۔",
      ],
    },
    {
      id: "homework", anchor: "shell.nav.homework", requires: ["timetable"],
      title: ["Homework", "الواجبات المنزلية", "ہوم ورک"],
      body: [
        "Set homework, see who handed it in and return feedback.",
        "حدّد الواجبات، واعرف من سلّمها، وأعد الملاحظات.",
        "ہوم ورک دیں، دیکھیں کس نے جمع کرایا اور رائے واپس بھیجیں۔",
      ],
    },
    {
      id: "classes", anchor: "shell.nav-group.classes",
      title: ["My classes", "صفوفي", "میری جماعتیں"],
      body: [
        "Each class's students, resources, portfolios and objective map.",
        "طلاب كل صف وموارده وملفات الإنجاز وخريطة الأهداف.",
        "ہر جماعت کے طلبہ، وسائل، پورٹ فولیو اور مقاصد کا نقشہ۔",
      ],
    },
    {
      id: "messages", anchor: "shell.nav.messages",
      title: ["Messages", "الرسائل", "پیغامات"],
      body: [
        "Message families and colleagues; conversations stay on the school record.",
        "راسل الأسر والزملاء؛ وتبقى المحادثات ضمن سجل المدرسة.",
        "خاندانوں اور ساتھیوں کو پیغام بھیجیں؛ گفتگو اسکول کے ریکارڈ میں محفوظ رہتی ہے۔",
      ],
    },
    helpStep([
      "Report a problem, record a concern or replay this tour from Help.",
      "من «المساعدة» أبلغ عن مشكلة، أو سجّل مخاوف، أو أعد هذه الجولة.",
      "«مدد» سے مسئلہ رپورٹ کریں، تشویش درج کریں یا یہ تعارفی دورہ دوبارہ دیکھیں۔",
    ]),
  ],
};
