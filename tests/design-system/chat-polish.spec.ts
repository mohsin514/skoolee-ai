import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const requireTooling=createRequire(createRequire(path.join(process.cwd(),'package.json')).resolve('tsx'));
const {build}=requireTooling('esbuild'),{compile}=requireTooling('@tailwindcss/node'),{Scanner}=requireTooling('@tailwindcss/oxide');
let script:string,styles:string;
test.beforeAll(async()=>{
 const root=process.cwd();script=(await build({entryPoints:[path.join(root,'tests/design-system/chat-polish/fixture.tsx')],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},alias:{'next/navigation':path.join(root,'tests/design-system/chat-polish/navigation.ts'),'@/app/actions/locale':path.join(root,'tests/design-system/component-adoption/locale-mock.ts'),'@/components/chat/chat-provider':path.join(root,'tests/design-system/chat-polish/provider.tsx')},plugins:[{name:'chat-fixture',setup(builder:{onResolve:(o:{filter:RegExp},cb:()=>unknown)=>void}){builder.onResolve({filter:/^\.\/chat-provider$/},()=>({path:path.join(root,'tests/design-system/chat-polish/provider.tsx')}));}}]})).outputFiles[0].text;
 const compiler=await compile(await readFile(path.join(root,'src/app/globals.css'),'utf8'),{base:path.join(root,'src/app'),onDependency(){}});styles=compiler.build(new Scanner({sources:[{base:root,pattern:'src/**/*.{ts,tsx}',negated:false},{base:root,pattern:'tests/design-system/chat-polish/*.tsx',negated:false}]}).scan());
});
async function mount(page:Page,mode:string,width:number){await page.setViewportSize({width,height:800});await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="fixture-root"></div></body></html>'}));await page.goto(`http://chat.test/${mode}`);await page.addStyleTag({content:styles});await page.addScriptTag({content:script});}
for(const mode of ['dock','messages'])for(const width of [360,1440])test(`${mode} shared chat fits ${width}px and preserves conversation/send/back controls`,async({page})=>{
 await mount(page,mode,width);
 if(mode==='dock')await page.getByRole('button',{name:'Messages, 2 unread',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Inbox',exact:true})).toBeVisible();
 await page.screenshot({path:test.info().outputPath(`${mode}-${width}-list.png`),fullPage:true});
 await page.getByRole('button',{name:/Ayesha Malik.*revised schedule/}).click();
 await expect(page.getByLabel('Write a message')).toBeVisible();
 await expect(page.getByText('Good morning! The revised schedule is ready for review.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const composer=page.getByLabel('Write a message'),send=page.getByRole('button',{name:'Send message',exact:true});
 await expect(send).toBeDisabled();
 const fieldBox=(await composer.boundingBox())!,sendBox=(await send.boundingBox())!;expect(sendBox.x).toBeGreaterThan(fieldBox.x+fieldBox.width-1);
 await composer.fill('Synthetic design review');
 let payload:unknown;await page.route('**/synthetic/chat-send',route=>{payload=route.request().postDataJSON();return route.fulfill({json:{success:true}})});
 await send.click();await expect(composer).toHaveValue('');expect(payload).toMatchObject({body:'Synthetic design review'});
 await page.screenshot({path:test.info().outputPath(`${mode}-${width}-thread.png`),fullPage:true});
 if(mode==='dock'||width===360){await page.getByRole('button',{name:'Back to conversations'}).click();await expect(page.getByRole('heading',{name:'Inbox'})).toBeVisible();}
 if(mode==='dock'){await page.getByRole('button',{name:'Close messages',exact:true}).click();await expect(page.getByRole('region',{name:'Messages',exact:true})).toHaveCount(0);}
});

test('shared chat launcher is circular with three animated gradient circles', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'no-preference' });
 await mount(page, 'dock', 1440);
 const launcher = page.getByRole('button', { name: 'Messages, 2 unread', exact: true });
 await expect(launcher).toBeVisible();
 const geometry = await launcher.evaluate(el => ({ radius: getComputedStyle(el).borderRadius, width: el.clientWidth, height: el.clientHeight }));
 expect(geometry.width).toBe(geometry.height); expect(parseFloat(geometry.radius)).toBeGreaterThanOrEqual(geometry.width / 2);
 const circles = launcher.locator('.chat-launcher-orb'); await expect(circles).toHaveCount(3);
 await expect(circles.first()).toHaveCSS('animation-name', 'chatLauncherOrbit');
 const rings = launcher.locator('.chat-launcher-ring'); await expect(rings).toHaveCount(2);
 await expect(rings.first()).toHaveCSS('animation-name', 'chatLauncherRipple');
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(rings.first()).toHaveCSS('animation-name', 'none');
 await expect(circles.first()).toHaveCSS('animation-name', 'none');
 await launcher.click(); await expect(page.getByRole('region', { name: 'Messages', exact: true })).toBeVisible();
});
