import { test, expect, type Page, type Route } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

type FixtureWindow = Window & { __ownedView: string; __ownedReadOnly: boolean; __ownedLanguage: string };
type FixtureBuilder = {
  onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace?: string }) => void;
  onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: "js" | "jsx" | "tsx"; resolveDir?: string }) => void;
};
const { build } = createRequire(require.resolve("tsx"))("esbuild");
let script: string, css: string;
const evidence = "test-results/design-system/evidence/family-fees-academic";
const modules: Record<string, string> = {
  "@/app/actions/locale": `import {defaultLocale} from '@/lib/locale/package'; export async function getEffectiveDisplayLocale() { return {...defaultLocale, language: window.__ownedLanguage || 'en'}; }`,
  "next/link": `import React from 'react'; export default function Link(props) {return React.createElement('a',props);}`,
  "sonner": `export const toast = { success() {}, error() {}, info() {} };`,
  "@/components/role-dashboard": `import React from 'react'; import {Button} from '@/components/ui/button'; export function BrandButton({icon,children,variant,...props}) {return React.createElement(Button,{...props,variant:variant==='soft'?'secondary':variant},icon,children);} export function EmptyState({title,description}) { return React.createElement('div',null,title,description); }`,
};
test.beforeAll(async () => {
  const result = await build({
    entryPoints: [resolve("tests/design-system/fixtures/family-fees-academic.tsx")], bundle: true, write: false,
    outdir: "/private/tmp/family-fees-academic", platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' }, loader: { ".module.css": "local-css" },
    plugins: [{ name: "isolated-owned-ui", setup(builder: FixtureBuilder) {
      if (process.env.OWNED_BASELINE) {
        builder.onResolve({filter: /^@\/components\/academic\/AcademicCalendar$/}, () => ({path: "original-calendar", namespace: "original-calendar"}));
        builder.onLoad({filter: /.*/, namespace: "original-calendar"}, () => ({contents: execFileSync("git", ["show", "HEAD:src/components/academic/AcademicCalendar.tsx"], {encoding: "utf8"}), loader: "tsx", resolveDir: process.cwd()}));
      }
      builder.onResolve({filter: /^(@\/app\/actions\/locale|next\/link|sonner|@\/components\/role-dashboard)$/}, args => ({path: args.path, namespace:"synthetic"}));
      builder.onLoad({filter:/.*/,namespace:"synthetic"}, args => ({contents:modules[args.path],loader:"jsx",resolveDir:process.cwd()}));
    } }],
  });
  script = result.outputFiles.find((file: { path: string }) => file.path.endsWith(".js")).text;
  css = result.outputFiles.find((file: { path: string }) => file.path.endsWith(".css"))?.text || "";
});
async function mount(page: Page, view: string, language = "en", readOnly = false) {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", {name: "Recover account"})).toBeVisible();
  const source = await page.evaluate(() => ({html:document.documentElement.className,body:document.body.className,styles:Array.from(document.querySelectorAll('link[rel="stylesheet"],style')).map(node => {const copy=node.cloneNode(true) as HTMLElement;if(node instanceof HTMLLinkElement)copy.setAttribute("href",node.href);return copy.outerHTML;}).join("\n")}));
  const requests: {method:string;url:string;body:unknown}[] = [];
  await page.route("**/api/**", async route => {
    const request=route.request(),url=new URL(request.url());requests.push({method:request.method(),url:url.pathname+url.search,body:request.postDataJSON()});
    // All API traffic from this isolated fixture is fulfilled; none reaches live data.
    if(request.method()!=="GET") return route.fulfill({status:400,json:{success:false,error:"Synthetic failure"}});
    if(url.pathname==="/api/academic/calendar/unified") return route.fulfill({json:{success:true,data:{weekends:[6,7],terms:[],holidays:[],exams:[]}}});
    if(url.pathname==="/api/academic-models") return route.fulfill({json:{success:true,classes:[{id:"synthetic-class",name:"Grade 6",section:"A",academicYear:2026,subjects:[{id:"synthetic-subject",name:"Mathematics",totalMarks:100}]}],versions:[],templates:[]}});
    if(url.pathname==="/api/classes") return route.fulfill({json:{success:true,data:[{id:"synthetic-class",name:"Grade 6",section:"A"}]}});
    if(url.pathname==="/api/auth/sessions") return route.fulfill({json:{mfaEnabled:true,sessions:[{id:"synthetic-session",userAgent:"Synthetic browser",loginAt:"2026-10-01T08:00:00Z",expiresAt:"2026-10-20T08:00:00Z",current:false}]}});
    return route.fulfill({json:{success:true,data:[],total:0,totalPages:1}});
  });
  await page.route("**/__owned_ui_fixture__", route => route.fulfill({contentType:"text/html",body:`<!doctype html><html class="${source.html}" lang="${language}" dir="${language==='en'?'ltr':'rtl'}"><head>${source.styles}<style>${css}</style></head><body class="${source.body}"><div id="owned-ui-fixture"></div></body></html>`}));
  await page.goto("/__owned_ui_fixture__");
  await page.evaluate(({view,language,readOnly})=>{const w=window as unknown as FixtureWindow;w.__ownedView=view;w.__ownedLanguage=language;w.__ownedReadOnly=readOnly;},{view,language,readOnly});
  await page.addScriptTag({content:script});
  return requests;
}
async function noOverflow(page: Page) {expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);}

test("calendar dialog uses modal semantics, traps focus and restores its trigger",async({page})=>{
  await mount(page,"calendar");
  const trigger=page.locator('button.group.relative.h-16').first();await trigger.click();
  const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
  await page.screenshot({path:`${evidence}/${process.env.OWNED_BASELINE?'baseline-':''}calendar-dialog.png`,fullPage:true});
  await expect(dialog).toHaveAttribute("aria-modal","true");
  expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  const buttons=dialog.getByRole("button");await buttons.last().focus();await page.keyboard.press("Tab");expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
});

