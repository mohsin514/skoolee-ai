import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import assert from "node:assert/strict";
async function main() {
 if (!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201")) throw new Error("Local database required");
 const db = new PrismaClient(); const prefix = "locale-bank-identity";
 const token = await new SignJWT({ userId: "locale-ACCOUNTANT", schoolId: "locale-fixture", campusId: "locale-campus-a", role: "ACCOUNTANT", accessVersion: 0, schoolStatus: "ACTIVE", onboardingComplete: true }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
 const request = async (path: string, method: string, body: object) => { const response = await fetch(`http://localhost:3201/api/accounts/${path}`, { method, headers: { Cookie: `skoolee_token=${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: response.status, json: await response.json() }; };
 try {
  const account = await db.chartOfAccount.create({ data: { schoolId: "locale-fixture", campusId: "locale-campus-a", name: prefix, type: "INCOME" } });
  const created = await request("bank-accounts", "POST", { name: prefix, currency: "KWD", openingBalance: 1234567 });
  assert.equal(created.status, 201, JSON.stringify(created)); assert.equal(created.json.data.currency, "KWD"); assert.equal(created.json.data.openingBalance, 1234567);
  const bankId = created.json.data.id;
  assert.equal((await request("bank-accounts", "PATCH", { id: bankId, currency: "PKR" })).status, 400);
  assert.equal((await request("bank-accounts", "PATCH", { id: bankId, openingBalance: 1.5 })).status, 400);
  const entry = { kind: "INCOME", sourceName: prefix, accountId: account.id, date: "2026-10-08", amount: 234567, bankAccountId: bankId };
  assert.equal((await request("ledger", "POST", { ...entry, currency: "PKR" })).status, 400);
  const saved = await request("ledger", "POST", { ...entry, currency: "KWD" }); assert.equal(saved.status, 201, JSON.stringify(saved));
  const row = await db.ledgerEntry.findFirstOrThrow({ where: { sourceName: prefix } }); assert.equal(row.amount, 234567); assert.equal(row.currency, "KWD"); assert.equal(row.bankAccountId, bankId);
  console.log("Accountant bank balance and ledger retain KWD precision; relabeling, fractional minor units and cross-currency posting rejected");
 } finally {
  await db.ledgerEntry.deleteMany({ where: { schoolId: "locale-fixture", sourceName: prefix } });
  await db.bankAccount.deleteMany({ where: { schoolId: "locale-fixture", name: prefix } });
  await db.chartOfAccount.deleteMany({ where: { schoolId: "locale-fixture", name: prefix } });
  await db.$disconnect();
 }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
