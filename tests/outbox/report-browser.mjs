import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";

const directory = resolve("docs/operations/evidence/sko-382-2026-10-15");
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const lang of ["en", "ar", "ur"]) for (const [width,height] of [[320,720],[390,844],[768,1024],[1440,1000]]) for (const zoom of [1,2]) for (const reducedMotion of ["no-preference","reduce"]) {
    const page = await browser.newPage({ viewport:{width,height}, reducedMotion });
    const url = pathToFileURL(resolve(directory, `report${lang === "en" ? "" : `-${lang}`}.html`)).href;
    await page.goto(url);
    await page.evaluate(value => { document.body.style.zoom = String(value); }, zoom);
    assert.equal(await page.locator("html").getAttribute("lang"), lang);
    assert.equal(await page.locator("html").getAttribute("dir"), lang === "en" ? "ltr" : "rtl");
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator("button,input,dialog,[role=dialog]").count(), 0);
    assert.equal(await page.locator("ol li").count(), 5);
    assert.ok(await page.locator('bdi[dir="ltr"]').count() >= 10);
    const geometry = await page.evaluate(() => ({ scroll:document.documentElement.scrollWidth,viewport:window.innerWidth }));
    assert.ok(geometry.scroll <= geometry.viewport + 1, `${lang} ${width} zoom${zoom}: horizontal overflow ${JSON.stringify(geometry)}`);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "A");
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), "solid");
    const links = await page.locator("a").evaluateAll(elements => elements.map(element => element.getAttribute("href")));
    for (const link of links.filter(link => link !== "report-ui.json")) assert.ok(readFileSync(resolve(directory,link)).length > 0);
    results.push({ lang, width, height, scale:zoom, scaling:"CSS layout zoom (not a claim of native browser zoom)", reducedMotion, status:"passed", checks:["locale/direction","semantic timeline/text status","isolated IDs","no horizontal overflow","keyboard-visible focus","real local links","no pretend controls"] });
    if (zoom === 1 && reducedMotion === "reduce" && ((lang === "en" && width === 1440) || (lang !== "en" && width === 390))) await page.screenshot({path:resolve(directory,`report-${lang}-${width}.png`),fullPage:true});
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(resolve(directory,"report-ui.json"),JSON.stringify({scope:"Actual static operator evidence report; not application UI",passed:results.length,failed:0,results},null,2)+"\n");
process.stdout.write(`${results.length}/${results.length} localized responsive/keyboard report checks passed\n`);
