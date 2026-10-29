import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { isInstitutionAuthority } from "@/lib/auth/institution";
import { protectSecret, revealSecret } from "@/lib/auth/mfa-crypto";
import { graphAdapter, graphMode, type GraphAdapter } from "./graph";

// SKAI-1045 (D3-01, decision docs/product-review-2026-10/d3-whatsapp-payer.md): each school connects its own
// WhatsApp Business Account through Meta Embedded Signup, so Meta bills the school and the school's name, quality
// rating and template approvals stay its own. Only the institution authority connects or disconnects. The access
// token is encrypted at rest with protectSecret (AES-256-GCM, MFA_ENCRYPTION_KEY keyring) and never leaves the server.

type Db = Pick<typeof prisma, "whatsAppConnection" | "auditLog">;
const META_ID = /^\d{5,30}$/;

export function requireWhatsAppAdmin(user: AuthUser) {
  if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator manages WhatsApp.", 403);
}

/** Public, non-secret settings the browser needs to start Embedded Signup. */
export function signupConfig(env: NodeJS.ProcessEnv = process.env) {
  return { mode: graphMode(env), appId: env.NEXT_PUBLIC_META_APP_ID || env.META_APP_ID || null, configId: env.META_WHATSAPP_CONFIG_ID || null };
}

export async function connectionStatus(user: AuthUser, db: Db = prisma) {
  requireWhatsAppAdmin(user);
  const row = await db.whatsAppConnection.findFirst({ where: { schoolId: user.schoolId } });
  const connection = row && {
    status: row.status, wabaId: row.wabaId, phoneNumberId: row.phoneNumberId, businessId: row.businessId,
    displayPhoneNumber: row.displayPhoneNumber, verifiedName: row.verifiedName, connectedAt: row.connectedAt,
    disconnectedAt: row.disconnectedAt, tokenExpiresAt: row.tokenExpiresAt,
  };
  return { ...signupConfig(), connection };
}

export async function connect(user: AuthUser, body: Record<string, unknown>, db: Db = prisma, graph: GraphAdapter = graphAdapter()) {
  requireWhatsAppAdmin(user);
  if (graph.mode === "disabled") throw new ApiError("WhatsApp Embedded Signup is not configured for this deployment.", 503);
  const code = String(body.code ?? "").trim(), wabaId = String(body.wabaId ?? "").trim(), phoneNumberId = String(body.phoneNumberId ?? "").trim();
  const businessId = String(body.businessId ?? "").trim() || null;
  if (!code || code.length > 2000) throw new ApiError("The Meta sign-up did not finish. Start again.", 400);
  if (!META_ID.test(wabaId) || !META_ID.test(phoneNumberId) || (businessId && !META_ID.test(businessId))) throw new ApiError("Meta returned an account we could not read. Start again.", 400);
  let token: { accessToken: string; expiresIn?: number }, phone: { displayPhoneNumber?: string; verifiedName?: string };
  try {
    token = await graph.exchangeCode(code);
    phone = await graph.phoneNumber(phoneNumberId, token.accessToken);
    await graph.subscribeApp(wabaId, token.accessToken);
  } catch (error) {
    console.error("[whatsapp] embedded signup failed", error instanceof Error ? error.message : error);
    throw new ApiError("Meta did not confirm the WhatsApp account. Try again.", 502);
  }
  const data = {
    status: "CONNECTED", wabaId, phoneNumberId, businessId,
    displayPhoneNumber: phone.displayPhoneNumber?.slice(0, 40) ?? null, verifiedName: phone.verifiedName?.slice(0, 200) ?? null,
    accessTokenEnc: protectSecret(token.accessToken),
    tokenExpiresAt: token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null,
    connectedById: user.userId, connectedAt: new Date(), disconnectedAt: null,
  };
  const row = await db.whatsAppConnection.upsert({ where: { schoolId: user.schoolId }, create: { schoolId: user.schoolId, ...data }, update: data });
  await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "whatsapp_connections", recordId: row.id, userId: user.userId, newValue: { action: "connect", wabaId, phoneNumberId, businessId } } });
  return connectionStatus(user, db);
}

export async function disconnect(user: AuthUser, db: Db = prisma) {
  requireWhatsAppAdmin(user);
  const row = await db.whatsAppConnection.findFirst({ where: { schoolId: user.schoolId } });
  if (!row || row.status !== "CONNECTED") throw new ApiError("WhatsApp is not connected.", 409);
  await db.whatsAppConnection.update({ where: { schoolId: user.schoolId }, data: { status: "DISCONNECTED", accessTokenEnc: null, disconnectedAt: new Date() } });
  await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "whatsapp_connections", recordId: row.id, userId: user.userId, newValue: { action: "disconnect", wabaId: row.wabaId } } });
  return connectionStatus(user, db);
}

/** The school's own sender, or null when it has not connected (or disconnected). Server-side only. */
export async function schoolSender(schoolId: string, db: Pick<typeof prisma, "whatsAppConnection"> = prisma) {
  const row = await db.whatsAppConnection.findFirst({ where: { schoolId, status: "CONNECTED" } });
  if (!row?.accessTokenEnc) return null;
  try { return { phoneNumberId: row.phoneNumberId, token: revealSecret(row.accessTokenEnc) }; }
  catch { console.error("[whatsapp] stored token cannot be decrypted for school", schoolId); return null; }
}
