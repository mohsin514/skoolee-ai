import { chromium } from "playwright";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { ROLE_DASHBOARD_PATHS, USER_ROLES } from "../../src/lib/roles";
import { translateUi } from "../../src/lib/locale/ui-messages";
async function main(){
 if(!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201"))throw new Error("Local database required");
 const db=new PrismaClient(),browser=await chromium.launch();const missing=new Set<string>();
 try{
 for(const role of USER_ROLES){
  await db.user.update({where:{id:`locale-${role}`},data:{preferredLanguage:"ur"}});
  const token=await new SignJWT({userId:`locale-${role}`,schoolId:"locale-fixture",campusId:["APP_OWNER","SUPER_ADMIN"].includes(role)?null:"locale-campus-a",role,accessVersion:0,schoolStatus:"ACTIVE",onboardingComplete:true}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
  const context=await browser.newContext();await context.addCookies([{name:"skoolee_token",value:token,url:"http://localhost:3201"}]);const page=await context.newPage();
  page.on("console",msg=>{if(msg.text().includes("[locale:missing]"))missing.add(msg.text());});
  await page.goto(`http://localhost:3201${ROLE_DASHBOARD_PATHS[role]}`,{waitUntil:"networkidle",timeout:120000});
  await page.waitForFunction(()=>document.documentElement.lang==="ur",{timeout:30000});
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${role}/${width} overflow`);await page.screenshot({path:`/tmp/sko201-evidence/dashboard-${role}-ur-${width}.png`,fullPage:true});}
  const menu=page.getByRole("button",{name:translateUi("Account menu","ur"),exact:true});
  if(await menu.count()){
   await menu.click();const password=page.getByText(translateUi("Change Password","ur"),{exact:true});if(await password.count()){await password.first().click();await page.getByRole("button",{name:translateUi("Update Password","ur"),exact:true}).click();await page.getByText(translateUi("Current password is required","ur"),{exact:true}).waitFor();await page.screenshot({path:`/tmp/sko201-evidence/password-${role}-ur.png`,fullPage:true});await page.keyboard.press("Escape");}
  }
  console.log(`${role}: Urdu dashboard three sizes + available account/password UI pass`);await context.close();
 }
 console.log("Missing explicit translation keys:",JSON.stringify([...missing]));assert.equal(missing.size,0);
 }finally{await browser.close();await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
