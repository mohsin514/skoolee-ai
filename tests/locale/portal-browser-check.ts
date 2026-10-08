import { chromium } from "playwright";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { defaultLocale, formatMoney } from "../../src/lib/locale/package";
import { translateUi } from "../../src/lib/locale/ui-messages";
async function main(){
 if(!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201"))throw new Error("Local database required");
 const db=new PrismaClient(),browser=await chromium.launch();
 try {
 for(const role of ["STUDENT","PARENT"]){
  for(const language of ["en","ar","ur"] as const){
   await db.user.update({where:{id:`locale-${role}`},data:{preferredLanguage:language}});
   const token=await new SignJWT({userId:`locale-${role}`,schoolId:"locale-fixture",campusId:"locale-campus-a",role,accessVersion:0,schoolStatus:"ACTIVE",onboardingComplete:true}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
   const context=await browser.newContext();await context.addCookies([{name:"skoolee_token",value:token,url:"http://localhost:3201"}]);const page=await context.newPage();
   await page.goto(`http://localhost:3201/${role.toLowerCase()}/fees`,{waitUntil:"networkidle",timeout:120000});
   await page.waitForFunction(lang=>document.documentElement.lang===lang,language);
   const select=page.getByLabel(translateUi("Currency",language),{exact:true});await select.waitFor();
   for(const [currency,minor] of [["PKR",123456],["KWD",1234567],["AED",34567]] as const){
    await select.selectOption(currency);
    await page.getByText(`LOCAL-${currency}`,{exact:false}).first().waitFor();
    for(const other of ["PKR","KWD","AED"].filter(value=>value!==currency))assert.equal(await page.getByText(`LOCAL-${other}`,{exact:false}).count(),0);
    const text=await page.locator("body").innerText();const expected=formatMoney({currency,minor},{...defaultLocale,language});assert.ok(text.includes(expected),`${role}/${language}/${currency}: missing ${expected}`);
    if(currency!=="PKR")assert.equal(await page.getByRole("button",{name:/SafePay|Pay Now/}).count(),0);
    for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${role}/${language}/${currency}/${width} overflow`);await page.screenshot({path:`/tmp/sko201-evidence/portal-${role}-${language}-${currency}-${width}.png`,fullPage:true});}
   }
   console.log(`${role}/${language}: immutable PKR2/KWD3/AED2 amounts, partitioned totals, three widths pass`);await context.close();
  }
 }
 } finally {await browser.close();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
