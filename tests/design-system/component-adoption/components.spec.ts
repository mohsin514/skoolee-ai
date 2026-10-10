import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const toolRequire=createRequire(createRequire(path.join(process.cwd(),'package.json')).resolve('tsx'));
const {build}=toolRequire('esbuild'); const {compile}=toolRequire('@tailwindcss/node'); const {Scanner}=toolRequire('@tailwindcss/oxide');
let js:string, css:string;
test.beforeAll(async()=>{
 const root=process.cwd();js=(await build({entryPoints:[path.join(root,'tests/design-system/component-adoption/fixture.tsx')],outfile:path.join(root,"test-results/component-fixture.js"),bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},alias:{'@/components/chat':path.join(root,'tests/design-system/component-adoption/chat-mock.ts'),'@/app/actions/locale':path.join(root,'tests/design-system/component-adoption/locale-mock.ts'),'@/components/chat/chat-provider':path.join(root,'tests/design-system/component-adoption/chat-mock.ts'),'next/navigation':path.join(root,'tests/design-system/component-adoption/navigation-mock.ts')},plugins:[{name:'chat-stub',setup(builder:{onResolve:(options:{filter:RegExp},callback:()=>{path:string})=>void}){builder.onResolve({filter:/^\.\/chat-provider$/},()=>({path:path.join(root,'tests/design-system/component-adoption/chat-mock.ts')}));}}]})).outputFiles[0].text;
 const compiler=await compile(await readFile(path.join(root,'src/app/globals.css'),'utf8'),{base:path.join(root,'src/app'),onDependency(){}});
 css=compiler.build(new Scanner({sources:[{base:root,pattern:'src/components/**/*.{ts,tsx}',negated:false},{base:root,pattern:'tests/design-system/component-adoption/*.tsx',negated:false}]}).scan());
});
async function mount(page:Page,width=1440,language='en'){
 await page.setViewportSize({width,height:900}); await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',r=>r.request().url().startsWith('http://components.test/')?r.fulfill({contentType:'text/html',body:`<html lang="${language}" dir="${language==='en'?'ltr':'rtl'}"><body><div id="fixture-root"></div></body></html>`}):r.abort());
 await page.goto('http://components.test/');
 await page.evaluate(()=>{const events:string[]=[];(window as unknown as {focusTrace:string[]}).focusTrace=events;document.addEventListener('focusin',event=>{const target=event.target as HTMLElement;events.push(target.tagName+':'+(target.getAttribute('aria-label')||target.getAttribute('name')||target.textContent||'').slice(0,70));});}); await page.addStyleTag({content:css}); await page.addScriptTag({content:js});
 await expect(page.getByRole('heading',{name:'Component adoption fixture'})).toBeVisible();
}
const permissions={learningRecords:true,attendance:false,finances:false,communication:false,pickup:false,consents:{medicalTreatment:false,fieldTrips:false,mediaPublication:false,offsiteTravel:false}};
async function guardian(page:Page){await page.route('**/api/students/fixture-student/guardians**',route=>route.request().method()==='GET'?route.fulfill({json:{success:true,relationships:[],reviewQueue:[]}}):route.abort());await page.getByRole('button',{name:'Open guardian',exact:true}).click();}

