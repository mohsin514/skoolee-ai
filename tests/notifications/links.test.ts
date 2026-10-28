// P9 acceptance (§11 P9 items 4 and 7; G41, G41b, §2.6, R-I2, R-B2, R-B3, R-B4).
// Pure: notification links are resolved without a database, and recipients are resolved through an injected
// RecipientDirectory, so this runs with `node --import tsx --test tests/notifications/links.test.ts`.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFICATION_FIXED_MESSAGE_KINDS,
  NOTIFICATION_FIXED_TITLE_KINDS,
  NOTIFICATION_KIND_INTENT,
  NOTIFICATION_NOTICE_ONLY_KINDS,
  canOpenHref,
  notificationHref,
  type NotificationViewer,
} from "@/lib/notifications/links";
import {
  NOTIFICATION_EVENTS,
  dateText,
  moneyText,
  notifyCorrectionRequested,
  notifySelfApproval,
  useRecipientDirectory,
  type NotificationEventPayload,
  type RecipientDirectory,
} from "@/lib/notifications/events";
import { ROLE_NAV, consoleForRole, consoleViews } from "@/lib/navigation/role-nav";
import { USER_ROLES, canAccessRoleDashboard, roleGuardRedirect, type UserRole } from "@/lib/roles";
import { translateUi } from "@/lib/locale/ui-messages";
import { defaultLocale, formatMoney } from "@/lib/locale/package";

// ─── Links ──────────────────────────────────────────────────────────────────

// ADMIN also appears without a kind (RoleHeader passes `session?.institution?.kind`, which can be undefined) and
// with only the owner flag: an unknown kind fails closed (C32, P9-10).
const VIEWERS: NotificationViewer[] = USER_ROLES.flatMap((role): NotificationViewer[] =>
  role === "ADMIN"
    ? [{ role, institutionKind: "GROUP" }, { role, institutionKind: "STANDALONE" }, { role }, { role, isInstitutionOwner: true }]
    : role === "CAMPUS_ADMIN"
      ? [{ role, institutionKind: "GROUP" }, { role, institutionKind: "STANDALONE" }]
      : role === "SUPER_ADMIN" ? [{ role, institutionKind: "GROUP" }] : [{ role }],
);
const KINDS = [...new Set([...Object.keys(NOTIFICATION_EVENTS), ...Object.keys(NOTIFICATION_KIND_INTENT)])];

/** Independent of canOpenHref: the proxy role guard, the console check, and a live registry view of the reader's own console. */
function assertOpens(role: UserRole, href: string, label: string) {
  assert.ok(href.startsWith("/") && !href.startsWith("//"), `${label}: ${href} is an in-app path`);
  const url = new URL(href, "https://skoolee.invalid");
  assert.equal(roleGuardRedirect(role, url.pathname), null, `${label}: the role guard lets ${role} open ${href}`);
  assert.ok(canAccessRoleDashboard(role, url.pathname), `${label}: ${role} may open ${url.pathname}`);
  assert.ok(!url.pathname.startsWith("/dashboard"), `${label}: never a legacy /dashboard page (${href})`);
  const nav = ROLE_NAV[consoleForRole(role)];
  if (nav.mode === "view" && url.pathname === nav.base) {
    const view = url.searchParams.get("view");
    if (view) {
      assert.ok(consoleViews(nav.id).includes(view), `${label}: ${view} is a registry view of ${nav.id}`);
      assert.ok(!(view in nav.retired), `${label}: ${view} is not retired in ${nav.id}`);
    }
  }
}

test("every notification kind the product emits has an intent", () => {
  for (const kind of Object.keys(NOTIFICATION_EVENTS)) assert.ok(NOTIFICATION_KIND_INTENT[kind], `${kind} has an intent in links.ts`);
});

test("for every kind × reader, notificationHref returns a route that reader can open", () => {
  const ctx = { studentId: "stu-1", examId: "exam-1", campusId: "campus-1", sourceType: "campus", sourceId: "campus-1", approvalKind: "finance" };
  for (const kind of KINDS) {
    const stored = NOTIFICATION_EVENTS[kind]?.link ?? "/admin?view=fees";
    for (const viewer of VIEWERS) {
      const label = `${kind} → ${viewer.role}${viewer.institutionKind ? `/${viewer.institutionKind}` : ""}`;
      const href = notificationHref(viewer, kind, { ...ctx, link: stored });
      assertOpens(viewer.role, href, label);
      assert.ok(canOpenHref(viewer.role, href), label);
    }
  }
});

