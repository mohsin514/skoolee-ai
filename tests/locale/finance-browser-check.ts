import {chromium} from "playwright";
import {SignJWT} from "jose";
import {PrismaClient} from "@prisma/client";
import assert from "node:assert/strict";
import {translateUi} from "../../src/lib/locale/ui-messages";
async function main(){
 if(!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201"))throw new Error("Local database required");const db=new PrismaClient(),browser=await chromium.launch();const missing=new Set<string>();
 try{for(const language of (["en","ar","ur"] as const).filter(language => !process.env.LOCALE_TEST_LANGUAGE || language === process.env.LOCALE_TEST_LANGUAGE)){
 await db.user.update({where:{id:"locale-ACCOUNTANT"},data:{preferredLanguage:language}});
 const token=await new SignJWT({userId:"locale-ACCOUNTANT",schoolId:"locale-fixture",campusId:"locale-campus-a",role:"ACCOUNTANT",accessVersion:0,schoolStatus:"ACTIVE",onboardingComplete:true}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:"skoolee_token",value:token,url:"http://localhost:3201"}]);const page=await context.newPage();page.on("console",message=>{if(message.text().includes("[locale:missing]"))missing.add(message.text())});
 await page.goto("http://localhost:3201/accountant",{waitUntil:"networkidle",timeout:120000});await page.waitForFunction(lang=>document.documentElement.lang===lang,language);
 for(const name of ["Structures","Fee Layers","Invoices","Payments","Reports","Accounts"]){
 await page.setViewportSize({width:1440,height:1000});const button=page.getByRole("button",{name:translateUi(name,language),exact:true});await button.first().click();await page.waitForTimeout(500);
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(350);if(width===390)assert.ok((await page.locator("#workspace-content").boundingBox())!.width >= 380, `${language}/${name}: narrow mobile main`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${language}/${name}/${width} overflow`);await page.screenshot({path:`/tmp/sko201-evidence/finance-${language}-${name.replaceAll(' ','-')}-${width}.png`,fullPage:true});}
 }
 await page.setViewportSize({width:1440,height:1000});await page.getByRole("button",{name:translateUi("Payments",language),exact:true}).first().click();await page.getByRole("button",{name:translateUi("Bank Import",language),exact:true}).click();
 const dialog=page.getByRole("dialog").last();await dialog.getByRole("button",{name:/date|اختر|منتخب/}).first().click();
 const calendar=page.getByRole("dialog").last();await calendar.locator("button[data-date]").filter({hasNot:page.locator(":disabled")}).first().focus();await page.keyboard.press("ArrowRight");await page.keyboard.press("Enter");
 await page.setViewportSize({width:780,height:1000});await page.evaluate(()=>document.documentElement.style.zoom="2");assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${language} 200% dialog overflow`);for (const dateButton of await dialog.locator("[data-date-field]").all()) assert.ok((await dateButton.boundingBox())!.width > 400, "Zoomed date control must fit its full date");await page.screenshot({path:`/tmp/sko201-evidence/bank-calendar-${language}-200.png`,fullPage:true});await page.evaluate(()=>document.documentElement.style.zoom="1");await page.keyboard.press("Escape");
 console.log(`${language}: six finance screens, three widths and keyboard date selection at 200% pass`);await context.close();
 }console.log("Missing keys",JSON.stringify([...missing]));assert.equal(missing.size,0);}finally{await browser.close();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
