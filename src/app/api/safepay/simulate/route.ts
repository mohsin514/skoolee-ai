import { NextRequest, NextResponse } from "next/server";
import { applySchoolPlan } from "@/lib/billing/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { orderRef, schoolId, plan } = await req.json();
    if (!orderRef || !schoolId || !plan) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    await applySchoolPlan(schoolId, plan as any, "ACTIVE");
    return Response.json({ success: true });
  } catch (error) {
    console.error("[safepay/simulate] POST failed", error);
    return Response.json({ error: "Payment simulation failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderRef = searchParams.get("orderRef");
  const schoolId = searchParams.get("schoolId");
  const plan = searchParams.get("plan");
  const amountLabel = searchParams.get("amountLabel");

  const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const payUrl = new URL("/safepay", req.url);
  if (orderRef) payUrl.searchParams.set("orderRef", orderRef);
  if (schoolId) payUrl.searchParams.set("schoolId", schoolId);
  if (plan) payUrl.searchParams.set("plan", plan);
  if (amountLabel) payUrl.searchParams.set("amountLabel", amountLabel);

  return NextResponse.redirect(payUrl);
}