test("an unknown kind keeps its stored link only when the reader can open it", () => {
  assert.equal(notificationHref({ role: "TEACHER" }, "SOMETHING_NEW", { link: "/teacher/marks" }), "/teacher/marks");
  assert.equal(notificationHref({ role: "TEACHER" }, "SOMETHING_NEW", { link: "/admin?view=fees" }), "/teacher");
  assert.equal(notificationHref({ role: "PARENT" }, "SOMETHING_NEW", { link: "https://evil.example/x" }), "/parent");
  assert.equal(notificationHref({ role: "PRINCIPAL" }, "SOMETHING_NEW", { link: "/principal?view=fees" }), "/principal", "a retired view lands home");
});

test("the 32 static /admin links resolve to each reader's own console (G41b)", () => {
  assert.equal(notificationHref({ role: "TEACHER" }, "MARKS_REJECTED", {}), "/teacher/marks");
  assert.equal(notificationHref({ role: "PRINCIPAL" }, "MARKS_REJECTED", {}), "/principal?view=exam-cycles");
  assert.equal(notificationHref({ role: "TEACHER" }, "LEAVE_REVIEWED", {}), "/teacher/leave");
  assert.equal(notificationHref({ role: "ACCOUNTANT" }, "LEAVE_REVIEWED", {}), "/accountant?view=my-leave");
  assert.equal(notificationHref({ role: "PRINCIPAL" }, "LEAVE_REVIEWED", {}), "/principal?view=my-leave");
  assert.equal(notificationHref({ role: "CAMPUS_ADMIN", institutionKind: "GROUP" }, "CERTIFICATE_APPROVAL_NEEDED", {}), "/admin?view=front-desk&tab=certificates");
  assert.equal(notificationHref({ role: "RECEPTIONIST" }, "CERTIFICATE_APPROVAL_NEEDED", {}), "/receptionist?view=certificates");
  assert.equal(notificationHref({ role: "RECEPTIONIST" }, "PHONE_CALLBACK_ASSIGNED", {}), "/receptionist?view=phone-calls");
  assert.equal(notificationHref({ role: "RECEPTIONIST" }, "POSTAL_ASSIGNED", {}), "/receptionist?view=postal");
  assert.equal(notificationHref({ role: "ADMIN", institutionKind: "STANDALONE" }, "PICKUP_EXCEPTION_REQUESTED", {}), "/admin?view=pickup");
  assert.equal(notificationHref({ role: "PRINCIPAL" }, "STUDENT_ADMITTED", { studentId: "s1" }), "/principal?view=students&student=s1");
  assert.equal(notificationHref({ role: "ACCOUNTANT" }, "PAYMENT_RECORDED", {}), "/accountant?view=payments");
  assert.equal(notificationHref({ role: "PRINCIPAL" }, "REPORT_CARDS_GENERATED", { examId: "e 1" }), "/principal?view=report-cards&exam=e+1");
  assert.equal(notificationHref({ role: "PARENT" }, "REPORT_CARDS_PUBLISHED", {}), "/parent/results");
  // The group admin is not campus staff: campus events have no screen in /super and land on Overview.
  assert.equal(notificationHref({ role: "SUPER_ADMIN", institutionKind: "GROUP" }, "CLASS_CREATED", {}), "/super");
});

