import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { canManageOperations } from "@/lib/api/scope";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { studentScope } from "@/lib/auth/policy";
import { GuardianAccessManager } from "@/components/GuardianAccessManager";

export const dynamic = "force-dynamic";

export default async function GuardianAccessPage() {
  const user = await getAuthUser();
  if (!user || !canManageOperations(user)) redirect("/dashboard/students");
  try {
    await assertPermission(user, "students", "edit");
  } catch {
    redirect("/dashboard/students");
  }
  const [students, account] = await Promise.all([
    prisma.student.findMany({
      where: studentScope(user),
      select: { id: true, fullName: true, rollNo: true, campus: { select: { name: true } }, class: { select: { name: true, section: true } } },
      orderBy: [{ fullName: "asc" }, { rollNo: "asc" }],
    }),
    prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { preferredLanguage: true } }),
  ]);
  const locale = account?.preferredLanguage === "ar" || account?.preferredLanguage === "ur" ? account.preferredLanguage : "en";
  return <main className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6" dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"}>
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8127cf]">{locale === "ar" ? "سجلات المدرسة" : locale === "ur" ? "اسکول ریکارڈز" : "School records"}</p>
      <h1 className="text-2xl font-bold tracking-tight text-[#1d1b20]">{locale === "ar" ? "أولياء الأمور والصلاحيات" : locale === "ur" ? "سرپرست اور رسائی" : "Guardians and access"}</h1>
      <p className="max-w-3xl text-sm leading-6 text-ink-muted">{locale === "ar" ? "اربط كل سرپرست بطفل محدد وراجع صلاحياته قبل تفعيل الدعوة." : locale === "ur" ? "ہر سرپرست کو ایک مخصوص طالب علم سے جوڑیں اور دعوت فعال کرنے سے پہلے اجازتیں دیکھیں۔" : "Link each guardian to one child and review the access they will receive before activating an invitation."}</p>
    </header>
    <GuardianAccessManager students={students} locale={locale} />
  </main>;
}
