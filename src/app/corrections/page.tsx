import { getLocalePackage } from "@/lib/locale/store";
import { redirect } from "next/navigation";
import { requireAuthUser } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import CorrectionClient from "./view";
export default async function CorrectionsPage() {
    let user;
    try {
        user = await requireAuthUser();
    }
    catch {
        redirect("/login");
    }
    const prefs = await prisma.user.findUnique({ where: { id: user.userId }, select: { preferredLanguage: true } });
    const locale = await getLocalePackage(user.schoolId, user.campusId);
    return <CorrectionClient initialLocale={locale} actorId={user.userId} schoolId={user.schoolId} initialLanguage={prefs?.preferredLanguage ?? "en"} initialKind={user.role === "ACCOUNTANT" ? "PAYMENT" : "MARK"}/>;
}
