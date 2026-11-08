import type { TourDef } from "./types";
import { EXAM_CARD_BODY, aiWorkflowsStep, examStudioStep, flagshipCardStep, helpStep } from "./resolve";

/**
 * Academic console (PRINCIPAL). SPEC §9.7 `principal` v1, plus both flagships (addendum 2026-10-22): the Today cards
 * first, then AI Workflows and Exam Studio right after the Today steps, in sidebar order. AI Workflows replaces the
 * old "AI assistant" step (that row is no longer in the sidebar).
 */
export const principalTour: TourDef = {
  id: "principal", version: 1, console: "principal",
  steps: [
    flagshipCardStep("principal", "ai", [
      "Run AI workflows for timetables, exam sessions and announcements; you review every draft before it applies.",
      "شغّل مسارات الذكاء الاصطناعي للجداول وجلسات الامتحانات والإعلانات؛ وتراجع كل مسودة قبل تطبيقها.",
      "نظام الاوقات، امتحانی سیشنز اور اعلانات کے لیے اے آئی ورک فلوز چلائیں؛ ہر مسودہ لاگو ہونے سے پہلے آپ اس کا جائزہ لیتے ہیں۔",
    ], { view: "overview" }),
    flagshipCardStep("principal", "exams", EXAM_CARD_BODY, { view: "overview" }),
    {
      id: "queue", anchor: "work.today.queue", view: "overview",
      title: ["Waiting on you", "بانتظارك", "آپ کے منتظر"],
      body: [
        "Report approvals, teachers' leave and missing registers reach you here.",
        "تصلك هنا موافقات التقارير وإجازات المعلمين وسجلات الحضور الناقصة.",
        "رپورٹ کی منظوریاں، اساتذہ کی چھٹیاں اور نامکمل حاضری رجسٹر یہاں آپ تک پہنچتے ہیں۔",
      ],
    },
    {
      // Today's primary action is "Review report cards" only with report access; without it there is nothing to ring.
      id: "review-reports", anchor: "page.primary-action", view: "overview", requires: ["reports"],
      title: ["Review report cards", "مراجعة بطاقات التقارير", "رپورٹ کارڈ کا جائزہ"],
      body: [
        "Open the report cards waiting for your approval.",
        "افتح بطاقات التقارير التي تنتظر موافقتك.",
        "وہ رپورٹ کارڈ کھولیں جو آپ کی منظوری کے منتظر ہیں۔",
      ],
    },
    aiWorkflowsStep(),
    examStudioStep(),
    {
      id: "exams", anchor: "shell.nav.exams", requires: ["exams"],
      title: ["Exams & results", "الامتحانات والنتائج", "امتحانات اور نتائج"],
      body: [
        "Lock marks, review them and publish results once teachers have finished.",
        "اقفل الدرجات وراجعها وانشر النتائج بعد أن ينتهي المعلمون.",
        "اساتذہ کے کام مکمل کرنے پر نمبر لاک کریں، ان کا جائزہ لیں اور نتائج شائع کریں۔",
      ],
    },
    {
      id: "approve-reports", anchor: "principal.reports.approve", view: "report-cards", requires: ["reports"],
      title: ["Approve report cards", "اعتماد بطاقات التقارير", "رپورٹ کارڈ منظور کریں"],
      body: [
        "Approve report versions; the office then sends them to families.",
        "اعتمد نسخ التقارير، ثم يرسلها المكتب إلى الأسر.",
        "رپورٹ کے نسخے منظور کریں؛ اس کے بعد دفتر انہیں خاندانوں کو بھیجتا ہے۔",
      ],
    },
    {
      id: "timetable", anchor: "shell.nav.timetable", requires: ["timetable"],
      title: ["Timetable & cover", "الجدول والبدلاء", "نظام الاوقات اور متبادل"],
      body: [
        "Build and publish the timetable and arrange cover.",
        "أنشئ الجدول وانشره ورتّب الحصص البديلة.",
        "نظام الاوقات بنائیں، شائع کریں اور متبادل اساتذہ کا انتظام کریں۔",
      ],
    },
    {
      id: "teacher-performance", anchor: "shell.nav.teacher-performance", requires: ["staff"],
      title: ["Teacher performance", "أداء المعلمين", "اساتذہ کی کارکردگی"],
      body: [
        "Record teaching evidence and support notes for each teacher.",
        "سجّل شواهد التدريس وملاحظات الدعم لكل معلم.",
        "ہر استاد کے لیے تدریسی شواہد اور معاونتی نوٹس درج کریں۔",
      ],
    },
    {
      id: "leave", anchor: "shell.nav.leave-approvals", requires: ["leave"],
      title: ["Leave approvals", "الموافقة على الإجازات", "رخصت کی منظوریاں"],
      body: [
        "Decide teachers' leave with cover in mind.",
        "قرّر إجازات المعلمين مع مراعاة توفير البدلاء.",
        "متبادل انتظام کو مدنظر رکھتے ہوئے اساتذہ کی چھٹیوں کا فیصلہ کریں۔",
      ],
    },
    {
      id: "learning-actions", anchor: "shell.nav.learning-actions",
      title: ["Learning actions", "إجراءات التعلّم", "تعلیمی اقدامات"],
      body: [
        "Activate the support plans teachers propose for students.",
        "فعّل خطط الدعم التي يقترحها المعلمون للطلاب.",
        "اساتذہ کے تجویز کردہ طلبہ کے معاونتی منصوبے فعال کریں۔",
      ],
    },
    helpStep([
      "Replay this tour or report a problem from Help.",
      "من «المساعدة» أعد هذه الجولة أو أبلغ عن مشكلة.",
      "«مدد» سے یہ تعارفی دورہ دوبارہ دیکھیں یا مسئلہ رپورٹ کریں۔",
    ]),
  ],
};
