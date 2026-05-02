import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export default async function OperationalLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") || "";
  const billingPath =
    requestHeaders.get("x-billing-workspace") === "1" ||
    pathname.startsWith("/super/billing") ||
    pathname.startsWith("/dashboard/billing");

  if (user) {
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { status: true },
    });

    if (school?.status === "SUSPENDED" && !billingPath) {
      redirect("/subscription-suspended");
    }
  }

  return children;
}
