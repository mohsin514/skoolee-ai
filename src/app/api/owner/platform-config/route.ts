import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";

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

    const body = await request.json();
    const { pricing } = body as { pricing: Record<string, { price?: number | null }> };

    if (!pricing || typeof pricing !== "object") {
      throw new ApiError("pricing object is required", 400);
    }

    const validKeys = ["FREE", "BASIC", "PRO", "ENTERPRISE"];
    for (const key of validKeys) {
      const entry = pricing[key];
      if (entry && entry.price !== undefined && entry.price !== null && (typeof entry.price !== "number" || entry.price < 0)) {
        throw new ApiError(`Invalid price for ${key}`, 400);
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[platform-config] upserting with:", JSON.stringify(pricing));
    }
    const config = await prisma.platformConfig.upsert({
      where: { key: CONFIG_KEY },
      create: { key: CONFIG_KEY, value: pricing, updatedBy: user.userId },
      update: { value: pricing, updatedBy: user.userId },
    });

    return Response.json({ success: true, message: "Default plan prices updated.", data: config.value });
  } catch (error) {
    console.error("[owner/platform-config] PUT error:", error instanceof Error ? error.message : error, error instanceof Error ? error.stack : "");
    return errorResponse(error, (error instanceof Error ? error.message : String(error)));
  }
}
