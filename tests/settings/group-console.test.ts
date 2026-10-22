import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// role-ux P4 acceptance (§11 P4): source contracts for the group console, the billing workspace and the
// institution panels that run without a browser or a database. Browser journeys live in *.browser.test.ts.
const root = new URL("../../", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const code = (path: string) => read(path).replace(/^\s*\/\/.*$/gm, "").replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx)$/.test(name)) yield path;
  }
}

test("the group console is a registry console with no header page actions (acceptance 1, H1)", () => {
  const page = code("src/app/super/page.tsx");
  assert.match(page, /console="super"/);
  assert.match(page, /useConsoleView\("super"\)/);
  assert.doesNotMatch(page, /headerActions=/, "no page actions in the header");
  assert.doesNotMatch(page, /navItems=|bottomItems=/, "navigation comes from the registry");
  for (const gone of ["FeesPanel", "FeeManagementPanel", "GuardianAccessManager", "AIReviewQueue", "StaffHierarchy"]) {
    assert.doesNotMatch(page, new RegExp(`\\b${gone}\\b`), `${gone} is not in the group console`);
  }
});

test("FeeManagementPanel is retired everywhere in src (acceptance 2, M1, F5)", () => {
  assert.equal(existsSync(join(root, "src/components/billing/FeeManagementPanel.tsx")), false);
  const users = [...walk(join(root, "src"))].filter((file) => readFileSync(file, "utf8").includes("FeeManagementPanel"));
  assert.deepEqual(users, []);
});

test("a campus drill-in lives in the URL and the detail is keyed on that campus (acceptance 3, M16, F6)", () => {
  const page = code("src/app/super/page.tsx");
  assert.match(page, /new URLSearchParams\(search\)\.get\("campus"\)/, "the campus comes from ?campus=");
  assert.match(page, /view: "campuses", campus: String\(campus\.id\)/, "opening a campus pushes ?view=campuses&campus=<id>");
  assert.match(page, /<FeeOverviewTab key=\{campus\.id\} campusId=\{campus\.id\}/, "fees remount per campus, so one campus's figures never show under another");
  assert.match(page, /data-tour="super\.campus\.leadership"/);
});

test("Billing & plan renders without waiting for the dashboard loader (acceptance 4, F3)", () => {
  const page = code("src/app/super/page.tsx");
  const billing = page.indexOf('if (view === "billing")');
  assert.ok(billing > 0);
  assert.match(page.slice(billing, billing + 120), /content = <SubscriptionWorkspace \/>/, "the billing view is not behind dataGate");
  assert.ok(page.indexOf("} else if (suspended) {") > billing, "every other view shows the paused notice while suspended");
});

test("a suspended school never opens the chat stream; the decision comes from the school's state, not the loader (F3, §3.2, audit P4-G6)", () => {
  const page = code("src/app/super/page.tsx");
  assert.match(page, /chatDock=\{!suspended\}/);
  assert.doesNotMatch(page, /chatDock=\{!loadError\}/, "a transient load failure must not drop the chat");
  const layout = code("src/app/super/layout.tsx");
  assert.match(layout, /assertSchoolOperational\(schoolId\)/, "the layout reads suspension on the server for the first paint");
  assert.match(layout, /initialSuspended=\{suspended\}/);
  const context = code("src/app/super/super-data-context.tsx");
  assert.match(context, /enabled: !initialSuspended/, "a paused school does not call the failing loader");
  assert.match(context, /response\.status === 402/, "a school paused mid-session is recognised by the proxy's 402");
  const notice = page.slice(page.indexOf("function SuspendedNotice"), page.indexOf("function Stat("));
  assert.match(notice, /access\.has\("billing"\)/, "the payer is sent to Billing & plan");
  assert.match(notice, /Your plan is paused\. \{0\} can renew it\./, "a non-payer is told who renews it (§2.1 note 2)");
  assert.match(notice, /Contact SkooleeAI support to restore billing access\./, "the no-payer copy (§1.5)");
});

test("support approvals pre-check two-step sign-in instead of offering decisions the server refuses (acceptance 5, F28)", () => {
  const panel = code("src/components/institution/support-approvals.tsx");
  assert.match(panel, /access\.has\("mfaVerified"\)/);
  assert.match(panel, /href="\/account\/security"/);
  assert.match(panel, /item\.status === "pending" && mfaReady/, "Approve/Decline only with two-step sign-in");
  const billing = code("src/components/billing/SubscriptionWorkspace.tsx");
  assert.match(billing, /mfaReady && !scheduled/, "cancel needs two-step sign-in");
  assert.match(billing, /href="\/account\/security"/);
});