test("subscription notices link payers to /billing; nobody else is sent to a billing screen", () => {
  for (const kind of ["SUBSCRIPTION_EXPIRING", "SUBSCRIPTION_SUSPENDED"]) {
    assert.equal(NOTIFICATION_EVENTS[kind]!.link, "/billing");
    assert.equal(notificationHref({ role: "SUPER_ADMIN", institutionKind: "GROUP" }, kind, {}), "/billing");
    assert.equal(notificationHref({ role: "ADMIN", institutionKind: "STANDALONE" }, kind, {}), "/billing");
    assert.equal(notificationHref({ role: "ADMIN", institutionKind: "GROUP" }, kind, {}), "/admin", "an ADMIN inside a group is a campus operator");
    assert.equal(notificationHref({ role: "CAMPUS_ADMIN", institutionKind: "STANDALONE" }, kind, {}), "/admin");
    // Unknown kind fails closed: no billing link for an ADMIN the server cannot place (C32, P9-10).
    assert.equal(notificationHref({ role: "ADMIN" }, kind, {}), "/admin");
    assert.equal(notificationHref({ role: "ADMIN", isInstitutionOwner: true }, kind, {}), "/billing", "the owner flag stands in for the kind");
  }
  assert.equal(notificationHref({ role: "ADMIN" }, "support_access_request", {}), "/admin");
  assert.equal(notificationHref({ role: "ADMIN" }, "SELF_APPROVED", { approvalKind: "tax" }), "/admin");
  assert.equal(notificationHref({ role: "CAMPUS_ADMIN", institutionKind: "GROUP" }, "SUBSCRIPTION_PAUSED_NOTICE", {}), "/admin");
  assert.ok(NOTIFICATION_NOTICE_ONLY_KINDS.has("SUBSCRIPTION_PAUSED_NOTICE"));
  assert.equal(NOTIFICATION_EVENTS.SUBSCRIPTION_PAUSED_NOTICE!.link, undefined, "the paused notice carries no link");
});

test("revision-2 kinds open the right screen for their reader", () => {
  assert.equal(notificationHref({ role: "SUPER_ADMIN", institutionKind: "GROUP" }, "CAMPUS_OPS_VACANT", { sourceType: "campus", sourceId: "c-9" }), "/super?view=campuses&campus=c-9");
  assert.equal(notificationHref({ role: "CAMPUS_ADMIN", institutionKind: "GROUP" }, "CORRECTION_REQUESTED", { link: "/corrections", kind: "PAYMENT" }), "/corrections?kind=PAYMENT");
  assert.equal(notificationHref({ role: "PRINCIPAL" }, "CORRECTION_REQUESTED", { kind: "MARK" }), "/corrections?kind=MARK");
  assert.equal(notificationHref({ role: "SUPER_ADMIN", institutionKind: "GROUP" }, "SELF_APPROVED", { approvalKind: "tax" }), "/super?view=approvals&tab=tax");
  assert.equal(notificationHref({ role: "SUPER_ADMIN", institutionKind: "GROUP" }, "SELF_APPROVED", { approvalKind: "policy" }), "/super?view=standards&tab=policies");
  assert.equal(notificationHref({ role: "ADMIN", institutionKind: "STANDALONE" }, "SELF_APPROVED", { approvalKind: "finance" }), "/admin?view=fees");
  assert.equal(notificationHref({ role: "CAMPUS_ADMIN", institutionKind: "GROUP" }, "SELF_APPROVED", { approvalKind: "tax" }), "/admin", "a campus admin has no Approvals view");
  assert.equal(notificationHref({ role: "SUPER_ADMIN", institutionKind: "GROUP" }, "support_access_request", {}), "/super?view=approvals&tab=support");
  assert.equal(notificationHref({ role: "ADMIN", institutionKind: "STANDALONE" }, "support_access_request", {}), "/admin?view=approvals&tab=support");
  assert.equal(notificationHref({ role: "CAMPUS_ADMIN", institutionKind: "GROUP" }, "support_access_request", {}), "/admin");
});

test("a tax sign-off request opens the authority's Approvals → Tax, and nobody else's (§4.4b, C3)", () => {
  const ctx = { link: NOTIFICATION_EVENTS.TAX_SIGNOFF_REQUESTED!.link, sourceType: "tax-activation", sourceId: "tax-1" };
  assert.equal(NOTIFICATION_KIND_INTENT.TAX_SIGNOFF_REQUESTED, "tax-signoff");
  assert.equal(NOTIFICATION_EVENTS.TAX_SIGNOFF_REQUESTED!.category, "ACTION");
  assert.deepEqual(NOTIFICATION_EVENTS.TAX_SIGNOFF_REQUESTED!.source?.({ activationId: "tax-1" }), { type: "tax-activation", id: "tax-1" });
  assert.equal(notificationHref({ role: "SUPER_ADMIN", institutionKind: "GROUP" }, "TAX_SIGNOFF_REQUESTED", ctx), "/super?view=approvals&tab=tax");
  assert.equal(notificationHref({ role: "ADMIN", institutionKind: "STANDALONE" }, "TAX_SIGNOFF_REQUESTED", ctx), "/admin?view=approvals&tab=tax");
  assert.equal(notificationHref({ role: "ADMIN", isInstitutionOwner: true }, "TAX_SIGNOFF_REQUESTED", ctx), "/admin?view=approvals&tab=tax");
  assert.equal(notificationHref({ role: "ADMIN" }, "TAX_SIGNOFF_REQUESTED", ctx), "/admin", "an ADMIN of unknown kind fails closed");
  assert.equal(notificationHref({ role: "ADMIN", institutionKind: "GROUP" }, "TAX_SIGNOFF_REQUESTED", ctx), "/admin");
  assert.equal(notificationHref({ role: "CAMPUS_ADMIN", institutionKind: "STANDALONE" }, "TAX_SIGNOFF_REQUESTED", ctx), "/admin");
  assert.equal(notificationHref({ role: "ACCOUNTANT" }, "TAX_SIGNOFF_REQUESTED", ctx), "/accountant");
});

