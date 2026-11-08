import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";

/** Redirect hint only; setup-service still authorizes every read and write. */
export async function needsInstitutionSetup(userId: string, schoolId: string): Promise<boolean> {
  return runUnscoped("onboarding routing: authenticated identity and its named delegation only", async () => {
    const account = await prisma.user.findFirst({
      where: { id: userId, schoolId, isActive: true },
      select: { role: true, email: true, isInstitutionOwner: true, onboardingComplete: true, school: { select: { contactEmail: true } } },
    });
    if (!account || account.onboardingComplete || !["SUPER_ADMIN", "ADMIN"].includes(account.role)) return false;
    if (account.isInstitutionOwner && account.email.toLowerCase() === account.school.contactEmail.toLowerCase()) return true;
    return Boolean(await prisma.institutionSetup.findFirst({
      where: { schoolId, delegateUserId: userId, status: { not: "COMPLETED" } }, select: { id: true },
    }));
  });
}
