import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createConnectAccount, createConnectOnboardingLink, appUrl } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

const CONFIG_KEY = "payment_settings";

function readValue(config: { value: Prisma.JsonValue } | null): Record<string, unknown> {
  return (config?.value ?? {}) as Record<string, unknown>;
}

export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (user.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

    const config = await prisma.platformConfig.findUnique({ where: { key: CONFIG_KEY } });
    const value = readValue(config);

    return Response.json({
      success: true,
      data: {
        connectedAccountId: value.connectedAccountId || null,
        onboardingComplete: value.onboardingComplete || false,
        chargesEnabled: value.chargesEnabled || false,
        detailsSubmitted: value.detailsSubmitted || false,
        bankName: value.bankName || null,
        accountTitle: value.accountTitle || null,
        accountNumber: value.accountNumber || null,
        iban: value.iban || null,
      },
    });
  } catch (error) {
    return errorResponse(error, "[owner/payment-settings] GET failed");
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (user.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

    const body = await req.json();
    const { action } = body;

    if (action === "start-connect-onboarding") {
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new ApiError("Stripe is not configured", 503);
      }

      const config = await prisma.platformConfig.findUnique({ where: { key: CONFIG_KEY } });
      const value = readValue(config);
      let accountId = value.connectedAccountId as string | undefined;

      if (!accountId) {
        accountId = await createConnectAccount(user.email);
        await prisma.platformConfig.upsert({
          where: { key: CONFIG_KEY },
          create: { key: CONFIG_KEY, value: { connectedAccountId: accountId } as any, updatedBy: user.userId },
          update: { value: { ...value, connectedAccountId: accountId } as any, updatedBy: user.userId },
        });
      }

      const baseUrl = appUrl();
      const refreshUrl = `${baseUrl}/owner?tab=pricing&connect_refresh=true`;
      const returnUrl = `${baseUrl}/owner?tab=pricing&connect_success=true`;
      const onboardingUrl = await createConnectOnboardingLink(accountId, refreshUrl, returnUrl);

      return Response.json({ success: true, url: onboardingUrl });
    }

    if (action === "save-bank") {
      const { bankName, accountTitle, accountNumber, iban } = body;
      if (!bankName || !accountTitle || !accountNumber) {
        throw new ApiError("Bank name, account title, and account number are required", 400);
      }

      const config = await prisma.platformConfig.findUnique({ where: { key: CONFIG_KEY } });
      const value = readValue(config);

      const updated: any = { ...value, bankName, accountTitle, accountNumber, iban: iban || null };

      await prisma.platformConfig.upsert({
        where: { key: CONFIG_KEY },
        create: { key: CONFIG_KEY, value: updated, updatedBy: user.userId },
        update: { value: updated, updatedBy: user.userId },
      });

      return Response.json({ success: true, message: "Bank details saved." });
    }

    throw new ApiError("Unknown action", 400);
  } catch (error) {
    return errorResponse(error, "[owner/payment-settings] POST failed");
  }
}