test("fixed-copy kinds really are fixed sentences, and each has Arabic and Urdu", () => {
  const probe = (values: Record<string, unknown>) => new Proxy(values, { get: (target, key) => (key in target ? target[key as string] : `«${String(key)}»`) });
  const probes = [
    probe({ status: "APPROVED", correctionKind: "MARK", first: true, count: 3 }),
    probe({ status: "DECLINED", correctionKind: "PAYMENT", first: false, count: 1 }),
    probe({ status: "REJECTED", correctionKind: "PAYMENT", first: false, count: 2 }),
  ];
  const missing: string[] = [];
  const check = (text: string, label: string) => {
    for (const language of ["ar", "ur"] as const) if (translateUi(text, language) === text) missing.push(`${language} ${label}: ${text}`);
  };
  for (const kind of NOTIFICATION_FIXED_TITLE_KINDS) {
    const def = NOTIFICATION_EVENTS[kind];
    assert.ok(def, `${kind} exists`);
    for (const values of probes) {
      const title = def.title(values);
      assert.ok(!title.includes("«"), `${kind} title is fixed: ${title}`);
      if (kind === "LEAVE_REVIEWED" && values.status === "DECLINED") continue; // leave reviews are APPROVED or REJECTED
      check(title, `${kind} title`);
    }
  }
  for (const kind of NOTIFICATION_FIXED_MESSAGE_KINDS) {
    const def = NOTIFICATION_EVENTS[kind];
    assert.ok(def, `${kind} exists`);
    for (const values of probes) {
      const message = def.message(values);
      assert.ok(!message.includes("«"), `${kind} message is fixed: ${message}`);
      check(message, `${kind} message`);
    }
  }
  assert.deepEqual(missing, []);
});

// ─── Recipients (fake directory) ────────────────────────────────────────────

type Person = { id: string; role: UserRole; campusId: string | null; authority?: boolean; payer?: boolean };
type Notice = { kind: string; payload: NotificationEventPayload; recipients: string[] };

function school(people: Person[]) {
  const notices: Notice[] = [];
  const directory: RecipientDirectory = {
    async campusUsers(_school, campusId, roles) { return people.filter((p) => p.campusId === campusId && roles.includes(p.role)).map((p) => p.id); },
    async schoolUsers(_school, roles) { return people.filter((p) => roles.includes(p.role)).map((p) => p.id); },
    async authorities() { return people.filter((p) => p.authority).map((p) => p.id); },
    async subscriptionOwners() { return people.filter((p) => p.payer).map((p) => p.id); },
    async classTeachers() { return []; },
    async teachersOfClass() { return []; },
    async userRole(id) { return people.find((p) => p.id === id)?.role ?? null; },
    async userName(id) { return people.find((p) => p.id === id) ? `Name of ${id}` : null; },
    async campusName(_school, campusId) { return `Campus ${campusId}`; },
  };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- test harness helper, not a React hook
  const restore = useRecipientDirectory(directory, async (kind, payload) => {
    const recipients = await NOTIFICATION_EVENTS[kind]!.recipients(payload);
    notices.push({ kind, payload, recipients: recipients.filter((id) => id !== payload.actorId) });
  });
  const recipients = (kind: string, payload: Partial<NotificationEventPayload> = {}) =>
    NOTIFICATION_EVENTS[kind]!.recipients({ schoolId: "school-1", recipientIds: [], ...payload } as NotificationEventPayload);
  return { notices, restore, recipients };
}

