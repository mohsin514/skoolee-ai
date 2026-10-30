import { prisma } from "@/lib/db/prisma";
import { paymentConfiguration, type PaymentConfig } from "./configuration";
export type { PaymentConfig, PaymentMethod, PaymentReadiness } from "./configuration";

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const settingsConfig = await prisma.platformConfig.findUnique({
    where: { key: "payment_settings" },
  });
  const settings = (settingsConfig?.value ?? {}) as Record<string, unknown>;

  return paymentConfiguration(settings);
}
