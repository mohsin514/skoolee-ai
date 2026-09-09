import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { prisma } from "@/lib/db/prisma";

export default async function OperationalLayout({ children }: { children: React.ReactNode }) {
  // Was getAuthUser(), whose null result fell through to rendering the console
  // anyway. That was survivable only while the proxy guaranteed a live session;
  // now that a signed-out token can reach the render, null has to mean "go to
  // /login" rather than "no suspension check to do".
  const user = await requirePageSession();
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") || "";
  const billingPath =
    requestHeaders.get("x-billing-workspace") === "1" ||
    pathname.startsWith("/super/billing") ||
    pathname.startsWith("/dashboard/billing");

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { status: true },
  });

  if (school?.status === "SUSPENDED" && !billingPath) {
    redirect("/subscription-suspended");
  }

  return children;
}