const GROUP: Person[] = [
  { id: "sa", role: "SUPER_ADMIN", campusId: null, authority: true, payer: true },
  { id: "sa-2", role: "SUPER_ADMIN", campusId: null, authority: true },
  { id: "ca-1", role: "CAMPUS_ADMIN", campusId: "c1" },
  { id: "pr-1", role: "PRINCIPAL", campusId: "c1" },
  { id: "ac-1", role: "ACCOUNTANT", campusId: "c1" },
  { id: "te-1", role: "TEACHER", campusId: "c1" },
  { id: "re-1", role: "RECEPTIONIST", campusId: "c1" },
  // c2: a principal but no campus admin (a vacancy, §2.6).
  { id: "pr-2", role: "PRINCIPAL", campusId: "c2" },
  { id: "te-2", role: "TEACHER", campusId: "c2" },
];
const STANDALONE: Person[] = [
  { id: "owner", role: "ADMIN", campusId: "s1", authority: true, payer: true },
  { id: "deputy", role: "CAMPUS_ADMIN", campusId: "s1" },
  { id: "pr", role: "PRINCIPAL", campusId: "s1" },
  { id: "te", role: "TEACHER", campusId: "s1" },
];
const SCHOOL_LEVEL = new Set(["SUBSCRIPTION_EXPIRING", "SUBSCRIPTION_SUSPENDED", "SUBSCRIPTION_PAUSED_NOTICE", "CAMPUS_OPS_VACANT", "SELF_APPROVED", "TAX_SIGNOFF_REQUESTED"]);

let active: ReturnType<typeof school> | null = null;
after(() => active?.restore());
function use(people: Person[]) { active?.restore(); active = school(people); return active; }

test("the group admin never receives a campus-level event", async () => {
  const s = use(GROUP);
  for (const kind of Object.keys(NOTIFICATION_EVENTS)) {
    if (SCHOOL_LEVEL.has(kind)) continue;
    for (const campusId of ["c1", "c2"]) {
      // Staffing events name a non-leadership role here; leadership appointments reach the authority by design (G41).
      const ids = await s.recipients(kind, { campusId, classId: "class-1", roleName: "TEACHER", actorId: "te-1", correctionKind: "MARK" });
      assert.ok(!ids.includes("sa") && !ids.includes("sa-2"), `${kind} on ${campusId} does not reach the group admin (${ids.join(",")})`);
    }
  }
  // The only campus-related line the authority sees is the vacancy notice, never the event itself.
  for (const notice of s.notices) assert.equal(notice.kind, "CAMPUS_OPS_VACANT");
});

test("seats: academic events → principal, finance → accountant, operations → campus admin", async () => {
  const s = use(GROUP);
  assert.deepEqual(await s.recipients("EXAM_CREATED", { campusId: "c1" }), ["pr-1"]);
  assert.deepEqual(await s.recipients("PAYMENT_RECORDED", { campusId: "c1" }), ["ac-1"]);
  assert.deepEqual(await s.recipients("STUDENT_ADMITTED", { campusId: "c1" }), ["ca-1"]);
  assert.deepEqual(await s.recipients("CERTIFICATE_APPROVAL_NEEDED", { campusId: "c1" }), ["ca-1"]);
  // Leave: teaching staff → academic lead; everyone else (the principal included) → campus operator (§2.5).
  assert.deepEqual(await s.recipients("LEAVE_APPLIED", { campusId: "c1", actorId: "te-1" }), ["pr-1"]);
  assert.deepEqual(await s.recipients("LEAVE_APPLIED", { campusId: "c1", actorId: "ac-1" }), ["ca-1"]);
  assert.deepEqual(await s.recipients("LEAVE_APPLIED", { campusId: "c1", actorId: "pr-1" }), ["ca-1"]);
  // Leadership staffing reaches the authority too; other staffing stays on campus.
  assert.deepEqual((await s.recipients("STAFF_INVITED", { campusId: "c1", roleName: "PRINCIPAL" })).sort(), ["ca-1", "sa", "sa-2"]);
  assert.deepEqual(await s.recipients("STAFF_INVITED", { campusId: "c1", roleName: "TEACHER" }), ["ca-1"]);
  // Corrections go to their checker seat (R-B2).
  assert.deepEqual(await s.recipients("CORRECTION_REQUESTED", { campusId: "c1", correctionKind: "PAYMENT" }), ["ca-1"]);
  assert.deepEqual(await s.recipients("CORRECTION_REQUESTED", { campusId: "c1", correctionKind: "MARK" }), ["pr-1"]);
  assert.equal(s.notices.length, 0, "a fully staffed campus raises no vacancy notice");
});

