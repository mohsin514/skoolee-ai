/** Run only with the isolated owner QA app configured AI_PROVIDER=ollama, OLLAMA_BASE_URL=http://127.0.0.1:11499, OPENAI_API_KEY=''. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { chromium } from "playwright";

async function main() {
  const expectedDb = "postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024";
  assert.equal(process.env.DATABASE_URL, expectedDb);
  assert.equal(process.env.AUTH_SECRET, "synthetic-owner-audit-only-20261024");
  assert.equal(process.env.OWNER_QA_MOCK_AI, "1");
  let calls = 0;
  const provider = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const payload = JSON.parse(body.messages.find((m: { role: string }) => m.role === "user").content);
    const text = payload.userText.map((s: { text: string }) => s.text).join(" ");
    const email = text.match(/\[(?:EMAIL|ID)_\d+\]/g)?.at(-1);
    const input = payload.userText.length === 1 ? {} : { schoolName: "BCH", city: "Lahore", ownerName: "Sara", ownerEmail: email, ...(payload.userText.length >= 3 ? { kind: "STANDALONE" } : {}) };
    calls++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: { content: JSON.stringify({ kind: "plan", steps: [{ key: "s1", capability: "platform.provision_school", input, evidence: [] }] }) }, prompt_eval_count: 10, eval_count: 10 }));
  });
  await new Promise<void>(resolve => provider.listen(11499, "127.0.0.1", resolve));
  const db = new PrismaClient();
  const browser = await chromium.launch({ headless: true });
  try {
    const id = randomUUID(), base = "http://127.0.0.1:3094";
    const school = await db.school.create({ data: { name: "Synthetic Ask QA", city: "Test", slug: id, regId: id, contactEmail: `${id}@example.invalid`, status: "ACTIVE", plan: "PRO" } });
    const user = await db.user.create({ data: { schoolId: school.id, role: "APP_OWNER", email: `${randomUUID()}@example.invalid`, fullName: "Synthetic Ask Tester", onboardingComplete: true, welcomeCompletedAt: new Date(), mfaEnabled: true, tourProgress: { owner: { v: 1, s: "done", at: new Date().toISOString() } } } });
    const token = await new SignJWT({ userId: user.id, role: user.role, schoolId: school.id, accessVersion: 0, email: user.email, fullName: user.fullName, onboardingComplete: true, schoolStatus: "ACTIVE", mfaVerified: true }).setProtectedHeader({ alg: "HS256" }).setJti(randomUUID()).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await db.loginSession.create({ data: { schoolId: school.id, userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 1000 } });
    await context.addCookies([{ name: "skoolee_token", value: token, url: base }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("console", msg => { if (msg.type() === "error") console.log("browser error", msg.text()); });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(base + "/ai", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator("div.pointer-events-none.fixed.inset-0[aria-hidden=true]").waitFor({ state: "hidden", timeout: 15000 });
    await page.waitForTimeout(500);
    await page.locator("[data-ai-request]").fill("create new schools");
    await page.locator("[data-ai-start]").click();
    await page.locator('[data-ai-status="NEEDS_INPUT"]').waitFor({ timeout: 60000 }).catch(async error => { console.log((await page.locator("body").innerText()).slice(-3000)); throw error; });
    assert.equal(calls, 0, "known school creation must not depend on a provider call");
    const answer = `School name BCH. City Lahore. Owner name Sara. Owner email ${randomUUID()}@example.invalid.`;
    await page.locator("[data-ai-answer]").fill(answer);
    // A failed network request must preserve the typed answer for retry.
    await page.route("**/api/ai-workflows/*/commands", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "PROVIDER_UNAVAILABLE" }) }), { times: 1 });
    await page.locator("[data-ai-answer-submit]").click();
    await page.locator('[data-ai-error="PROVIDER_UNAVAILABLE"]').waitFor();
    assert.equal(await page.locator("[data-ai-answer]").inputValue(), answer);
    await page.locator("[data-ai-answer-submit]").click();
    await page.locator('[data-ai-option="STANDALONE"]').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-ai-question="FIELD"]').length === 1);
    await page.locator('[data-ai-option="STANDALONE"]').click();
    await page.locator('[data-ai-status="WAITING_HANDOFF"]').waitFor({ timeout: 60000 });
    assert.equal(calls, 0);
    await page.screenshot({ path: "test-results/owner-audit/ask-complete-handoff-390.png" });
    await page.locator('a[href*="workflowHandoffId="]').first().click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor({ timeout: 30000 });
    assert.ok(await dialog.locator("input").evaluateAll(nodes => nodes.some(node => (node as HTMLInputElement).value === "BCH")));
    assert.deepEqual(errors, []);
    console.log("PASS Ask AI browser: submit, missing fields, failed-answer retry, retained details, school-type choice, populated handoff; zero provider calls");
  } finally {
    await browser.close(); await db.$disconnect();
    await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
