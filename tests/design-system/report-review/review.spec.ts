import {test,expect,type Page,type Route} from '@playwright/test';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const requireTool=createRequire(createRequire(path.join(process.cwd(),'package.json')).resolve('tsx'));
const {build}=requireTool('esbuild'),{compile}=requireTool('@tailwindcss/node'),{Scanner}=requireTool('@tailwindcss/oxide');
let js:string,css:string;
test.beforeAll(async()=>{
 const root=process.cwd();
 const result=await build({entryPoints:[path.join(root,'tests/design-system/report-review/fixture.tsx')],outfile:'fixture.js',bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@/app/actions/locale':path.join(root,'tests/design-system/component-adoption/locale-mock.ts')}});
 js=result.outputFiles.find((file:{path:string})=>file.path.endsWith('.js')).text;
 const compiler=await compile(await readFile(path.join(root,'src/app/globals.css'),'utf8'),{base:path.join(root,'src/app'),onDependency(){}});
 css=compiler.build(new Scanner({sources:[{base:root,pattern:'src/components/**/*.{ts,tsx}',negated:false}]}).scan());
});
function data(name='Pupil A',canReview=true){return {canReview,canEdit:canReview,reportCards:[{id:name,student:{fullName:name,rollNo:'SYNTHETIC-01'},review:{id:`version-${name}`,number:2,language:'en',blockers:[],changedSections:['Marks','Remarks'],approvedAt:null,publishedAt:null,predecessorId:'version-1',reviewerNote:'Private synthetic note',snapshot:{marks:[{subject:'Mathematics',obtained:90,total:100}],reportCard:{percentage:90,grade:'A',reportLanguage:'en',remarksEn:'Current reviewed draft',remarksAr:'مسودة قيد المراجعة',remarksUr:'زیر جائزہ مسودہ'}},priorSnapshot:{marks:[{subject:'Mathematics',obtained:80,total:100}],reportCard:{percentage:80,grade:'B',remarksEn:'Previously published report'}}}}]};}
async function mount(page:Page,language:string,handler?:(route:Route)=>Promise<void>){
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<html lang="${language}" dir="${language==='en'?'ltr':'rtl'}"><body><main id="root"></main></body></html>`}));
 await page.route('**/api/reports**',handler|| (route=>route.fulfill({json:data()})));
 await page.goto(`http://report-review.test/?language=${language}`);await page.addStyleTag({content:css});await page.addScriptTag({content:js});
}
for(const language of ['en','ar','ur']) {
 test(`${language}: comparison reflows, version selection is keyboard accessible`,async({page})=>{
  await mount(page,language);await expect(page.getByText('Pupil A',{exact:true})).toBeVisible();
  await page.getByRole('checkbox').focus();await page.keyboard.press('Space');await expect(page.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button',{name:/Review version|مراجعة النسخة|نسخہ دیکھیں/}).click();
  await expect(page.getByRole('region')).toContainText('90');await expect(page.getByRole('region')).toContainText('80');
  await page.addStyleTag({content:'html{font-size:200% !important;}'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`${language}-comparison-phone.png`),fullPage:true});
 });
}
test('delayed old exam cannot repopulate the new scope',async({page})=>{
 let release:()=>void=()=>{};const pending=new Promise<void>(resolve=>release=resolve);let seen=false;
 await mount(page,'en',async route=>{if(route.request().url().includes('exam-a')){seen=true;await pending;await route.fulfill({json:data('OLD PRIVATE PUPIL')}).catch(()=>{});}else await route.fulfill({json:data('Current pupil',false)});});
 await expect.poll(()=>seen).toBe(true);await page.getByRole('button',{name:'Switch exam'}).click();await expect(page.getByText('Current pupil',{exact:true})).toBeVisible();release();
 await expect(page.getByText('OLD PRIVATE PUPIL')).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);
});
test('failed load has retry and never masquerades as empty',async({page})=>{
 let gets=0;await mount(page,'en',async route=>{gets++;await route.fulfill({status:gets===1?503:200,json:gets===1?{error:'Reports temporarily unavailable'}:data()});});
 await expect(page.getByRole('status')).toContainText('Reports temporarily unavailable');await expect(page.getByText(/No reports generated/)).toHaveCount(0);
 await page.getByRole('button',{name:'Retry loading reports'}).click();await expect(page.getByText('Pupil A',{exact:true})).toBeVisible();
});
test('failed draft save retains edits and inspection, never claims success',async({page})=>{
 await mount(page,'en',async route=>route.request().method()==='PATCH'?route.fulfill({status:503,json:{error:'Save unavailable'}}):route.fulfill({json:data()}));
 await page.getByRole('button',{name:/Review version/}).click();await page.getByRole('textbox',{name:'Remarks',exact:true}).fill('Keep my unsaved correction');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Save unavailable');
 await expect(page.getByRole('textbox',{name:'Remarks',exact:true})).toHaveValue('Keep my unsaved correction');await expect(page.getByRole('status')).not.toContainText('Saved.');
});
test('revoked write clears privileged data and requires fresh verification',async({page})=>{
 await mount(page,'en',async route=>route.request().method()==='PATCH'?route.fulfill({status:403,json:{error:'Access changed'}}):route.fulfill({json:data()}));
 await page.getByRole('button',{name:/Review version/}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByText('Pupil A',{exact:true})).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('button',{name:'Retry loading reports'})).toBeVisible();
});
test('stale approval refreshes changed content before another review',async({page})=>{
 let changed=false;await mount(page,'en',async route=>{if(route.request().method()==='POST'){changed=true;await route.fulfill({status:409,json:{error:'Version changed; review again'}});}else await route.fulfill({json:data(changed?'Changed pupil':'Pupil A')});});
 await page.getByRole('checkbox').check();await page.getByRole('textbox',{name:'Family-facing correction reason'}).fill('Corrected mark');await page.getByRole('button',{name:'Approve selected versions'}).click();
 await expect(page.getByText('Changed pupil',{exact:true})).toBeVisible();await expect(page.getByRole('checkbox')).not.toBeChecked();await expect(page.getByRole('status')).toContainText('Version changed');
});
