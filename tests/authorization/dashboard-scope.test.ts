import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

// Bundle the actual providers; only the server-action boundary is synthetic.
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve("tsx"))("esbuild");
const bundle: string = buildSync({ entryPoints: [resolve("tests/authorization/dashboard-scope.fixture.tsx")], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", alias: { "@/app/actions/dashboard": resolve("tests/authorization/dashboard-scope-actions.fixture.ts") } }).outputFiles[0].text;
const server = createServer((request, response) => {
  response.setHeader("content-type", request.url === "/fixture.js" ? "application/javascript" : "text/html");
  response.end(request.url === "/fixture.js" ? bundle : '<!doctype html><html><head><title>Synthetic scope regression</title></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
let browser: Browser;
let origin: string;
before(async () => {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Fixture address unavailable");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, timeout: 15000 });
}, { timeout: 20000 });
after(async () => { await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve())); });
type Fixture = { switchScope: (scope: string) => void; setVisible: (visible: boolean) => void; requests: () => { id: number; role: string }[]; resolve: (id: number, value: string) => void; reject: (id: number) => void };
declare global { interface Window { dashboardFixture: Fixture } }
const waitForRequests = (page: Page, count: number) => page.waitForFunction(expected => window.dashboardFixture?.requests().length === expected, count, { timeout: 10000 });
async function settle(page: Page, id: number, value: string) {
  await page.evaluate(({ id, value }) => window.dashboardFixture.resolve(id, value), { id, value });
  await page.waitForFunction(expected => document.querySelector('[data-testid="data"]')?.textContent?.includes(expected), value);
}
async function assertClosed(page: Page) {
  assert.equal(await page.getByTestId("data").textContent(), "null");
  assert.equal(await page.getByTestId("loading").textContent(), "true");
}

for (const role of ["principal", "super", "student"]) {
  test(`${role}: actor, campus and fresh remount never reuse the previous private payload`, async () => {
    const context = await browser.newContext(); const page = await context.newPage();
    try {
      await page.goto(`${origin}/?role=${role}`); await waitForRequests(page, 1); await assertClosed(page);
      await settle(page, 1, "ACTOR A PRIVATE RECORD");
      await page.evaluate(() => window.dashboardFixture.switchScope("actor-b:school-a:campus-a"));
      await waitForRequests(page, 2); await assertClosed(page);
      await settle(page, 2, "ACTOR B PRIVATE RECORD");
      await page.evaluate(() => window.dashboardFixture.switchScope("actor-b:school-a:campus-b"));
      await waitForRequests(page, 3); await assertClosed(page);
      await settle(page, 3, "CAMPUS B PRIVATE RECORD");
      await page.evaluate(() => window.dashboardFixture.setVisible(false));
      await page.evaluate(() => window.dashboardFixture.setVisible(true));
      await waitForRequests(page, 4); await assertClosed(page);
      await settle(page, 4, "CURRENT REAUTHORIZED RECORD");
      assert.deepEqual(await page.evaluate(() => window.dashboardFixture.requests().map(item => item.role)), [role, role, role, role]);
    } finally { await context.close(); }
  });
  test(`${role}: old async results are ignored; a same-scope refresh keeps data until a denial clears it`, async () => {
    const context = await browser.newContext(); const page = await context.newPage();
    try {
      await page.goto(`${origin}/?role=${role}`); await waitForRequests(page, 1);
      await page.evaluate(() => window.dashboardFixture.switchScope("actor-b:school-b:campus-b"));
      await waitForRequests(page, 2); await assertClosed(page);
      await settle(page, 2, "NEW SCOPE RECORD");
      await page.evaluate(() => window.dashboardFixture.resolve(1, "OLD SCOPE SECRET"));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.getByTestId("data").textContent(), '{"privateLabel":"NEW SCOPE RECORD"}');
      // Stale-while-revalidate inside one scoped mount: the records already shown stay until the recheck answers.
      await page.getByRole("button", { name: "Refresh" }).click(); await waitForRequests(page, 3);
      assert.equal(await page.getByTestId("data").textContent(), '{"privateLabel":"NEW SCOPE RECORD"}');
      assert.equal(await page.getByTestId("loading").textContent(), "true");
      await page.evaluate(() => window.dashboardFixture.reject(3));
      await page.waitForFunction(() => document.querySelector('[data-testid="error"]')?.textContent === "This account cannot access that record.");
      assert.equal(await page.getByTestId("data").textContent(), "null");
      assert.equal(await page.getByTestId("loading").textContent(), "false");
      await page.getByRole("button", { name: "Refresh" }).click(); await waitForRequests(page, 4); await assertClosed(page);
      await settle(page, 4, "RESTORED CURRENT SCOPE");
      assert.equal(await page.getByTestId("error").textContent(), "");
    } finally { await context.close(); }
  });
}
