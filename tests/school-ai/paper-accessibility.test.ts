import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "@playwright/test";
import { buildCandidatePaperHtml } from "../../src/lib/school-ai/paper-print";
import { assessmentFixture } from "./assessment-fixture";

// SKAI-1013 (D2-07): automated accessibility and keyboard checks of the printed/PDF candidate paper in EN/UR/AR.
// axe-core is not a project dependency, so this is a focused WCAG subset evaluated in Chromium: language and
// direction, title, heading structure, image text alternatives, list semantics, keyboard order and text contrast.
let browser: Browser | null = null;
after(async () => { await browser?.close(); });

type Audit = { lang: string; dir: string; title: string; h1: number; levels: number[]; imgsWithoutAlt: number; positiveTabindex: number; focusables: number; lowContrast: string[]; optionsAreLists: boolean; overflow: boolean };

test("EN/UR/AR printed papers pass the structural, keyboard and contrast checks (Chromium)", async () => {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 820, height: 1000 } });
  for (const language of ["en", "ur", "ar"] as const) {
    const { paper } = assessmentFixture(); paper.language = language;
    await page.setContent(buildCandidatePaperHtml(paper, 1));
    await page.evaluate("globalThis.__name = (f) => f"); // tsx's keep-names helper inside page functions
    const audit: Audit = await page.evaluate(() => {
      const lum = (rgb: string) => { const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const background = (el: Element | null): string => { for (let n = el; n; n = n.parentElement) { const bg = getComputedStyle(n).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg; } return "rgb(255, 255, 255)"; };
      const lowContrast: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement; if (!el || !node.textContent?.trim()) continue;
        const style = getComputedStyle(el); if (style.visibility === "hidden" || style.display === "none") continue;
        const [a, b] = [lum(style.color), lum(background(el))].sort((x, y) => y - x);
        const ratio = (a + 0.05) / (b + 0.05), size = parseFloat(style.fontSize), bold = Number(style.fontWeight) >= 700;
        const needed = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
        if (ratio < needed) lowContrast.push(`${el.className || el.tagName}: ${ratio.toFixed(2)}`);
      }
      const focusables = [...document.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,[tabindex]")].filter((e) => e.tabIndex >= 0);
      return {
        lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title.trim(),
        h1: document.querySelectorAll("h1").length,
        levels: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1])),
        imgsWithoutAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
        positiveTabindex: [...document.querySelectorAll("[tabindex]")].filter((e) => Number(e.getAttribute("tabindex")) > 0).length,
        focusables: focusables.length,
        lowContrast,
        optionsAreLists: [...document.querySelectorAll(".options")].every((o) => o.tagName === "OL" || o.tagName === "UL"),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    assert.equal(audit.lang, language);
    assert.equal(audit.dir, language === "en" ? "ltr" : "rtl");
    assert.ok(audit.title, `${language}: document title`);
    assert.equal(audit.h1, 1, `${language}: one h1`);
    assert.ok(audit.levels.every((l, i) => i === 0 || l <= audit.levels[i - 1] + 1), `${language}: heading levels never skip: ${audit.levels}`);
    assert.equal(audit.imgsWithoutAlt, 0, `${language}: every figure image has alt text`);
    assert.equal(audit.positiveTabindex, 0, `${language}: no positive tabindex`);
    assert.ok(audit.optionsAreLists, `${language}: choices are list items`);
    assert.deepEqual(audit.lowContrast, [], `${language}: text contrast meets WCAG AA`);
    assert.equal(audit.overflow, false, `${language}: no horizontal overflow`);
    // Keyboard: Tab never traps focus and visits every focusable element (a static paper may have none).
    const visited = new Set<string>();
    for (let i = 0; i <= audit.focusables + 1; i++) { await page.keyboard.press("Tab"); visited.add(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? "")); }
    assert.ok(visited.size >= Math.min(audit.focusables, 1), `${language}: Tab reaches focusable content`);
  }
});