test("a campus-ops event on a campus with no operator reaches the authority as a notice (§2.6, R-B3)", async () => {
  const s = use(GROUP);
  assert.deepEqual(await s.recipients("STUDENT_ADMITTED", { campusId: "c2", actorId: "pr-2" }), [], "nobody holds the seat");
  assert.equal(s.notices.length, 1);
  const [notice] = s.notices;
  assert.equal(notice!.kind, "CAMPUS_OPS_VACANT");
  assert.equal(notice!.payload.campusId, "c2");
  assert.equal(notice!.payload.eventTitle, "New student enrolled");
  assert.deepEqual(notice!.recipients.sort(), ["sa", "sa-2"]);
  const def = NOTIFICATION_EVENTS.CAMPUS_OPS_VACANT!;
  assert.equal(def.title(notice!.payload), "No campus admin at Campus c2");
  assert.deepEqual(def.source?.(notice!.payload), { type: "campus", id: "c2" }, "one row per campus: repeats bump it");
  // An academic event on the same campus still reaches its principal; no notice.
  assert.deepEqual(await s.recipients("EXAM_CREATED", { campusId: "c2" }), ["pr-2"]);
  // A finance event with no accountant and no operator is also a vacancy.
  assert.deepEqual(await s.recipients("PAYMENT_RECORDED", { campusId: "c2" }), []);
  assert.equal(s.notices.length, 2);
  // A payment correction waits for a campus operator: the authority hears about the vacancy.
  await notifyCorrectionRequested({ schoolId: "school-1", campusId: "c2", correctionId: "corr-1", kind: "PAYMENT", requesterId: "te-2" });
  const kinds = s.notices.map((n) => n.kind);
  assert.ok(kinds.includes("CORRECTION_REQUESTED") && kinds.filter((k) => k === "CAMPUS_OPS_VACANT").length === 3, kinds.join(","));
});

test("SUBSCRIPTION_EXPIRING reaches payers only, including a standalone owner (G41, R-I2)", async () => {
  let s = use(GROUP);
  assert.deepEqual(await s.recipients("SUBSCRIPTION_EXPIRING"), ["sa"], "a flagless second group admin is not a payer");
  s = use(STANDALONE);
  assert.deepEqual(await s.recipients("SUBSCRIPTION_EXPIRING"), ["owner"], "the standalone school admin is notified");
  s = use(STANDALONE.map((p) => ({ ...p, payer: false })));
  assert.deepEqual(await s.recipients("SUBSCRIPTION_EXPIRING"), [], "no payer → nobody (never a non-payer)");
});

test("SUBSCRIPTION_SUSPENDED: payers get the renewal link, other operators one plain notice", async () => {
  let s = use(STANDALONE);
  assert.deepEqual(await s.recipients("SUBSCRIPTION_SUSPENDED"), ["owner"]);
  assert.equal(s.notices.length, 1);
  assert.equal(s.notices[0]!.kind, "SUBSCRIPTION_PAUSED_NOTICE");
  assert.deepEqual(s.notices[0]!.recipients, ["deputy"], "the owner is not told twice");
  assert.equal(NOTIFICATION_EVENTS.SUBSCRIPTION_PAUSED_NOTICE!.message(s.notices[0]!.payload), "Some actions are paused while the school's plan is renewed.");
  s = use(GROUP);
  assert.deepEqual(await s.recipients("SUBSCRIPTION_SUSPENDED"), ["sa"]);
  assert.deepEqual(s.notices[0]!.recipients, ["ca-1"]);
});

