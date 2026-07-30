import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifySafePayNotification } from "@/lib/payments/safepay";
import { applySchoolPlan } from "@/lib/billing/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.SAFEPAY_SECRET_KEY;
    if (!secretKey) {
      return Response.json({ error: "SafePay not configured" }, { status: 503 });
    }

    const body = await req.json();
    const isValid = verifySafePayNotification(body, secretKey);
    if (!isValid) {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = body.event as string;
    const data = body.data as Record<string, any> | undefined;

    if (event === "order.completed" && data) {
      const orderRef = (data.order_ref || data.metadata?.orderRef) as string | undefined;
      const schoolId = (data.metadata?.schoolId) as string | undefined;
      const plan = (data.metadata?.plan) as string | undefined;

      if (orderRef && schoolId && plan) {
        await applySchoolPlan(schoolId, plan as any, "ACTIVE");
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[safepay/notification]", error);
    return Response.json({ error: "Notification handler failed" }, { status: 500 });
  }
}
