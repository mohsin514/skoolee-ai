import { prisma } from "@/lib/db/prisma";

export type PaymentMethod = "stripe" | "safepay" | "bank_transfer";

export interface PaymentConfig {
  method: PaymentMethod;
  availableMethods: PaymentMethod[];
  stripe?: {
    connectedAccountId: string;
    onboardingComplete: boolean;
  };
  safepay?: {
    enabled: boolean;
    merchantId: string;
  };
  bank?: {
    bankName: string;
    accountTitle: string;
    accountNumber: string;
    iban: string | null;
  } | null;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const settingsConfig = await prisma.platformConfig.findUnique({
    where: { key: "payment_settings" },
  });
  const settings = (settingsConfig?.value ?? {}) as Record<string, unknown>;

  const availableMethods: PaymentMethod[] = [];
  const hasStripe = !!(process.env.STRIPE_SECRET_KEY && settings.connectedAccountId);

  availableMethods.push("safepay");
  if (hasStripe && (settings.onboardingComplete as boolean)) {
    availableMethods.push("stripe");
  }
  if (settings.bankName) {
    availableMethods.push("bank_transfer");
  }

  return {
    method: availableMethods[0] || "bank_transfer",
    availableMethods,
    ...(hasStripe
      ? {
          stripe: {
            connectedAccountId: settings.connectedAccountId as string,
            onboardingComplete: settings.onboardingComplete as boolean,
          },
        }
      : {}),
    safepay: {
      enabled: true,
      merchantId: process.env.SAFEPAY_MERCHANT_ID || "dev_mode",
    },
    ...(settings.bankName
      ? {
          bank: {
            bankName: settings.bankName as string,
            accountTitle: settings.accountTitle as string,
            accountNumber: settings.accountNumber as string,
            iban: (settings.iban as string) || null,
          },
        }
      : { bank: null }),
  };
}
