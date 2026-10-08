import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from 'playwright';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
const fixture=JSON.parse(await readFile(join(tmpdir(), 'sko213-fixture.json'),'utf8'));
const base='http://127.0.0.1:3213',out='docs/qa/evidence/sko-213';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const evidence=[];
for(const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]){
 for(const language of ['en','ar','ur']){
  for(const role of ['PRINCIPAL','ACCOUNTANT']){
   const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.context().addCookies([{name:'skoolee_token',value:fixture.cookies[role].split('=')[1],url:base}]);
   await page.goto(`${base}/corrections`);await page.getByLabel('Language',{exact:true}).selectOption(language);
   await page.waitForFunction(()=>document.querySelector('section select')?.options.length>1);
   await page.locator('section select').first().selectOption({index:1});
   if(role==='PRINCIPAL')await page.locator('input[type=number]').fill('77');
   else await page.locator('input[inputmode=decimal]').first().fill('1.001');
   await page.locator('textarea').nth(0).fill('Synthetic correction reason');await page.locator('textarea').nth(1).fill('Public synthetic correction');await page.locator('textarea').nth(2).fill('PRIVATE BROWSER NOTE');
   // KWD is not necessarily first. Two decimal currencies must use 1.00.
   if(role==='ACCOUNTANT')await page.locator('input[inputmode=decimal]').first().fill('1.00');
   await page.getByRole('button',{name:/^(Review correction|مراجعة التصحيح|تصحیح کا جائزہ)$/}).click();
   const checkbox=page.getByRole('checkbox',{name:/I reviewed the original|راجعت القيم الأصلية|میں نے اصل/});await checkbox.waitFor();await checkbox.focus();await page.keyboard.press('Space');if(!await checkbox.isChecked())throw new Error('Keyboard review failed');
   await page.getByRole('button',{name:/^(Save draft|حفظ المسودة|مسودہ محفوظ کریں)$/}).click();await page.reload();await page.waitForFunction(()=>document.querySelector('textarea')?.value==='Synthetic correction reason');
   await page.getByLabel('Language',{exact:true}).selectOption(language);
   const overflow=await page.locator('main').evaluate(e=>e.scrollWidth>e.clientWidth+2);if(overflow)throw new Error(`${role}/${name}/${language} overflow`);
   await page.screenshot({path:`${out}/${role.toLowerCase()}-${name}-${language}.png`,fullPage:true});
   if(errors.length)throw new Error(errors.join('; '));
   evidence.push({role,viewport:name,language,overflow:false,keyboardReview:true,draftRecovered:true,errors});await page.close();
  }
 }
}
for(const role of Object.keys(fixture.cookies)){
 for(const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}});await page.context().addCookies([{name:'skoolee_token',value:fixture.cookies[role].split('=')[1],url:base}]);const r=await page.goto(`${base}/corrections`);await page.waitForTimeout(350);
  const body=await page.locator('body').innerText();if(r.status()>=500||body.includes('Application error:'))throw new Error(`${role} failed`);
  if(['PARENT','STUDENT'].includes(role)){if(body.includes('PRIVATE'))throw new Error('Private history leaked');await page.getByRole('button',{name:'Payments',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('ol li').length>=5);if((await page.locator('body').innerText()).includes('PRIVATE'))throw new Error('Private finance note leaked');if(name==='mobile')await page.screenshot({path:`${out}/${role.toLowerCase()}-history-mobile.png`,fullPage:true});}
  evidence.push({role,viewport:name,status:r.status(),noPrivateLeak:['PARENT','STUDENT'].includes(role)?true:undefined});await page.close();
 }
}
await browser.close();await writeFile(`${out}/browser.json`,JSON.stringify(evidence,null,2));console.log(`Verified ${evidence.length} browser cases`);
