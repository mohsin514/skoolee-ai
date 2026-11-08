import { defaultPricingSchema } from "@/lib/owner/pricing";
import { saveDefaultPlanPrices } from "@/lib/owner/default-pricing-service";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { clientIp } from "@/lib/http/client-ip";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const dynamic = "force-dynamic";

const CONFIG_KEY = "default_plan_pricing";

export async function GET() {
  try {
    const user = await requirePlatformOwner();

    const config = await prisma.platformConfig.findUnique({ where: { key: CONFIG_KEY } });
    const defaults = (config?.value as Record<string, { price?: number | null }> | null) ?? {
      FREE: { price: 0 },
      BASIC: { price: 4000 },
      PRO: { price: 7000 },
      ENTERPRISE: { price: null },
    };

    return Response.json({ success: true, data: defaults });
  } catch (error) {
    return errorResponse(error, "[owner/platform-config] GET failed");
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requirePlatformOwner();

    const body = await parseBody(request, jsonObjectBody);
    const parsed = defaultPricingSchema.safeParse(body?.pricing);
    if (!parsed.success) throw new ApiError("Provide valid plan prices: each price must be a finite non-negative number", 400);
    const pricing = parsed.data;
    const expected = body.expected === undefined ? undefined : defaultPricingSchema.safeParse(body.expected);
    if (expected && !expected.success) throw new ApiError("Reload the saved prices before trying again", 400);

    const pricingSaved = await saveDefaultPlanPrices(user, pricing, { expected: expected?.data, ipAddress: clientIp(request.headers), userAgent: request.headers.get("user-agent") || undefined });

    return Response.json({ success: true, message: "Default plan prices updated.", data: pricingSaved });
  } catch (error) {
    console.error("[owner/platform-config] PUT error:", error instanceof Error ? error.message : error, error instanceof Error ? error.stack : "");
    return errorResponse(error, "[owner/platform-config] PUT failed");
  }
}
