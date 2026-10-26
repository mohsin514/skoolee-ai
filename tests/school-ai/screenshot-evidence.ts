import type { Locator, Page } from "@playwright/test";

/** Capture the settled product, including on hard navigation where the brand overlay ignores clicks. */
export async function captureEvidence(target: Page | Locator, options: Parameters<Page["screenshot"]>[0]) {
  const page = "page" in target ? target.page() : target;
  await page.locator("[data-boot-splash]").waitFor({ state: "hidden", timeout: 20_000 });
  await page.getByRole("status", { name: /SkooleeAI/ }).waitFor({ state: "hidden", timeout: 20_000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  return target.screenshot({ ...options, animations: "disabled" });
}
