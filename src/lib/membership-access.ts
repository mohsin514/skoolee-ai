import { ROLE_DASHBOARD_PATHS, type UserRole } from "@/lib/roles";

export const INVITABLE_ROLES = ["CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "STUDENT", "PARENT"] as const;
export type InvitableRole = typeof INVITABLE_ROLES[number];
export const MEMBERSHIP_TASKS: Record<UserRole, string[]> = {
  APP_OWNER: ["Operate the vendor platform"],
  SUPER_ADMIN: ["Manage the institution and its campuses"],
  ADMIN: ["Manage the assigned campus"],
  CAMPUS_ADMIN: ["Manage the assigned campus"],
  PRINCIPAL: ["Lead academic operations in the assigned campus"],
  TEACHER: ["Teach assigned classes", "Record attendance and marks"],
  ACCOUNTANT: ["Manage tuition and campus accounts"],
  LIBRARIAN: ["Manage campus books and loans"],
  RECEPTIONIST: ["Manage campus front desk and visitors"],
  STUDENT: ["View your own linked student records"],
  PARENT: ["View records for your explicitly linked children"],
};
const AR_TASKS: Record<UserRole, string[]> = {
 APP_OWNER: ["إدارة منصة المورّد"], SUPER_ADMIN: ["إدارة المؤسسة وفروعها"], ADMIN: ["إدارة الفرع المعيّن"], CAMPUS_ADMIN: ["إدارة الفرع المعيّن"], PRINCIPAL: ["قيادة العمليات الأكاديمية في الفرع المعيّن"], TEACHER: ["تدريس الفصول المعيّنة", "تسجيل الحضور والدرجات"], ACCOUNTANT: ["إدارة الرسوم وحسابات الفرع"], LIBRARIAN: ["إدارة الكتب والإعارات"], RECEPTIONIST: ["إدارة الاستقبال والزوار"], STUDENT: ["عرض سجلات الطالب المرتبط بحسابك فقط"], PARENT: ["عرض سجلات الأطفال المرتبطين بحسابك صراحةً"]
};
const UR_TASKS: Record<UserRole, string[]> = {
 APP_OWNER: ["وینڈر پلیٹ فارم چلائیں"], SUPER_ADMIN: ["ادارے اور اس کے کیمپس کا انتظام کریں"], ADMIN: ["مقررہ کیمپس کا انتظام کریں"], CAMPUS_ADMIN: ["مقررہ کیمپس کا انتظام کریں"], PRINCIPAL: ["مقررہ کیمپس کے تعلیمی امور کی قیادت کریں"], TEACHER: ["مقررہ کلاسوں کو پڑھائیں", "حاضری اور نمبر درج کریں"], ACCOUNTANT: ["فیس اور کیمپس اکاؤنٹس کا انتظام کریں"], LIBRARIAN: ["کیمپس کی کتابوں اور ادھار کا انتظام کریں"], RECEPTIONIST: ["کیمپس کے استقبالیہ اور آنے والوں کا انتظام کریں"], STUDENT: ["صرف اپنے منسلک طالب علم کے ریکارڈ دیکھیں"], PARENT: ["صرف واضح طور پر منسلک بچوں کے ریکارڈ دیکھیں"]
};
export function membershipPreview(role: UserRole, purchasing = false, management = false, language: "en" | "ar" | "ur" = "en") {
  if (language === "ar") return { tasks: AR_TASKS[role], landing: ROLE_DASHBOARD_PATHS[role], purchasing: purchasing ? "تم تفويض شراء الاشتراك صراحةً." : "لا تشمل الصلاحيات شراء الاشتراك.", management: management ? "تم تفويض إدارة العضويات ضمن هذا النطاق." : "لا تشمل الصلاحيات إدارة العضويات.", ownership: "لا تمنح هذه الدعوة ملكية المؤسسة.", rank: "لا تغيّر الرتبة الوظيفية والتبعية الإدارية صلاحيات التطبيق." };
  if (language === "ur") return { tasks: UR_TASKS[role], landing: ROLE_DASHBOARD_PATHS[role], purchasing: purchasing ? "سبسکرپشن خریدنے کی اجازت واضح طور پر دی گئی ہے۔" : "اس کردار میں سبسکرپشن خریدنے کی اجازت شامل نہیں۔", management: management ? "اس دائرہ کار میں رکنیت کے انتظام کی اجازت واضح طور پر دی گئی ہے۔" : "اس کردار میں رکنیت کے انتظام کی اجازت شامل نہیں۔", ownership: "یہ دعوت ادارے کی ملکیت نہیں دیتی۔", rank: "ملازمت کا عہدہ یا رپورٹنگ لائن ایپ کی اجازتیں تبدیل نہیں کرتی۔" };
  return { tasks: MEMBERSHIP_TASKS[role], landing: ROLE_DASHBOARD_PATHS[role],
    purchasing: purchasing ? "Subscription purchasing is explicitly delegated." : "Subscription purchasing is not included.",
    management: management ? "Membership management is explicitly delegated within this scope." : "Membership management is not included.",
    ownership: "This invitation does not grant institution ownership.",
    rank: "Employment rank and reporting appointments do not change application permissions." };
}