test('guardian fields, native checkbox payload, shared preview, busy and focus recovery',async({page})=>{
 await mount(page,390);await guardian(page);
 await page.getByLabel('Guardian name',{exact:true}).fill('Synthetic Guardian'); await page.getByLabel('Verified account email',{exact:true}).fill('guardian@example.test');await page.getByLabel('Reason for this change',{exact:true}).fill('Synthetic UI review');await page.getByLabel('Learning records and published reports',{exact:true}).check();
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>release=resolve);let previewPayload:Record<string,unknown>={};
 await page.route('**/api/students/fixture-student/guardians',async route=>{const body=route.request().postDataJSON();if(body.action==='preview'){previewPayload=body;await route.fulfill({json:{success:true,relationshipId:'fixture-relation',previewId:'fixture-preview',effectiveAccess:permissions,impact:{effectiveFrom:'2026-10-08T12:00:00Z',validUntil:null,guardian:'Synthetic Guardian'}}});}else{await gate;await route.fulfill({status:409,json:{success:false,error:'Synthetic stale preview'}});}});
 const review=page.getByRole('button',{name:'Review access',exact:true});await review.click();const dialog=page.getByRole('dialog',{name:'Review effective access'});await expect(dialog).toBeVisible();expect(previewPayload.permissions).toEqual(permissions);
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('hidden');await dialog.getByRole('button',{name:'Create invitation',exact:true}).click();await expect(dialog.getByRole('button',{name:'Close preview',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();release();await expect(dialog.getByRole('alert')).toHaveText('Synthetic stale preview');await expect(dialog.getByRole('button',{name:'Close preview',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Close preview',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(review).toBeFocused();await expect(page.getByLabel('Guardian name',{exact:true})).toHaveValue('Synthetic Guardian');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('guardian-390.png'),fullPage:true});
});
for(const width of [320,1440])test(`provisioning fields and choices keep accessible vertical layout at ${width}`,async({page})=>{
 await mount(page,width);await page.getByRole('button',{name:'Open provision',exact:true}).click();const d=page.getByRole('dialog',{name:'Provision a school'});await expect(d).toBeVisible();const name=d.getByLabel('School / group name',{exact:false});await name.fill('Synthetic school');await expect(name).toHaveAttribute('aria-required','true');
 await d.getByRole('button',{name:/^Pro PKR/}).click();await expect(d.getByRole('button',{name:/^Pro PKR/})).toHaveAttribute('aria-pressed','true');await d.getByRole('button',{name:/^Basic PKR/}).click();await expect(d.getByRole('button',{name:/^Basic PKR/})).toHaveAttribute('aria-pressed','true');
 expect(await d.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:test.info().outputPath(`provision-${width}.png`),fullPage:true});await page.keyboard.press('Escape');await expect(d).toHaveCount(0);await expect(page.getByRole('button',{name:'Open provision',exact:true})).toBeFocused();
});
test('chat composer preserves Enter/Shift+Enter, payload and disabled send while pending',async({page})=>{
 await mount(page,390);let release:()=>void=()=>{};const gate=new Promise<void>(r=>release=r);const sent:unknown[]=[];await page.route('**/synthetic/send',async route=>{sent.push(route.request().postDataJSON());await gate;await route.fulfill({json:{success:true}});});await page.getByRole('button',{name:'Open composer',exact:true}).click();const input=page.getByRole('textbox',{name:'Write a message',exact:true});await input.fill('Synthetic message');await input.press('Shift+Enter');await expect(input).toHaveValue('Synthetic message\n');await input.press('Enter');await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();expect(sent).toEqual([{body:'Synthetic message',attachments:[]}]);release();await expect(input).toHaveValue('');await expect(input).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('new conversation shared selection, intercepted group creation and dialog keyboard dismissal',async({page})=>{
 await mount(page,390);let payload:unknown;await page.route('**/synthetic/group',async route=>{payload=route.request().postDataJSON();await route.fulfill({json:{success:true}});});await page.getByRole('button',{name:'Open conversation',exact:true}).click();const d=page.getByRole('dialog');await expect(d).toBeVisible();await d.getByRole('tab',{name:'Group',exact:true}).click();await expect(d.getByRole('tab',{name:'Group',exact:true})).toHaveAttribute('aria-selected','true');await d.getByRole('textbox',{name:'Group name',exact:true}).fill('Synthetic group');const contact=d.getByRole('button',{name:/^Synthetic Teacher/});await contact.click();await expect(contact).toHaveAttribute('aria-pressed','true');await d.getByRole('button',{name:'Create group · 1',exact:true}).click();await expect(d).toHaveCount(0);expect(payload).toEqual({kind:'GROUP',title:'Synthetic group',memberIds:['fixture-contact']});await page.getByRole('button',{name:'Open conversation',exact:true}).click();await expect(d).toBeVisible();await page.keyboard.press('Escape');await expect(d).toHaveCount(0);
});
test('chat setting remains an accessible switch with the same intercepted settings payload',async({page})=>{
 await mount(page,390);const settings={parentToSupport:true,studentToSupport:false,parentToParent:false,studentToStudent:false,attachmentsEnabled:true,quietHoursEnabled:false,quietHoursStart:'18:00',quietHoursEnd:'08:00'};let payload:unknown;await page.route('**/api/chat/settings',async route=>{if(route.request().method()==='PATCH')payload=route.request().postDataJSON();await route.fulfill({json:{success:true,settings}});});await page.getByRole('button',{name:'Open settings',exact:true}).click();const control=page.getByRole('switch',{name:'Guardians may message each other',exact:true});await expect(control).toHaveAttribute('aria-checked','false');await control.focus();await page.keyboard.press('Space');await expect(control).toHaveAttribute('aria-checked','true');expect(payload).toEqual({...settings,parentToParent:true});expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
test('teacher save shortcut and workspace selection remain functional with shared controls',async({page})=>{
 await mount(page,390);await page.getByRole('button',{name:'Open savebar',exact:true}).click();await page.keyboard.press('Control+s');await expect(page.getByLabel('Saved count')).toHaveText('1');await page.getByRole('button',{name:'Discard',exact:true}).click();await expect(page.getByLabel('Saved count')).toHaveText('0');await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Reports',exact:true}).click();await expect(page.getByLabel('Selected view')).toHaveText('reports');await expect(page.getByRole('button',{name:'Reports',exact:true})).toHaveAttribute('aria-current','page');
});

test('standalone statistics card keeps one activation per native keyboard action',async({page})=>{
 await mount(page,390);await page.getByRole('button',{name:'Open statcard',exact:true}).click();const card=page.getByRole('button',{name:'Example records 12',exact:true});await card.focus();await page.keyboard.press('Enter');await expect(page.getByLabel('Card activations')).toHaveText('1');await page.keyboard.press('Space');await expect(page.getByLabel('Card activations')).toHaveText('2');await card.click();await expect(page.getByLabel('Card activations')).toHaveText('3');
});
test('Urdu guardian form retains RTL field and checkbox geometry at320px',async({page})=>{
 await mount(page,320,'ur');await guardian(page);const email=page.getByLabel('تصدیق شدہ اکاؤنٹ ای میل',{exact:true});await expect(email).toHaveAttribute('dir','ltr');await expect(email).toHaveAccessibleDescription('ایک جیسا فون نمبر خاندانی ریکارڈز کو نہیں جوڑتا۔');const box=page.getByRole('checkbox').first();await box.focus();await page.keyboard.press('Space');await expect(box).toBeChecked();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('guardian-ur-320.png'),fullPage:true});
});

for (const width of [360, 1440]) test(`role sidebar suppresses duplicate card navigation at ${width}px`, async ({ page }) => {
  await mount(page, width);
  await page.getByRole('button', { name: 'Open sidebar-navigation', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Example workspace' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Example workspace' })).toBeVisible();
});

for (const width of [360, 1440]) test(`role shell tab-return skeleton preserves work and access recovery at ${width}px`, async ({ page }) => {
  await mount(page, width);
  let release: (() => void) | undefined; let pending = false; let fail = false;
  await page.route('**/api/navigation/access', async route => {
    if (pending) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill(fail ? { status: 503, json: { error: 'Unavailable' } } : { json: { access: { reports: true } } });
  });
  await page.getByRole('button', { name: 'Open role-shell', exact: true }).click();
  const field = page.getByLabel('Workspace draft');
  await field.fill('Preserved draft'); pending = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const skeleton = page.getByRole('status', { name: 'Checking workspace access', exact: true });
  await expect(skeleton).toBeVisible(); await expect(skeleton).toHaveAttribute('aria-busy', 'true');
  expect((await skeleton.boundingBox())!.height).toBeGreaterThan(300);
  await expect(field).toBeHidden();
  await expect(page.getByTitle("View notifications")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Primary navigation", exact: true })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Mobile navigation", exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => Boolean(release)).toBe(true);
  fail = true; pending = false; release!();
  await expect(page.getByRole('button', { name: 'Retry access check' })).toBeVisible();
  await expect(field).toBeHidden(); fail = false;
  await page.getByRole('button', { name: 'Retry access check' }).click();
  await expect(skeleton).toHaveCount(0); await expect(field).toHaveValue('Preserved draft');
  await expect(page.getByRole('navigation', { name: 'Duplicate sections' })).toHaveCount(0);
  if (width === 360) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Reports', exact: true })).toBeVisible();
  } else await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('button', { name: 'Reports', exact: true })).toBeVisible();
});

test('header icons and account menu share consistent button surfaces', async ({ page }) => {
  await mount(page, 1440);
  await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: true } } }));
  await page.getByRole('button', { name: 'Open role-shell', exact: true }).click();
  const notifications = page.getByTitle('View notifications');
  const settings = page.getByTitle('Account settings', { exact: true });
  await expect(notifications).toBeVisible();
  const surface = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    return [style.borderWidth, style.borderColor, style.borderRadius, style.backgroundColor, style.height, style.fontSize];
  };
  expect(await notifications.evaluate(surface)).toEqual(await settings.evaluate(surface));
  await page.getByTitle('Account menu').click();
  const menu = page.getByRole('menu');
  const account = menu.getByRole('menuitem', { name: 'Account settings', exact: true });
  const password = menu.getByRole('menuitem', { name: 'Change password', exact: true });
  const signout = menu.getByRole('menuitem', { name: 'Sign out', exact: true });
  await expect(account).toBeVisible();
  expect(await account.evaluate(surface)).toEqual(await password.evaluate(surface));
  expect(await account.evaluate(surface)).toEqual(await signout.evaluate(surface));
});
