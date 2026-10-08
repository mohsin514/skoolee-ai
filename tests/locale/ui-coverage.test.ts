import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { arabicUi, urduUi } from "../../src/lib/locale/ui-messages";
import { arabicWorkflowUi, urduWorkflowUi } from "../../src/lib/locale/workflow-ui-messages";
const files = ["src/app/student/fees/page.tsx", "src/app/parent/fees/page.tsx", ...readdirSync("src/components/fees").filter((file)=>file.endsWith("Tab.tsx")).map((file)=>`src/components/fees/${file}`), "src/components/academic/AcademicCalendar.tsx", "src/components/academic/ReportCardPipeline.tsx", "src/components/academic/exams/ReportCardsPanel.tsx", "src/components/settings/InstitutionSettingsPanel.tsx", "src/components/role-dashboard/RoleHeader.tsx", "src/components/role-dashboard/RoleSidebar.tsx"];
test("every explicit interface copy key has nonempty Arabic and Urdu translations",()=>{
 assert.deepEqual(Object.keys(arabicUi).sort(),Object.keys(urduUi).sort());
 assert.deepEqual(Object.keys(arabicWorkflowUi).sort(),Object.keys(urduWorkflowUi).sort());
 const keys = new Set<string>();
 for (const file of files) {
  const ast=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node: ts.Node) {
   if(ts.isCallExpression(node)&&["t","tr"].includes(node.expression.getText(ast))&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))keys.add(node.arguments[0].text);
   if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==="UiText")for(const child of node.children){if(ts.isJsxExpression(child)&&child.expression&&ts.isStringLiteral(child.expression))keys.add(child.expression.text);if(ts.isJsxText(child)&&child.text.trim())keys.add(child.text.trim());}
   ts.forEachChild(node,visit);
  } visit(ast);
 }
 const missing: string[]=[];
 for(const [language,catalog] of [["ar",{...arabicWorkflowUi,...arabicUi}],["ur",{...urduWorkflowUi,...urduUi}]] as const)for(const key of keys)if(!catalog[key])missing.push(`${language}: ${key}`);
 assert.deepEqual(missing,[]);assert.ok(keys.size>500);
});
