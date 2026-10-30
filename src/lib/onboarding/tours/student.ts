import type { TourDef } from "./types";
import { helpStep } from "./resolve";

/**
 * Learner (STUDENT, path console). SPEC §9.7 `student` v1. Exam Studio's delivery side stays prominent for learners
 * (addendum 2026-10-22): the Today card of upcoming online exams (while there are any), then "My online exams", which
 * sits right after Today in the sidebar, before the rest.
 */
export const studentTour: TourDef = {
  id: "student", version: 1, console: "student",
  steps: [
    {
      id: "next", anchor: "student.today.next", route: "/student",
      title: ["Up next", "التالي", "اگلا"],
      body: [
        "Your next class, task or exam is always at the top.",
        "حصتك أو مهمتك أو امتحانك التالي يظهر دائمًا في الأعلى.",
        "آپ کی اگلی کلاس، کام یا امتحان ہمیشہ سب سے اوپر ہوتا ہے۔",
      ],
    },
    {
      // Exam Studio's delivery side on Today (the flagship card of a learner). It is rendered only while online exams
      // are scheduled, so the step waits briefly and is skipped when there are none.
      id: "flagship-exams", anchor: "student.today.flagship-exams", route: "/student", requires: ["schoolAiExams"], waitMs: 900,
      title: ["Upcoming online exams", "الاختبارات الإلكترونية القادمة", "آنے والے آن لائن امتحانات"],
      body: [
        "Your scheduled online exams appear here, each one tap away, with the time it opens.",
        "تظهر هنا اختباراتك الإلكترونية المجدولة، كلٌّ منها على بُعد نقرة، مع موعد فتحه.",
        "آپ کے طے شدہ آن لائن امتحانات یہاں نظر آتے ہیں، ہر ایک بس ایک ٹیپ کی دوری پر، کھلنے کے وقت کے ساتھ۔",
      ],
    },
    {
      id: "online-exams", anchor: "shell.nav.online-exams",
      title: ["My online exams", "اختباراتي الإلكترونية", "میرے آن لائن امتحانات"],
      body: [
        "When your school schedules an online exam, open it here at the set time.",
        "عندما تحدد مدرستك امتحانًا إلكترونيًا، افتحه من هنا في موعده.",
        "جب اسکول آن لائن امتحان مقرر کرے تو مقررہ وقت پر اسے یہاں کھولیں۔",
      ],
    },
    {
      id: "work", anchor: "shell.nav.work", requires: ["timetable"],
      title: ["Work", "الأعمال", "کام"],
      body: [
        "Open homework, save a draft and hand it in.",
        "افتح الواجب، واحفظ مسودة، ثم سلّمه.",
        "ہوم ورک کھولیں، مسودہ محفوظ کریں اور جمع کرائیں۔",
      ],
    },
    {
      id: "timetable", anchor: "shell.nav.timetable", requires: ["timetable"],
      title: ["Timetable", "الجدول الدراسي", "نظام الاوقات"],
      body: [
        "Your week and your exam date sheet.",
        "أسبوعك وجدول مواعيد امتحاناتك.",
        "آپ کا ہفتہ اور امتحانات کی ڈیٹ شیٹ۔",
      ],
    },
    {
      id: "results", anchor: "shell.nav.results", requires: ["reports"],
      title: ["Results", "النتائج", "نتائج"],
      body: [
        "Your report cards; download any one.",
        "بطاقات تقاريرك؛ ويمكنك تنزيل أي منها.",
        "آپ کے رپورٹ کارڈ؛ کوئی بھی ڈاؤن لوڈ کریں۔",
      ],
    },
    {
      id: "more", anchor: "shell.nav-group.more", mobile: { anchor: "shell.mobile.more" },
      title: ["More", "المزيد", "مزید"],
      body: [
        "Study help, your portfolio, attendance and more.",
        "المساعدة في الدراسة وملف إنجازك والحضور وغير ذلك.",
        "پڑھائی میں مدد، آپ کا پورٹ فولیو، حاضری اور بہت کچھ۔",
      ],
    },
    helpStep([
      "Replay this tour from Help.",
      "أعد هذه الجولة من «المساعدة».",
      "«مدد» سے یہ تعارفی دورہ دوبارہ دیکھیں۔",
    ]),
  ],
};
