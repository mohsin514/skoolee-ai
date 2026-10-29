import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { requireWhatsAppAdmin } from "./connection";

// SKAI-1046 (D3-03): the optional Skoolee-managed sending add-on (decision d3-whatsapp-payer.md, option B fallback).
// - One managed number per tenant, provisioned by the platform owner, so one school's quality rating never
//   spreads to another. Skoolee's own WABA token (WHATSAPP_MANAGED_ACCESS_TOKEN) sends for it.
// - Prepaid credit in micro-USD. Each message is reserved atomically before the Meta call (balance >= cost),
//   refunded if Meta refuses it and written to the ledger with Meta's rate and Skoolee's margin. With too little
//   credit the message is blocked; it never falls back to another sender.
// - Credit is added only by the platform owner after the school has paid (human-only: never the AI engine).

export const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION", "SERVICE"] as const;
export type Category = typeof CATEGORIES[number];
type Rates = Record<string, Partial<Record<Category, number>>>;

/**
 * Meta per-message rates in micro-USD. UNVERIFIED defaults from third-party reporting of the 1 April 2026 change
 * (YCloud, viewed 29 Oct 2026, see d3-whatsapp-payer.md). Production must set WHATSAPP_MANAGED_RATES_JSON from
 * Meta's own rate card. A country/category with no rate is blocked rather than guessed. SERVICE replies are free.
 */
const DEFAULT_RATES: Rates = { PK: { UTILITY: 10_000, AUTHENTICATION: 10_000 }, SA: { MARKETING: 50_100 } };
const COUNTRY_PREFIXES: [string, string][] = [["966", "SA"], ["971", "AE"], ["92", "PK"]];

export function countryOf(msisdn: string) {
  const digits = msisdn.replace(/\D/g, "");
  return COUNTRY_PREFIXES.find(([prefix]) => digits.startsWith(prefix))?.[1] ?? "OTHER";
}

export function priceFor(to: string, category: Category, env: Record<string, string | undefined> = process.env) {
  const country = countryOf(to);
  let rates = DEFAULT_RATES;
  if (env.WHATSAPP_MANAGED_RATES_JSON) { try { rates = JSON.parse(env.WHATSAPP_MANAGED_RATES_JSON) as Rates; } catch { return null; } }
  const metaRate = category === "SERVICE" ? 0 : rates[country]?.[category];
  if (metaRate === undefined || !Number.isInteger(metaRate) || metaRate < 0) return null;
  const margin = Math.max(0, Math.trunc(Number(env.WHATSAPP_MANAGED_MARGIN_MICRO_USD ?? 0)) || 0);
  return { country, metaRate, margin, cost: metaRate + margin };
}

type Db = Pick<typeof prisma, "whatsAppManagedSending" | "whatsAppUsageEntry" | "auditLog">;
const n = (v: bigint | number) => Number(v);

/** The managed sender for a school, or null when the add-on is off, unprovisioned or Skoolee's token is unset. */
export async function managedSender(schoolId: string, db: Pick<Db, "whatsAppManagedSending"> = prisma) {
  const token = process.env.WHATSAPP_MANAGED_ACCESS_TOKEN;
  const row = await db.whatsAppManagedSending.findFirst({ where: { schoolId, enabled: true } });
  return row?.phoneNumberId && token ? { phoneNumberId: row.phoneNumberId, token } : null;
}

/** Reserves credit for one message. Returns the charge, or a reason the message is blocked. */
export async function reserve(schoolId: string, to: string, category: Category, db: Db = prisma) {
  const price = priceFor(to, category);
  if (!price) return { blocked: "No managed WhatsApp rate is set for this destination." } as const;
  const { count } = await db.whatsAppManagedSending.updateMany({
    where: { schoolId, enabled: true, balanceMicroUsd: { gte: BigInt(price.cost) } },
    data: { balanceMicroUsd: { decrement: BigInt(price.cost) } },
  });
  return count ? { price } as const : { blocked: "Managed WhatsApp credit is used up. Ask the school owner to add credit." } as const;
}

