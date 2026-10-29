import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { curriculumPacksCopy } from "../../../src/components/curriculum/curriculum-packs-copy";

// SKAI-1008..1012 screens: the school's blocked/approve/active states and the owner catalogue, EN/AR/UR, desktop and phone.
const requireTool = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = requireTool("esbuild"), { compile } = requireTool("@tailwindcss/node"), { Scanner } = requireTool("@tailwindcss/oxide");
const shots = process.env.SCREENSHOT_DIR;
let js: string, css: string;
test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({ entryPoints: [path.join(root, "tests/design-system/curriculum-packs/fixture.tsx")], outfile: "fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"', "process.env": '{}' }, alias: { "@/app/actions/locale": path.join(root, "tests/design-system/component-adoption/locale-mock.ts") } });
  js = result.outputFiles.find((file: { path: string }) => file.path.endsWith(".js")).text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  css = compiler.build(new Scanner({ sources: [{ base: root, pattern: "src/components/**/*.{ts,tsx}", negated: false }] }).scan());
});

const source = { id: "s1", reference: "Synthetic syllabus SYN/1", authority: "Synthetic Board", url: "https://example.test/syllabus.pdf" };
const activation = (status: string, over: Record<string, unknown> = {}) => ({
  id: `a-${status}`, campusId: "c1", packId: "fbise-ssc1-mathematics-2027", version: 1, status, geography: "PAKISTAN_ISLAMABAD_RAWALPINDI", schoolGrade: "9",
  sourceEvidence: [], sources: [source], educatorApprover: null, approvedOn: null, reviewDueOn: null, revokedReason: null, contentSha256: "ab".repeat(32),
  blockers: [], events: [{ from: null, to: "DRAFT", actorRole: "CAMPUS_ADMIN", reason: null, at: "2026-10-29T09:00:00.000Z" }],
  can: { edit: false, approve: false, activate: false, revoke: false }, ...over,
});
const overview = {
  catalogue: [{ id: "v1", packId: "fbise-ssc1-mathematics-2027", version: 1, board: "FBISE", subject: "Mathematics", schoolGrade: "9", examYear: "2027", language: "en", unverifiedCount: 4 },
    { id: "v2", packId: "cambridge-0580-2027-extended-p2", version: 1, board: "CAMBRIDGE", subject: "Mathematics", schoolGrade: "Year 11", examYear: "2027", language: "en", unverifiedCount: 3 }],
  activations: [
    activation("DRAFT", { blockers: ["Unverified paper.sections: Obtain the grade-specific table of specification.", "Source s1 has no verified rights scope and permission evidence."], can: { edit: true, approve: false, activate: false, revoke: true } }),
    activation("APPROVED", { id: "a-approved", educatorApprover: "Principal (synthetic)", approvedOn: "2026-10-28", reviewDueOn: "2027-10-28", sourceEvidence: [{ sourceId: "s1", rightsScope: "Reference only", permissionEvidence: "Board letter SYN-12", hasDocument: true }], can: { edit: false, approve: false, activate: true, revoke: true } }),
    activation("ACTIVE", { id: "a-active", packId: "synthetic-g9-maths", educatorApprover: "Principal (synthetic)", approvedOn: "2026-10-28", reviewDueOn: "2027-10-28", sourceEvidence: [{ sourceId: "s1", rightsScope: "Reference only", permissionEvidence: "Board letter SYN-12", hasDocument: false }], can: { edit: false, approve: false, activate: false, revoke: true } }),
  ],
  campuses: [{ id: "c1", name: "Campus A" }], geographies: ["PAKISTAN_LAHORE", "PAKISTAN_ISLAMABAD_RAWALPINDI", "UAE_DUBAI"], canRequest: true, uploadsAvailable: true,
};
const catalogue = [{ id: "v1", packId: "fbise-ssc1-mathematics-2027", version: 1, board: "FBISE", subject: "Mathematics", schoolGrade: "9", examYear: "2027", language: "en", status: "DRAFT", contentSha256: "ab".repeat(32), unverified: [{ field: "paper.sections", evidenceRequest: "Obtain the grade-specific table of specification." }, { field: "register.educatorApprover", evidenceRequest: "A qualified educator must review." }], activations: { DRAFT: 1 } }];

async function mount(page: Page, language: "en" | "ar" | "ur", view: "school" | "owner" = "school") {
  const posts: unknown[] = [];
  page.on("pageerror", error => console.log("PAGEERROR", error.message));
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><body><main id="root"></main></body></html>` }));
  await page.route("**/api/school-ai/curriculum-packs", route => route.request().method() === "GET" ? route.fulfill({ json: overview }) : (posts.push(route.request().postDataJSON()), route.fulfill({ status: 201, json: { id: "new" } })));
  await page.route("**/api/school-ai/curriculum-packs/*/transition", route => { posts.push(route.request().postDataJSON()); return route.fulfill({ status: 422, json: { error: "Unverified paper.sections", code: "CURRICULUM_PACK_BLOCKED", details: ["Unverified paper.sections", "Calculator rule is unverified."] } }); });
  await page.route("**/api/owner/curriculum-packs", route => route.fulfill({ json: { success: true, data: catalogue } }));
  await page.goto(`http://curriculum-packs.test/?language=${language}&view=${view}`); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  return posts;
}

for (const language of ["en", "ar", "ur"] as const) {
  const t = curriculumPacksCopy(language);
  test(`${language}: blocked reasons, approved and active states, request form, refused activation shows why`, async ({ page }) => {
    const posts = await mount(page, language);
    await expect(page.locator("[data-pack-blockers]")).toContainText("Unverified paper.sections");
    await expect(page.locator("[data-pack-activation=ACTIVE]")).toContainText(t.statusACTIVE);
    await expect(page.locator("[data-pack-catalogue]")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.dir)).toBe(language === "en" ? "ltr" : "rtl");
    if (shots) await page.screenshot({ path: `${shots}/curriculum-packs-${language}-desktop.png`, fullPage: true });
    await page.locator("[data-pack-activate]").click();
    await expect(page.getByRole("alert").first()).toContainText("Calculator rule is unverified.");
    expect(posts).toContainEqual({ to: "ACTIVE" });
    await page.locator("[data-pack-request-open]").click();
    await page.locator("[data-pack-request-submit]").click();
    expect(posts).toContainEqual({ packVersionId: "v1", campusId: "c1", geography: "PAKISTAN_LAHORE", schoolGrade: "9" });
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (shots) await page.screenshot({ path: `${shots}/curriculum-packs-${language}-phone.png`, fullPage: true });
  });
  test(`${language}: owner catalogue lists every unverified item`, async ({ page }) => {
    await mount(page, language, "owner");
    await expect(page.locator("[data-catalogue-unverified] li")).toHaveCount(2);
    if (shots) await page.screenshot({ path: `${shots}/curriculum-catalogue-${language}.png`, fullPage: true });
  });
}