test("the personal settings modal has no school-locale section (acceptance 7, M105, F22)", () => {
  const modal = code("src/components/settings/SettingsModal.tsx");
  assert.doesNotMatch(modal, /LocaleSettingsPanel/);
  assert.match(modal, /PersonalLanguageSetting/);
});

test("a campus without a campus admin is an attention item with both actions; the promotion is one PUT (acceptance 8, M117)", () => {
  const page = code("src/app/super/page.tsx");
  assert.match(page, /data-tour="super\.overview\.attention"/);
  assert.match(page, /t\("No campus admin at \{0\}", \[campus\.name\]\)/);
  assert.match(page, /label: t\("Appoint campus admin"\)/);
  assert.match(page, /t\("Make \{0\} the campus admin", \[/);
  const promote = page.slice(page.indexOf("function PromotePrincipalConfirm"), page.indexOf("const EMPTY_CAMPUS"));
  assert.equal((promote.match(/method: "PUT"/g) ?? []).length, 1, "exactly one membership change");
  assert.match(promote, /role: "CAMPUS_ADMIN"/);
  assert.match(promote, /<ConfirmAction/);
  assert.match(promote, /requireReason=/);
});

test("the purchase delegation is offered only for another group admin, and sent flag-only with the stored campus (G7b, M13, audit P4-G1)", () => {
  const panel = code("src/components/memberships/memberships-panel.tsx");
  assert.match(panel, /const flagOnly = Boolean\(editing && editing\.role === authorityRole\)/);
  assert.match(panel, /const offerPurchase = group && flagOnly && /, "only in a school group, only for a flag-only edit");
  assert.match(panel, /role: editing\.role, campusId: editing\.campusId, canPurchaseSubscription: group && draft\.purchase/,
    "the stored role and campus (null for a group admin) are sent as they are; P1 accepts null and matches the stored row");
  assert.match(panel, /canPurchaseSubscription: false, canManageMemberships: draft\.manage/, "an invitable role never gets the purchase flag");
});

test("delegation switches stay visible on their stored value, so an untick can be undone (audit P4-G8)", () => {
  const panel = code("src/components/memberships/memberships-panel.tsx");
  assert.match(panel, /const offerManage = mfaReady \|\| Boolean\(editing\?\.canManageMemberships\)/);
  assert.match(panel, /\(mfaReady \|\| Boolean\(editing\?\.canPurchaseSubscription\)\)/);
  assert.doesNotMatch(panel, /canTurnOn\(draft\./, "never decided on the draft");
});

test("revoke, role and delegation changes are confirmed with a typed reason that reaches the audit row (§8.1 R3, audit P4-G4)", () => {
  const panel = code("src/components/memberships/memberships-panel.tsx");
  const confirm = panel.slice(panel.indexOf("<ConfirmAction"));
  assert.match(confirm, /tone=\{revoking \? "danger" : "warning"\}/);
  assert.match(confirm, /requireReason=\{\{ label: t\("Why this change\?"\), minLength: 10/);
  assert.match(panel, /expectedVersion: editing\.accessVersion, reviewed: true, reason \}/, "the reason is sent with the change");
  assert.match(panel, /onClick=\{\(\) => setConfirming\(true\)\}/, "Save opens the confirmation; it never saves directly");
  for (const change of ["revoke", "restore", "role", "campus", "manage-on", "manage-off", "purchase-on", "purchase-off"]) assert.match(panel, new RegExp(`"${change}"`));
});

test("members copy and role names follow the kind of school (§1.5, §8.2, R-I11, audit P4-G7, P4-G9)", () => {
  const panel = code("src/components/memberships/memberships-panel.tsx");
  assert.match(panel, /roleLabelFor\(\{ role, institutionKind: kind \}, language\)/);
  assert.doesNotMatch(panel, /\broleLabel\(/, "never the legacy label (\"Super Admin\")");
  assert.match(panel, /Only the school admin can invite people or change access here\./, "a single school has a school admin");
  assert.doesNotMatch(panel, /const copy = \{/, "no private dictionary (R11): EN keys with AR/UR in p4-messages");
  const history = code("src/components/audit/audit-history-panel.tsx");
  assert.doesNotMatch(history, /auditHistoryCopy|ar: \{/, "the activity log has no private dictionary either");
});

test("exports belong to the PageHeader on People & access and Settings › Activity (§4.4, §4.4b, audit P4-G10, G11)", () => {
  const page = code("src/app/super/page.tsx");
  assert.match(page, /id: "export-members", label: "Export members"/);
  assert.match(page, /<MembershipsPanel exportRequest=\{exportRequest\} \/>/);
  assert.match(page, /<AuditHistoryPanel exportRequest=\{exportRequest\} \/>/);
  assert.match(page, /\{ id: "members", label: "Everyone" \}/, "the staff concept is never \"Members\" (§8.2); the tab id stays");
  assert.match(code("src/components/memberships/memberships-panel.tsx"), /exportRequest === undefined && data\.members\.length/, "the in-panel Export is only for hosts without a PageHeader secondary");
});

test("Group standards owns \"New template version\" and the panel drops its own hero (§4.4, §4.3, audit P4-G3)", () => {
  const page = code("src/app/super/page.tsx");
  assert.match(page, /label: "New template version"/);
  assert.match(page, /<AcademicModelPanel templatesOnly hideHeading requestCreate=\{createRequest\} \/>/);
});

test("the campus detail renders the name as data and archives from its footer (R7, §4.5.3, audit P4-G12)", () => {
  const page = code("src/app/super/page.tsx");
  const detail = page.slice(page.indexOf("function CampusDetail"), page.indexOf("// ─── Approvals"));
  assert.match(detail, /title=\{<bdi>\{campus\.name\}<\/bdi>\}/);
  const footer = detail.indexOf("<footer");
  assert.ok(footer > detail.indexOf("<FeeOverviewTab"), "Archive is the page's last block, after the fees");
  assert.match(detail.slice(footer), /Archive campus/);
});

test("a campus without a campus admin shows what waits there when the loader serves it (§2.6, M117, audit P4-G5)", () => {
  const page = code("src/app/super/page.tsx");
  assert.match(page, /const waiting: CampusWaiting \| undefined = campus\.waiting/);
  for (const label of ["Fee adjustments requested: {0}", "Applications awaiting a decision: {0}", "Leave requests pending: {0}"]) assert.ok(page.includes(label), label);
});

test("the group Overview leads with the AI Workflows flagship (addendum 2026-10-22)", () => {
  const page = code("src/app/super/page.tsx");
  assert.match(page, /tourAnchor="super\.today\.flagship-ai"/);
  assert.match(page, /const aiWorkflows = access\.has\("ai"\) && access\.has\("schoolAi"\)/);
  assert.match(page, /const setupFirst = aiWorkflows && data\.aiSetupPending === true/);
  assert.match(page, /primaryAction=\{setupFirst \? undefined : review\}/, "while the school is not set up, the card's setup questionnaire is THE primary action");
  assert.match(page, /action=\{\{ label: "Start the setup questionnaire", href: "\/ai\?workflow=schoolSetup" \}\}/);
  assert.match(page, /secondaryActions=\{setupFirst && review \? \[review\] : undefined\}/, "approvals stay one click away");
  assert.match(page, /href: "\/ai" \}/, "afterwards the card opens AI Workflows");
});

test("every console view sits in the shell's one page card, with the new skeletons (addendum 2026-10-22)", () => {
  assert.match(code("src/app/super/page.tsx"), /PAGE_CARD_BODY/);
  const owner = code("src/app/owner/page.tsx");
  assert.doesNotMatch(owner, /pageCardSurface/, "no card-in-card in the platform console");
  for (const file of ["src/components/owner/PilotEvidence.tsx", "src/components/owner/CapacityReport.tsx", "src/components/owner/SubscriptionRequestReview.tsx"]) {
    assert.match(code(file), /PAGE_CARD_BODY/, file);
    assert.doesNotMatch(code(file), /lg:p-8/, `${file} uses the shared body padding`);
  }
  assert.match(code("src/app/super/loading.tsx"), /<CommandCentreSkeleton/);
  assert.match(code("src/app/owner/loading.tsx"), /<PageSkeleton/);
});

test("the accountant keeps a currency review surface (§2.1 row 9, audit P4-G2)", () => {
  const panel = code("src/components/settings/LocaleSettingsPanel.tsx");
  const review = panel.slice(panel.indexOf("export function LocaleCurrencyReview"));
  assert.ok(review.length > 0);
  assert.match(review, /data\?\.role === "ACCOUNTANT"/);
  assert.match(review, /reviewLocaleCurrency\(deciding\.policy\.id, deciding\.approve\)/);
  assert.match(review, /<ConfirmAction/);
});

test("pilot evidence's primary is \"Add evidence\" in a dialog (§4.4b, F16, audit P4-G13)", () => {
  const pilots = code("src/components/owner/PilotEvidence.tsx");
  assert.match(pilots, /primaryAction=\{detail \? \{ id: "add-evidence", label: "Add evidence"/);
  assert.match(pilots, /<Modal title=\{ui\("Add evidence"\)\}/);
  assert.doesNotMatch(pilots, /window\.prompt/);
});

test("dates and numbers use the locale package, never browser defaults or the bare language (R7, audit P4-G14)", () => {
  for (const file of ["src/components/settings/InstitutionSettingsPanel.tsx", "src/components/audit/audit-history-panel.tsx", "src/components/settings/DataLifecyclePanel.tsx",
    "src/components/owner/provisioning-modals.tsx", "src/components/billing/SubscriptionWorkspace.tsx", "src/components/institution/support-approvals.tsx", "src/app/owner/page.tsx"]) {
    const source = code(file);
    assert.doesNotMatch(source, /\.toLocaleString\(|\.toLocaleDateString\(|\.toLocaleTimeString\(/, `${file}: no browser-default formatting`);
    assert.doesNotMatch(source, /new Intl\.(DateTimeFormat|NumberFormat)\((language|undefined)\b/, `${file}: the locale tag, not the bare language`);
    assert.doesNotMatch(source, /formatSupportInstant/, `${file}: not the browser-locale support formatter`);
  }
});

test("a standalone school's plan grid never sells multi-campus plans (§2.1 note 3)", () => {
  const billing = code("src/components/billing/SubscriptionWorkspace.tsx");
  assert.match(billing, /const needsGroup = standaloneOwner && \(plan\.maxCampuses < 0 \|\| plan\.maxCampuses > 1\)/);
  assert.match(billing, /Needs a school group — contact SkooleeAI support/);
});

test("/memberships and /super/billing are server redirects (§6.3)", () => {
  const memberships = code("src/app/memberships/page.tsx");
  assert.match(memberships, /redirect\(membershipsTarget\(user\)\)/);
  assert.doesNotMatch(memberships, /"use client"/);
  const billing = code("src/app/super/billing/page.tsx");
  assert.match(billing, /redirect\(`\/super\?\$\{target\.toString\(\)\}`\)/);
  assert.doesNotMatch(billing, /"use client"/);
});

test("settings forms take the console's sticky per-tab Save; the group Settings form tabs use it (§4.4, §4.4b)", () => {
  // Shared settings-save contract: hideSave + command { id: "save", nonce } (once per command) + onDirtyChange.
  for (const file of [
    "src/components/settings/InstitutionSettingsPanel.tsx",
    "src/components/settings/LocaleSettingsPanel.tsx",
    "src/components/integrations/integrations.tsx",
    "src/components/settings/DataLifecyclePanel.tsx",
  ]) {
    const source = code(file);
    assert.match(source, /hideSave\?: boolean/, `${file}: hideSave`);
    assert.match(source, /command\?: \{ id: string; nonce: number \} \| null/, `${file}: command`);
    assert.match(source, /onDirtyChange\?: \(dirty: boolean, saving: boolean\) => void/, `${file}: onDirtyChange`);
    assert.match(source, /usePanelCommand\(command, \{/, `${file}: each command runs once`);
  }
  // A console Save never applies a language change the viewer has not previewed.
  assert.match(code("src/components/settings/LocaleSettingsPanel.tsx"), /if \(preview\) void applyChange\(preview\.token\);\s*else if \(dirty\) void previewChange\(true\);/);
  const page = code("src/app/super/page.tsx");
  assert.match(page, /<LocaleSettingsPanel scope="school" hideSave command=\{command\} onDirtyChange=\{reportSave\} \/>/);
  assert.match(page, /<DataLifecyclePanel userId=\{userId\} hideSave command=\{command\} onDirtyChange=\{reportSave\} \/>/);
  assert.match(page, /<StickySaveBar/);
  assert.match(page, /const command = saveCommand\?\.tab === active \? saveCommand : null;/, "a Save belongs to the tab that sent it");
});

test("network enrolment months follow the app language (R7, P9-12)", () => {
  assert.match(code("src/components/insights/NetworkOverview.tsx"), /enrolmentTrend\(students, 12, tag\)/);
});