test("holiday date contracts, dirty guard and pending protections stay intact",async({page})=>{
  const requests=await mount(page,"calendar");await page.getByRole("button",{name:/Events on/}).first().click();
  const dialog=page.getByRole("dialog");const from=dialog.locator('input[type=date]').nth(0),to=dialog.locator('input[type=date]').nth(1);
  await from.fill("2026-10-12");await to.fill("2026-10-11");await dialog.getByRole("textbox",{name:/Holiday name for/}).fill("Synthetic holiday");
  await expect(to).toHaveAttribute("min","2026-10-12");await expect(to).toHaveAttribute("aria-invalid","true");await expect(dialog.getByRole("button",{name:"Add Holiday",exact:true})).toBeDisabled();
  await to.fill("2026-10-13");await page.keyboard.press("Escape");await expect(page.getByRole("alertdialog")).toBeVisible();await page.getByRole("button",{name:"Keep editing"}).click();await expect(dialog.getByRole("textbox",{name:/Holiday name for/})).toHaveValue("Synthetic holiday");
  const pending:Route[]=[];await page.route("**/api/academic/calendar?*",route=>{pending.push(route);});
  await dialog.getByRole("button",{name:"Add Holiday",exact:true}).click();await expect(dialog.getByRole("textbox",{name:/Holiday name for/})).toHaveAttribute("readonly","");await expect(dialog.getByRole("button",{name:/Close/})).toBeDisabled();await expect(dialog.getByRole("button",{name:"Schedule Exam",exact:true})).toBeDisabled();
  expect(pending).toHaveLength(1);expect(pending[0].request().method()).toBe("POST");expect(pending[0].request().postDataJSON()).toEqual({name:"Synthetic holiday",fromDate:"2026-10-12",toDate:"2026-10-13"});
  await pending[0].fulfill({status:400,json:{success:false,error:"Synthetic failure"}});await expect(dialog.getByRole("button",{name:"Add Holiday",exact:true})).toBeEnabled();expect(requests.filter(r=>r.method!=="GET")).toHaveLength(0);
});

test("calendar permission boundary keeps parent view read-only",async({page})=>{
  await mount(page,"calendar","en",true);await page.getByRole("button",{name:/Events on/}).first().click();await expect(page.getByRole("dialog")).toBeVisible();await expect(page.getByRole("button",{name:"Add Holiday",exact:true})).toHaveCount(0);await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("invoice filters retain query and selected state with named keyboard search",async({page})=>{
  const requests=await mount(page,"invoices");await page.getByRole("button",{name:"Overdue",exact:true}).click();await expect(page.getByRole("button",{name:"Overdue",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByPlaceholder("Search student or invoice #...").fill("SYNTHETIC-ONLY");await page.getByRole("button",{name:"Search",exact:true}).press("Enter");
  await expect.poll(()=>requests.some(r=>r.url.includes("status=OVERDUE")&&r.url.includes("search=SYNTHETIC-ONLY")&&r.url.includes("campusId=synthetic-campus")&&r.url.includes("pageSize=20"))).toBe(true);
  await page.setViewportSize({width:390,height:844});await noOverflow(page);await page.screenshot({path:`${evidence}/invoice-filters-390.png`,fullPage:true});
});

test("academic model fields keep grading constraints and version draft actions",async({page})=>{
  const requests=await mount(page,"model");await page.getByRole("button",{name:"Start a new draft"}).click();
  await expect(page.getByLabel("Version title",{exact:true})).toHaveValue(/Grade 6/);await expect(page.getByLabel("Academic year",{exact:true})).toHaveAttribute("min","2000");await expect(page.getByLabel("Academic year",{exact:true})).toHaveAttribute("max","2100");
  const periods=page.getByRole("button",{name:"Remove period",exact:true});const before=await periods.count();await page.getByRole("button",{name:"Add period",exact:true}).click();await expect(periods).toHaveCount(before+1);
  expect(requests.every(r=>r.method==="GET")).toBe(true);await page.setViewportSize({width:390,height:844});await noOverflow(page);await page.screenshot({path:`${evidence}/academic-model-390.png`,fullPage:true});
});

for(const language of ["en","ar","ur"])test(`currency values and account labels render in ${language}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});await mount(page,"currency",language);const select=page.getByRole("combobox");await expect(select).toHaveValue("KWD");await select.selectOption("JPY");await expect(page.locator("output")).toHaveText("JPY");await noOverflow(page);await page.screenshot({path:`${evidence}/currency-${language}-390.png`});
  const requests=await mount(page,"account",language);await expect(page.getByRole("heading",{level:1})).toBeVisible();await expect(page.locator('input[type=password]')).toHaveAttribute("autocomplete","current-password");await expect(page.locator('#replacement-code')).toHaveAttribute("autocomplete","one-time-code");await expect(page.locator('input[type=password]')).toHaveAccessibleName(language==="en"?"Current password":language==="ar"?"كلمة المرور الحالية":"موجودہ پاس ورڈ");await noOverflow(page);await page.screenshot({path:`${evidence}/account-${language}-390.png`,fullPage:true});expect(requests.every(r=>r.method==="GET")).toBe(true);
});

for(const language of ["en","ar","ur"])test(`calendar mobile geometry in ${language}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await mount(page,"calendar",language);const trigger=page.locator("button.group.relative.h-16").first();await expect(trigger).toBeVisible();await noOverflow(page);await trigger.click();await expect(page.getByRole("dialog")).toBeVisible();await noOverflow(page);await page.screenshot({path:`${evidence}/calendar-${language}-390.png`,fullPage:true});
});
