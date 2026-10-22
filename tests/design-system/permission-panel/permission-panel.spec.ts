import {test,expect,type Page} from '@playwright/test';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {permissionCopy,permissionLabel} from '../../../src/components/shared-admin/permission-copy';
const requireTool=createRequire(createRequire(path.join(process.cwd(),'package.json')).resolve('tsx'));
const {build}=requireTool('esbuild'),{compile}=requireTool('@tailwindcss/node'),{Scanner}=requireTool('@tailwindcss/oxide');
let js:string,css:string;
test.beforeAll(async()=>{
 const root=process.cwd();
 const result=await build({entryPoints:[path.join(root,'tests/design-system/permission-panel/fixture.tsx')],outfile:'fixture.js',bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@/app/actions/locale':path.join(root,'tests/design-system/component-adoption/locale-mock.ts')}});
 js=result.outputFiles.find((file:{path:string})=>file.path.endsWith('.js')).text;
 const compiler=await compile(await readFile(path.join(root,'src/app/globals.css'),'utf8'),{base:path.join(root,'src/app'),onDependency(){}});
 css=compiler.build(new Scanner({sources:[{base:root,pattern:'src/components/**/*.{ts,tsx}',negated:false}]}).scan());
});
const flags={canView:true,canAdd:false,canEdit:false,canDelete:false};
function snapshot(canEdit=true){return {matrix:{PRINCIPAL:{students:{...flags},'front-desk':{...flags}},TEACHER:{students:{...flags,canEdit:true},'front-desk':{...flags,canAdd:true}}},modules:['students','front-desk'],callerRole:'SUPER_ADMIN',canEdit};}
async function mount(page:Page,language:'en'|'ar'|'ur',options:{loadFails?:boolean;readOnly?:boolean;saveFails?:boolean;saveFailsAfter?:number;writeDenied?:boolean}={}){
 let gets=0;const writes:Record<string,unknown>[]=[];
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<html lang="${language}" dir="${language==='en'?'ltr':'rtl'}"><body><main id="root"></main></body></html>`}));
 await page.route('**/api/roles/permissions',async route=>{
  if(route.request().method()==='GET') {gets++;return route.fulfill({status:options.loadFails&&gets===1?503:200,json:options.loadFails&&gets===1?{success:false}:{success:true,data:snapshot(!options.readOnly && !(options.writeDenied && writes.length))}});}
  const body=route.request().postDataJSON();writes.push(body);
  const failed=options.saveFails || options.saveFailsAfter!==undefined && writes.length>options.saveFailsAfter;
  return route.fulfill({status:options.writeDenied?403:failed?503:200,json:failed||options.writeDenied?{success:false}:{success:true,data:{...flags,...body}}});
 });
 await page.goto(`http://permission-panel.test/?language=${language}`);await page.addStyleTag({content:css});await page.addScriptTag({content:js});
 return {writes,gets:()=>gets};
}
for(const language of ['en','ar','ur'] as const){
 const copy=permissionCopy(language),label=(value:string)=>permissionLabel(value,language);
 test(`${language}: failed load stays empty, retry verifies scope and phone reflow`,async({page})=>{
  const fixture=await mount(page,language,{loadFails:true});
  await expect(page.getByRole('alert')).toContainText(copy.loadError);
  await expect(page.getByRole('switch')).toHaveCount(0);
  await page.getByRole('button',{name:copy.retry,exact:true}).click();
  await expect(page.getByRole('switch').first()).toBeVisible();expect(fixture.gets()).toBe(2);
  await page.addStyleTag({content:'html {font-size:200% !important;}'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const heading=page.getByRole('heading',{name:copy.title,exact:true});
  expect((await heading.boundingBox())!.width).toBeGreaterThanOrEqual(200);
  await page.screenshot({path:test.info().outputPath(`${language}-phone-current-permissions.png`),fullPage:true});
 });
 test(`${language}: failed save never toggles acknowledged flags`,async({page})=>{
  const fixture=await mount(page,language,{saveFails:true});
  const edit=page.getByRole('switch',{name:`${label('PRINCIPAL')}: ${label('students')} — ${copy.edit}`,exact:true});
  await expect(edit).toHaveAttribute('aria-checked','false');await edit.click();
  await expect(page.getByRole('alert')).toContainText(copy.saveError);
  await expect(edit).toHaveAttribute('aria-checked','false');expect(fixture.writes).toHaveLength(1);
  await expect(page.getByRole('status')).not.toHaveText(copy.saved);
 });
 test(`${language}: copy failure retains confirmation and returns focus on cancel`,async({page})=>{
  const fixture=await mount(page,language,{saveFailsAfter:1});
  await page.getByRole('combobox',{name:copy.copyFrom,exact:true}).selectOption('TEACHER');
  const review=page.getByRole('button',{name:copy.review,exact:true});await review.click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:copy.cancel,exact:true})).toBeFocused();
  // R3: copying a role's permissions asks for the reason first; the confirm stays disabled until it is long enough.
  await expect(dialog.getByRole('button',{name:copy.confirm,exact:true})).toBeDisabled();
  await dialog.getByRole('textbox',{name:copy.reason}).fill('Match the teacher defaults for the new term');
  await dialog.getByRole('button',{name:copy.confirm,exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText(copy.saveError);
  await expect(dialog.getByRole('alert')).toContainText(copy.partial);expect(fixture.writes).toHaveLength(2);
  await expect(dialog).toBeVisible();
  await page.screenshot({path:test.info().outputPath(`${language}-copy-failure-confirmation.png`),fullPage:false});
  await dialog.getByRole('button',{name:copy.cancel,exact:true}).click();await expect(dialog).toHaveCount(0);await expect(review).toBeFocused();
  await expect(page.getByRole('switch',{name:`${label('PRINCIPAL')}: ${label('students')} — ${copy.edit}`,exact:true})).toHaveAttribute('aria-checked','true');
 });
 test(`${language}: successful changes adopt server confirmation and View gates actions`,async({page})=>{
  const fixture=await mount(page,language);
  const view=page.getByRole('switch',{name:`${label('PRINCIPAL')}: ${label('students')} — ${copy.view}`,exact:true});
  await view.click();await expect(view).toHaveAttribute('aria-checked','false');
  await expect(page.getByRole('status')).toHaveText(copy.saved);
  await expect(page.getByRole('switch',{name:`${label('PRINCIPAL')}: ${label('students')} — ${copy.edit}`,exact:true})).toBeDisabled();
  expect(fixture.writes).toHaveLength(1);
 });
 test(`${language}: school-scoped read-only access cannot mutate`,async({page})=>{
  const fixture=await mount(page,language,{readOnly:true});
  await expect(page.getByText(copy.readOnly,{exact:true})).toBeVisible();
  for(const control of await page.getByRole('switch').all()) await expect(control).toBeDisabled();
  await expect(page.getByRole('button',{name:copy.review,exact:true})).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
 });
 test(`${language}: revoked access clears cached matrix until fresh verification`,async({page})=>{
  await mount(page,language,{writeDenied:true});
  await page.getByRole('switch',{name:`${label('PRINCIPAL')}: ${label('students')} — ${copy.edit}`,exact:true}).click();
  await expect(page.getByRole('alert')).toContainText(copy.denied);
  await expect(page.getByRole('switch')).toHaveCount(0);
  await page.getByRole('button',{name:copy.retry,exact:true}).click();
  await expect(page.getByText(copy.readOnly,{exact:true})).toBeVisible();
  for(const control of await page.getByRole('switch').all()) await expect(control).toBeDisabled();
 });
}