test("self-approval notices reach the authority, never the authority about itself (R-B4)", async () => {
  let s = use(GROUP);
  await notifySelfApproval({ schoolId: "school-1", campusId: "c1", kind: "finance", recordId: "adj-1", actorId: "ca-1", reason: "Only admin on campus" });
  assert.equal(s.notices.length, 1);
  assert.equal(s.notices[0]!.kind, "SELF_APPROVED");
  assert.deepEqual(s.notices[0]!.recipients.sort(), ["sa", "sa-2"]);
  assert.match(NOTIFICATION_EVENTS.SELF_APPROVED!.message(s.notices[0]!.payload), /fee adjustment.*Reason: Only admin on campus/);
  s = use(STANDALONE);
  await notifySelfApproval({ schoolId: "school-1", campusId: null, kind: "tax", recordId: "tax-1", actorId: "owner", reason: "Sole authority" });
  assert.equal(s.notices.length, 0);
});

test("a tax sign-off request reaches the institution authority only (§4.4b, C3)", async () => {
  let s = use(GROUP);
  const payload = { campusId: null, actorId: "ac-1", activationId: "tax-1", packageCode: "PK-GST", packageVersion: 1 };
  assert.deepEqual((await s.recipients("TAX_SIGNOFF_REQUESTED", payload)).sort(), ["sa", "sa-2"]);
  s = use(STANDALONE);
  assert.deepEqual(await s.recipients("TAX_SIGNOFF_REQUESTED", { ...payload, actorId: "deputy" }), ["owner"], "a single school's admin signs off; the campus admin does not");
  assert.equal(s.notices.length, 0, "no vacancy notice: the request is school-level");
});

// ─── Fix pass (P9-02, P9-07, P9-11) ─────────────────────────────────────────

/** In-memory mirror of deliverNotification's dedupe rules (one row per user and dedupeKey; bumps skip resolved rows). */
type Row = { userId: string; dedupeKey: string; resolvedAt: Date | null; reminderCount: number; message: string };
function vacancyHarness(people: Person[]) {
  const rows: Row[] = [];
  const directory: RecipientDirectory = {
    async campusUsers(_school, campusId, roles) { return people.filter((p) => p.campusId === campusId && roles.includes(p.role)).map((p) => p.id); },
    async schoolUsers(_school, roles) { return people.filter((p) => roles.includes(p.role)).map((p) => p.id); },
    async authorities() { return people.filter((p) => p.authority).map((p) => p.id); },
    async subscriptionOwners() { return people.filter((p) => p.payer).map((p) => p.id); },
    async classTeachers() { return []; },
    async teachersOfClass() { return []; },
    async userRole(id) { return people.find((p) => p.id === id)?.role ?? null; },
    async userName(id) { return `Name of ${id}`; },
    async campusName(_school, campusId) { return `Campus ${campusId}`; },
    async reopenResolvedVacancy(_school, campusId) {
      for (const row of rows) if (row.dedupeKey === `CAMPUS_OPS_VACANT:campus:${campusId}` && row.resolvedAt) row.resolvedAt = null;
    },
  };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- test harness helper, not a React hook
  const restore = useRecipientDirectory(directory, async (kind, payload) => {
    const def = NOTIFICATION_EVENTS[kind]!;
    const source = def.source?.(payload);
    const dedupeKey = source ? `${kind}:${source.type}:${source.id}` : `${kind}:${Math.random()}`;
    for (const userId of (await def.recipients(payload)).filter((id) => id !== payload.actorId)) {
      const existing = rows.find((row) => row.userId === userId && row.dedupeKey === dedupeKey);
      if (!existing) rows.push({ userId, dedupeKey, resolvedAt: null, reminderCount: 0, message: def.message(payload) });
      else if (!existing.resolvedAt) existing.reminderCount += 1; // updateMany({ resolvedAt: null })
    }
  });
  return { rows, restore, people };
}

