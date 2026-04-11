// ===========================================
// POST /api/stripe/portal
// ===========================================
// Creates a Stripe billing portal session.

import { getAuthUser } from "@/lib/auth";
import { getTenantForUser } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";
import { createPortalSession } from "@/lib/stripe/server";

export async function POST() {
  try {
    const user = await getAuthUser();
    const userId = user?.userId;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json({ error: "No tenant found" }, { status: 403 });
    }

    const tenantRecord = await prisma.school.findUnique({
      where: { id: tenant.schoolId },
    });
    if (!tenantRecord?.stripeCustomerId) {
      return Response.json(
        { error: "No billing account found" },
        { status: 400 }
      );
    }

    const url = await createPortalSession(tenantRecord.stripeCustomerId);
    return Response.json({ url });
  } catch (error) {
    console.error("[stripe/portal] Error:", error);
    return Response.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
