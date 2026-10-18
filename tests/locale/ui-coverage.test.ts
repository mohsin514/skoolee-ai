import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { arabicUi, urduUi } from "../../src/lib/locale/ui-messages";
import { arabicWorkflowUi, urduWorkflowUi } from "../../src/lib/locale/workflow-ui-messages";
const files = ["src/components/academic-year/CycleBadge.tsx", "src/app/student/attendance/page.tsx", "src/app/parent/attendance/page.tsx", "src/components/insights/FinanceOverview.tsx", "src/lib/locale/invoice-pdf.tsx", "src/lib/pdf.tsx", "src/app/student/fees/page.tsx", "src/app/parent/fees/page.tsx", ...readdirSync("src/components/fees").filter((file)=>file.endsWith("Tab.tsx")).map((file)=>`src/components/fees/${file}`), "src/components/academic/AcademicCalendar.tsx", "src/components/academic/ReportCardPipeline.tsx", "src/components/academic/exams/ReportCardsPanel.tsx", "src/components/settings/InstitutionSettingsPanel.tsx", "src/components/role-dashboard/RoleHeader.tsx", "src/components/role-dashboard/RoleSidebar.tsx", "src/components/settings/PersonalLanguageSetting.tsx", "src/app/dashboard/settings/page.tsx", "src/components/settings/SettingsModal.tsx", "src/components/settings/ProfileSettingsSection.tsx", "src/components/settings/ChangePasswordDialog.tsx", "src/components/account-security/SecuritySettingsPanel.tsx", "src/components/operations/dormitory-allocations.tsx", "src/components/operations/visitor-register.tsx", "src/components/operations/complaints-desk.tsx", "src/components/operations/phone-call-log.tsx", "src/components/operations/postal-register.tsx", "src/components/operations/certificates-desk.tsx", "src/components/admissions/admissions-desk.tsx", "src/components/search/search-workspace.tsx", "src/app/(auth)/apply/[token]/page.tsx", "src/components/notifications/notification-center.tsx", "src/components/principal/action-queue.tsx", "src/components/staff/workload-cover.tsx", "src/components/academic/rollover-review.tsx", "src/components/billing/SubscriptionLifecyclePanel.tsx", "src/app/subscription-suspended/page.tsx", "src/app/subscription/subscription-header.tsx", "src/components/academic/exams/DatesheetPublication.tsx", "src/components/academic-year/TeacherPerformancePanel.tsx", "src/components/school-ai/lesson-plan-actions.tsx", "src/components/attendance/class-register.tsx", "src/components/timetable/PublicationReview.tsx", "src/components/student/student-today.tsx", "src/components/parent/family-inbox.tsx", "src/components/family/family-requests.tsx", "src/components/family/staff-requests.tsx", "src/components/family/family-digest.tsx", "src/app/teacher/attendance/page.tsx", ...["composer", "message-thread", "conversation-list", "chat-workspace", "chat-dock", "new-conversation-dialog", "chat-settings-dialog"].map((name)=>`src/components/chat/${name}.tsx`)];
test("every explicit interface copy key has nonempty Arabic and Urdu translations",()=>{
 assert.deepEqual(Object.keys(arabicUi).sort(),Object.keys(urduUi).sort());
 assert.deepEqual(Object.keys(arabicWorkflowUi).sort(),Object.keys(urduWorkflowUi).sort());
 const keys = new Set<string>();
 for (const file of files) {
  const ast=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node: ts.Node) {
   if(ts.isCallExpression(node)&&["t","tr","ui"].includes(node.expression.getText(ast))&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))keys.add(node.arguments[0].text);
   if(ts.isCallExpression(node)&&["t","tr","ui"].includes(node.expression.getText(ast))&&node.arguments[0]){const collect=(child: ts.Node)=>{if(ts.isStringLiteral(child)&&/[A-Za-z]/.test(child.text))keys.add(child.text);ts.forEachChild(child,collect)};collect(node.arguments[0]);}
   if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==="UiText")for(const child of node.children){if(ts.isJsxExpression(child)&&child.expression&&ts.isStringLiteral(child.expression))keys.add(child.expression.text);if(ts.isJsxText(child)&&child.text.trim())keys.add(child.text.trim());}
   ts.forEachChild(node,visit);
  } visit(ast);
 }
 const missing: string[]=[];
 for(const [language,catalog] of [["ar",{...arabicWorkflowUi,...arabicUi}],["ur",{...urduWorkflowUi,...urduUi}]] as const)for(const key of keys)if(!catalog[key])missing.push(`${language}: ${key}`);
 assert.deepEqual(missing,[]);assert.ok(keys.size>500);
 for(const [source, translated] of [...Object.entries(arabicWorkflowUi),...Object.entries(urduWorkflowUi)]) assert.deepEqual(translated.match(/\{\d+\}/g)?.sort() ?? [], source.match(/\{\d+\}/g)?.sort() ?? [], source);
});
