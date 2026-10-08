import type { NotificationTemplateKey } from "@/lib/notifications/templates";
export const arabicNotificationCopy: Record<NotificationTemplateKey, { title: string; subject: string; body: string }> = {
 ATTENDANCE_ALERT: { title: "تنبيه الحضور", subject: "تنبيه الحضور للطالب {{studentName}}", body: "عزيزي {{parentName}}،\n\nسُجل غياب {{studentName}} بتاريخ {{date}}. عدد مرات الغياب في الفترة الأخيرة: {{absenceCount}}.\n\nيرجى التواصل مع {{campusName}} للمساعدة.\n\n{{schoolName}}" },
 FEE_DUE_REMINDER: { title: "تذكير بالرسوم", subject: "تذكير برسوم {{studentName}}", body: "عزيزي {{parentName}}،\n\nنذكركم بأن رسوم {{studentName}} عن {{term}} بمبلغ {{balanceDue}} تستحق بتاريخ {{dueDate}}.\n\nيرجى تجاهل الرسالة إذا تم الدفع.\n\n{{schoolName}}" },
 FEE_OVERDUE_REMINDER: { title: "تذكير برسوم متأخرة", subject: "رسوم متأخرة للطالب {{studentName}}", body: "عزيزي {{parentName}}،\n\nتأخر سداد رسوم {{studentName}} عن {{term}} بمبلغ {{balanceDue}} المستحقة بتاريخ {{dueDate}}.\n\nيرجى التواصل مع {{campusName}} للمساعدة في الدفع.\n\n{{schoolName}}" },
 EXAM_SCHEDULE: { title: "جدول الاختبارات", subject: "جدول اختبارات {{studentName}}", body: "عزيزي {{parentName}}،\n\nتم تحديد {{examTitle}} للصف {{className}} للفصل {{term}} من العام الدراسي {{academicYear}}. يرجى مساعدة {{studentName}} في الاستعداد واتباع تعليمات الحرم.\n\n{{schoolName}}" },
 REPORT_CARD_PUBLISHED: { title: "نشر التقرير الدراسي", subject: "تقرير {{studentName}} جاهز", body: "عزيزي {{parentName}}،\n\nتم نشر تقرير {{studentName}} لاختبار {{examTitle}}.\n\nالتقدير: {{grade}}\nالنسبة: {{percentage}}%\n\n{{viewInstruction}}\n\n{{schoolName}}" },
 PARENT_MEETING_INVITE: { title: "دعوة لاجتماع أولياء الأمور", subject: "دعوة لاجتماع أولياء الأمور", body: "عزيزي {{parentName}}،\n\nندعوكم لاجتماع بخصوص {{studentName}} بتاريخ {{meetingDate}} الساعة {{meetingTime}}.\n\nالمكان: {{meetingLocation}}\n\n{{schoolName}}" },
 GENERAL_ANNOUNCEMENT: { title: "إعلان عام", subject: "{{announcementTitle}}", body: "عزيزي {{parentName}}،\n\n{{announcementBody}}\n\n{{schoolName}}" },
 MARKS_ENTRY_DEADLINE_NEAR: { title: "اقتراب موعد إدخال الدرجات", subject: "اقتراب موعد إدخال الدرجات", body: "عزيزي {{recipientName}}،\n\nآخر موعد لإدخال درجات {{examTitle}} هو {{deadlineDate}}. يرجى إكمال الدرجات المتبقية للصف {{className}}.\n\n{{schoolName}}" },
 PRINCIPAL_REVIEW_PENDING: { title: "بانتظار مراجعة المدير", subject: "مراجعة المدير لاختبار {{examTitle}}", body: "عزيزي {{recipientName}}،\n\nتقارير {{examTitle}} للصف {{className}} جاهزة لمراجعة المدير.\n\nالتقارير المتبقية: {{pendingCount}}\n\n{{schoolName}}" },
 REPORT_CARD_GENERATED: { title: "إنشاء التقارير الدراسية", subject: "تم إنشاء تقارير {{examTitle}}", body: "عزيزي {{recipientName}}،\n\nتم إنشاء تقارير {{examTitle}} وهي بانتظار المراجعة والنشر.\n\nعدد التقارير: {{reportCount}}\n\n{{schoolName}}" },
};
export function notificationHtml(body: string, language: "en" | "ar") {
 const escaped = body.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
 return `<div lang="${language}" dir="${language === "ar" ? "rtl" : "ltr"}" style="white-space:pre-wrap;text-align:${language === "ar" ? "right" : "left"}">${escaped}</div>`;
}
