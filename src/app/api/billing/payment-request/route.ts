import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageBilling, errorResponse, requireAuthUser } from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canManageBilling(user)) throw new ApiError("Insufficient permissions", 403);

    const { plan, receiptRef } = await req.json();
    if (!plan || !["BASIC", "PRO", "ENTERPRISE"].includes(plan)) {
      throw new ApiError("Invalid plan", 400);
    }

    const config = await prisma.platformConfig.findUnique({ where: { key: "payment_requests" } });
    const requests = ((config?.value ?? []) as any[]) || [];
    const newRequest = {
      id: `req_${Date.now()}`,
      schoolId: user.schoolId,
      schoolName: user.fullName || user.email,
      plan,
      receiptRef: receiptRef || null,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    requests.push(newRequest);

    await prisma.platformConfig.upsert({
      where: { key: "payment_requests" },
      create: { key: "payment_requests", value: requests as any },
      update: { value: requests as any },
    });

    return Response.json({ success: true, message: "Payment notification sent to platform owner." });
  } catch (error) {
    return errorResponse(error, "[billing/payment-request] POST failed");
  }
}
