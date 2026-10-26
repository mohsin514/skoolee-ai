import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { createConnectAccount, createConnectOnboardingLink, appUrl } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

const CONFIG_KEY = "payment_settings";
const bankSchema = z.object({
  bankName: z.string().trim().min(1).max(200),
  accountTitle: z.string().trim().min(1).max(200),
  accountNumber: z.string().trim().min(1).max(100),
  iban: z.string().trim().max(100).nullish(),
});

function readValue(config: { value: Prisma.JsonValue } | null): Record<string, unknown> {
  return (config?.value ?? {}) as Record<string, unknown>;
}

export async function GET() {
  try {
    const user = await requirePlatformOwner();

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
    const user = await requirePlatformOwner();

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
      // M111: Stripe returns to the Payment gateways view the operator started from (registry view
      // `payments`), not the old `?tab=pricing`, which the console never read.
      const connectUrl = (state: "success" | "refresh") => `${baseUrl}/owner?${new URLSearchParams({ view: "payments", connect: state }).toString()}`;
      const refreshUrl = connectUrl("refresh");
      const returnUrl = connectUrl("success");
      const onboardingUrl = await createConnectOnboardingLink(accountId, refreshUrl, returnUrl);

      return Response.json({ success: true, url: onboardingUrl });
    }

    if (action === "save-bank") {
      const parsed = bankSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiError("Bank name, account title, and account number are required", 400);
      }
      const { bankName, accountTitle, accountNumber, iban } = parsed.data;
      await prisma.$transaction(async (tx) => {
        const config = await tx.platformConfig.findUnique({ where: { key: CONFIG_KEY } });
        const updated = { ...readValue(config), bankName, accountTitle, accountNumber, iban: iban || null } as Prisma.InputJsonObject;
        await tx.platformConfig.upsert({
          where: { key: CONFIG_KEY },
          create: { key: CONFIG_KEY, value: updated, updatedBy: user.userId },
          update: { value: updated, updatedBy: user.userId },
        });
        await tx.superAdminAuditLog.create({ data: {
          userId: user.userId, action: "payment_bank_details_updated", targetType: "platform_config", targetId: CONFIG_KEY,
          // Identify the change without duplicating bank credentials into the log.
          newValues: { bankName, accountTitle, accountNumberLast4: accountNumber.slice(-4), ibanProvided: Boolean(iban) },
        } });
      });

      return Response.json({ success: true, message: "Bank details saved." });
    }

    throw new ApiError("Unknown action", 400);
  } catch (error) {
    return errorResponse(error, "[owner/payment-settings] POST failed");
  }
}