export async function settle(schoolId: string, category: Category, price: NonNullable<ReturnType<typeof priceFor>>, result: { success: boolean; messageId?: string }, db: Db = prisma) {
  if (!result.success) {
    await db.whatsAppManagedSending.updateMany({ where: { schoolId }, data: { balanceMicroUsd: { increment: BigInt(price.cost) } } });
    return;
  }
  await db.whatsAppUsageEntry.create({ data: { schoolId, kind: "MESSAGE", category, country: price.country, metaRateMicroUsd: BigInt(price.metaRate), marginMicroUsd: BigInt(price.margin), amountMicroUsd: BigInt(price.cost), providerMessageId: result.messageId ?? null } });
}

export async function usage(user: AuthUser, db: Db = prisma) {
  requireWhatsAppAdmin(user);
  const [row, entries] = await Promise.all([
    db.whatsAppManagedSending.findFirst({ where: { schoolId: user.schoolId } }),
    db.whatsAppUsageEntry.findMany({ where: { schoolId: user.schoolId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const since = new Date(Date.now() - 30 * 86_400_000), recent = entries.filter(e => e.kind === "MESSAGE" && e.createdAt >= since);
  return {
    enabled: row?.enabled ?? false, provisioned: Boolean(row?.phoneNumberId), balanceMicroUsd: n(row?.balanceMicroUsd ?? 0),
    last30Days: { messages: recent.length, spentMicroUsd: recent.reduce((sum, e) => sum + n(e.amountMicroUsd), 0) },
    entries: entries.map(e => ({ id: e.id, kind: e.kind, category: e.category, country: e.country, metaRateMicroUsd: n(e.metaRateMicroUsd), marginMicroUsd: n(e.marginMicroUsd), amountMicroUsd: n(e.amountMicroUsd), reference: e.reference, createdAt: e.createdAt })),
  };
}

/** The school opts in or out. Opting in needs a number the platform owner has provisioned. */
export async function setEnabled(user: AuthUser, enabled: boolean, db: Db = prisma) {
  requireWhatsAppAdmin(user);
  const row = await db.whatsAppManagedSending.findFirst({ where: { schoolId: user.schoolId } });
  if (enabled && !row?.phoneNumberId) throw new ApiError("Skoolee has not set up a managed number for your school yet.", 409);
  if (!row) return usage(user, db);
  await db.whatsAppManagedSending.update({ where: { schoolId: user.schoolId }, data: { enabled, updatedById: user.userId } });
  await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "whatsapp_managed_sending", recordId: row.id, userId: user.userId, newValue: { action: enabled ? "enable" : "disable" } } });
  return usage(user, db);
}

/** Platform owner, inside the school's tenant context: provision the number or credit a paid top-up. */
export async function ownerAction(owner: AuthUser, schoolId: string, body: Record<string, unknown>, db: Db = prisma) {
  if (owner.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);
  const existing = await db.whatsAppManagedSending.findFirst({ where: { schoolId } });
  if (body.action === "provision") {
    const phoneNumberId = String(body.phoneNumberId ?? "").trim();
    if (!/^\d{5,30}$/.test(phoneNumberId)) throw new ApiError("Enter the managed number's Meta phone number ID.", 400);
    const row = await db.whatsAppManagedSending.upsert({ where: { schoolId }, create: { schoolId, phoneNumberId, updatedById: owner.userId }, update: { phoneNumberId, updatedById: owner.userId } });
    await db.auditLog.create({ data: { schoolId, tableName: "whatsapp_managed_sending", recordId: row.id, userId: owner.userId, newValue: { action: "provision", phoneNumberId } } });
    return { id: row.id };
  }
  if (body.action === "top-up") {
    const amount = Number(body.amountMicroUsd), reference = String(body.reference ?? "").trim().slice(0, 200);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000 * 1_000_000) throw new ApiError("Enter a credit between 1 micro-USD and USD 10,000.", 400);
    if (reference.length < 3) throw new ApiError("Record the payment reference for this credit.", 400);
    if (!existing) throw new ApiError("Provision a managed number first.", 409);
    await db.whatsAppManagedSending.update({ where: { schoolId }, data: { balanceMicroUsd: { increment: BigInt(amount) }, updatedById: owner.userId } });
    const entry = await db.whatsAppUsageEntry.create({ data: { schoolId, kind: "TOP_UP", amountMicroUsd: BigInt(amount), reference, createdById: owner.userId } });
    await db.auditLog.create({ data: { schoolId, tableName: "whatsapp_usage_entries", recordId: entry.id, userId: owner.userId, newValue: { action: "top-up", amountMicroUsd: amount, reference } } });
    return { id: entry.id };
  }
  throw new ApiError("Unknown action", 400);
}