test("vacancy → appointed → vacancy again reaches the authority again (P9-02)", async () => {
  active?.restore(); active = null;
  const people: Person[] = GROUP.map((p) => ({ ...p }));
  const h = vacancyHarness(people);
  try {
    const emit = () => NOTIFICATION_EVENTS.STUDENT_ADMITTED!.recipients({ schoolId: "school-1", campusId: "c2", actorId: "pr-2" } as NotificationEventPayload);
    await emit();
    const authorityRow = () => h.rows.find((row) => row.userId === "sa" && row.dedupeKey === "CAMPUS_OPS_VACANT:campus:c2")!;
    assert.equal(authorityRow().resolvedAt, null, "first vacancy: an open row");
    // A campus admin is appointed; the row resolves (the open route / inboxCounts settle it once an operator exists).
    people.push({ id: "ca-2", role: "CAMPUS_ADMIN", campusId: "c2" });
    assert.deepEqual(await emit(), ["ca-2"], "while staffed, the event goes to the operator");
    authorityRow().resolvedAt = new Date();
    // The operator leaves again: the next campus event must reopen the authority's row, not vanish.
    people.splice(people.findIndex((p) => p.id === "ca-2"), 1);
    assert.deepEqual(await emit(), []);
    assert.equal(authorityRow().resolvedAt, null, "second vacancy reopens the row");
    assert.equal(authorityRow().reminderCount, 1, "and bumps it back to unread");
  } finally {
    h.restore();
  }
});

test("STAFF_REMOVED without a role still tells the authority when a leader is removed (P9-07)", async () => {
  const s = use([...GROUP, { id: "ca-x", role: "CAMPUS_ADMIN", campusId: "c1" }]);
  // invite.ts sends only the name today; the role is looked up from the person's id.
  assert.deepEqual((await s.recipients("STAFF_REMOVED", { campusId: "c1", staffId: "pr-1", staffName: "P" })).sort(), ["ca-1", "ca-x", "sa", "sa-2"]);
  assert.deepEqual((await s.recipients("STAFF_REMOVED", { campusId: "c1", userId: "te-1", staffName: "T" })).sort(), ["ca-1", "ca-x"]);
  assert.deepEqual((await s.recipients("STAFF_REMOVED", { campusId: "c1", staffName: "Nobody known" })).sort(), ["ca-1", "ca-x"], "no id, no role: campus only");
});

test("payment and subscription copy never prints minor units or ISO timestamps (P9-11)", async () => {
  const payment = NOTIFICATION_EVENTS.PAYMENT_RECORDED!;
  assert.equal(moneyText({ amount: 500000, currency: "PKR" }), formatMoney({ minor: 500000, currency: "PKR" }, { ...defaultLocale, currency: "PKR" }));
  assert.match(payment.message({ amount: 500000, currency: "PKR", studentName: "Ali" }), /^Payment of .*5,000\.00.* recorded for Ali$/);
  assert.equal(payment.message({ amount: 500000, studentName: "Ali" }), "Payment recorded for Ali", "no currency → the amount is left out, never a raw number");
  assert.equal(moneyText({ amount: 1500, currency: "KWD" }), formatMoney({ minor: 1500, currency: "KWD" }, { ...defaultLocale, currency: "KWD" }), "three-decimal currencies");
  // The recipients step reads the campus currency from the locale package when the caller did not send one.
  const restore = useRecipientDirectory({
    async campusUsers(_s, _c, roles) { return roles.includes("ACCOUNTANT") ? ["ac"] : []; },
    async schoolUsers() { return []; }, async authorities() { return []; }, async subscriptionOwners() { return ["payer"]; },
    async classTeachers() { return []; }, async teachersOfClass() { return []; }, async userRole() { return null; },
    async userName() { return null; }, async campusName() { return null; },
    async localePackage() { return { ...defaultLocale, currency: "SAR", timezone: "Asia/Riyadh" }; },
  });
  try {
    const payload = { schoolId: "school-1", campusId: "c1", amount: 12345, studentName: "Sara" } as NotificationEventPayload;
    assert.deepEqual(await payment.recipients(payload), ["ac"]);
    assert.equal(payload.currency, "SAR");
    assert.ok(payment.message(payload).includes(formatMoney({ minor: 12345, currency: "SAR" }, { ...defaultLocale, currency: "SAR" })));
    const expiring = { schoolId: "school-1", plan: "PRO", planEndsAt: "2026-10-21T22:30:00.000Z" } as NotificationEventPayload;
    await NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRING!.recipients(expiring);
    const text = NOTIFICATION_EVENTS.SUBSCRIPTION_EXPIRING!.message(expiring);
    assert.ok(!text.includes("T22:30"), text);
    assert.ok(text.includes("22 October 2026") || text.includes("October 22, 2026"), `the school's own date (Riyadh is already the 22nd): ${text}`);
  } finally {
    restore();
  }
  assert.equal(dateText("not a date", "UTC"), "not a date");
});
