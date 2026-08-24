// Messaging module — reachability, tenancy and thread mechanics.
//
// The assertions that matter here are the negative ones: a guardian must not
// be able to enumerate other families, a teacher must not reach a household
// they have no register link to, and no thread may cross a tenant boundary.
// Driven over HTTP with real persona cookies, so the tenant guard,
// requireChatUser() and src/lib/chat/policy.ts are all exercised as a browser
// would exercise them.
//
// Self-resetting: the module's own tables are cleared first, so the suite is
// repeatable rather than passing only on a virgin database.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();

const out = [];
const check = (id, name, cond, detail = "") => {
  out.push({ id, name, pass: !!cond, detail });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${id.padEnd(9)} ${name}${detail ? "  — " + detail : ""}`);
};

const as = async (persona, path, opts = {}) => {
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      cookie: `skoolee_token=${fx.personas[persona].token}`,
      "content-type": "application/json",
      ...(opts.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};

const openDirect = (persona, userId) =>
  as(persona, "/chat/conversations", { method: "POST", body: JSON.stringify({ kind: "DIRECT", userId }) });

const RUN_KEY = `probe-chat-${Date.now()}`;

console.log("\n── Messaging (chat) ──\n");

// Conversations cascade to members, messages and attachments.
await prisma.conversation.deleteMany({});
await prisma.chatSetting.deleteMany({});

// ─── Identity and the platform-owner boundary ───────────────────
let r = await as("T1-TEACHER", "/chat/unread");
check("CHT-1", "signed-in staff get their viewer and badge",
  r.status === 200 && r.body?.viewer?.role === "TEACHER", `HTTP ${r.status}`);
const teacherId = r.body?.viewer?.id;

// APP_OWNER sessions resolve to an UNSCOPED tenant context, so a chat query on
// their behalf would run across every school at once. The role is refused at
// the door rather than relied on to hold no memberships.
r = await as("T1-APP_OWNER", "/chat/unread");
check("CHT-2", "APP_OWNER is refused from school messaging", r.status === 403, `HTTP ${r.status}`);

const stream = await fetch(`${BASE}/api/chat/stream`);
check("CHT-3", "the live stream requires a session", stream.status === 401, `HTTP ${stream.status}`);

// ─── Directory: the only place a user can enumerate accounts ────
const dirOf = async (persona) => (await as(persona, "/chat/directory?limit=100")).body?.contacts ?? [];
const [dSuper, dTeacher, dTeacherB, dParent, dParentB] = await Promise.all(
  ["T1-SUPER_ADMIN", "T1-TEACHER", "T1-TEACHER-B", "T1-PARENT", "T1-PARENT-B"].map(dirOf)
);
const rolesIn = (list) => new Set(list.map((c) => c.role));
const idOf = (list, pred) => list.find(pred)?.id;

check("CHT-4", "a group super admin reaches the whole school", dSuper.length >= 10, `${dSuper.length} contacts`);
check("CHT-5", "a teacher reaches colleagues and their own register's families",
  rolesIn(dTeacher).has("PARENT") && (rolesIn(dTeacher).has("PRINCIPAL") || rolesIn(dTeacher).has("SUPER_ADMIN")),
  [...rolesIn(dTeacher)].join(","));
check("CHT-6", "a guardian can NEVER enumerate other guardians",
  !dParent.some((c) => c.role === "PARENT"), dParent.map((c) => c.role).join(","));
check("CHT-7", "a guardian can NEVER enumerate other pupils",
  !dParent.some((c) => c.role === "STUDENT"), dParent.map((c) => c.role).join(","));
check("CHT-8", "a guardian does reach their children's teachers and the office",
  dParent.some((c) => c.role === "TEACHER") &&
  dParent.some((c) => ["PRINCIPAL", "SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN"].includes(c.role)),
  dParent.map((c) => c.role).join(","));
check("CHT-9", "each contact says why they are reachable",
  dParent.some((c) => c.context), JSON.stringify(dParent.map((c) => c.context)));
check("CHT-10", "a teacher does not get a household from a class they do not take",
  !dTeacherB.some((c) => c.id === fx.personas["T1-PARENT-B"].userId),
  dTeacherB.map((c) => c.fullName).join(","));
check("CHT-11", "the platform owner never appears in a school directory",
  !dSuper.some((c) => c.role === "APP_OWNER"), dSuper.map((c) => c.role).join(","));

// Nobody is ever offered a conversation with themselves. Checked for every
// role rather than one: a campus admin once believed they were listed, because
// ADMIN is a legacy alias of CAMPUS_ADMIN and both render as "Campus Admin" —
// the row was a different colleague, but the UI gave them no way to tell.
const selfListings = [];
for (const persona of [
  "T1-SUPER_ADMIN", "T1-CAMPUS_ADMIN", "T1-ADMIN", "T1-PRINCIPAL", "T1-TEACHER",
  "T1-PARENT", "T1-STUDENT", "T1-ACCOUNTANT", "T1-LIBRARIAN", "T1-RECEPTIONIST",
]) {
  const contacts = await dirOf(persona);
  if (contacts.some((c) => c.id === fx.personas[persona].userId)) selfListings.push(persona);
}
check("CHT-11b", "no role is ever offered a conversation with itself",
  selfListings.length === 0, selfListings.join(","));

// Every contact carries something beyond their rank, so two colleagues of the
// same rank are tellable apart in the picker.
const undistinguished = dSuper.filter((c) => !c.context && !c.campusName);
check("CHT-11c", "every contact carries a campus or a relationship",
  undistinguished.length === 0, undistinguished.map((c) => c.fullName).join(","));

// ─── Reachability on the write path ─────────────────────────────
const myFamilyId = idOf(dTeacher, (c) => c.role === "PARENT");
const opened = await openDirect("T1-TEACHER", myFamilyId);
check("CHT-12", "teacher → guardian of a pupil they teach: allowed", opened.status === 200, `HTTP ${opened.status}`);
const threadId = opened.body?.conversation?.id;

const again = await openDirect("T1-TEACHER", myFamilyId);
check("CHT-13", "opening the same pair twice does not fork the thread",
  again.body?.conversation?.id === threadId, `${again.body?.conversation?.id} vs ${threadId}`);

const otherFamilyId = fx.personas["T1-PARENT-B"].userId;
r = await openDirect("T1-PARENT", otherFamilyId);
check("CHT-14", "guardian → guardian refused, with a reason",
  r.status === 403 && typeof r.body?.error === "string" && r.body.error.length > 20, r.body?.error);

// A register link is stronger evidence than a campus column and is checked
// first — so this must be refused on the teaching rule, not on campus.
r = await openDirect("T1-TEACHER", otherFamilyId);
check("CHT-15", "teacher → unrelated household refused on the register rule",
  r.status === 403 && /students you teach/.test(r.body?.error ?? ""), `HTTP ${r.status} ${r.body?.error}`);

r = await openDirect("T1-TEACHER", fx.personas["T2-PARENT"].userId);
check("CHT-16", "a conversation can NEVER cross a tenant boundary", r.status === 404, `HTTP ${r.status}`);

r = await openDirect("T1-PRINCIPAL", fx.personas["T1-STUDENT"].userId);
check("CHT-17", "leadership reaches anyone in scope", r.status === 200, `HTTP ${r.status}`);

r = await openDirect("T1-TEACHER", fx.personas["T1-TEACHER-DISABLED"].userId);
check("CHT-18", "a deactivated account is unreachable", r.status === 403, `HTTP ${r.status}`);

// ─── Groups cannot be used to route around the directory ────────
const staffIds = dTeacher.filter((c) => ["PRINCIPAL", "ACCOUNTANT", "LIBRARIAN"].includes(c.role)).map((c) => c.id);
r = await as("T1-PARENT", "/chat/conversations", {
  method: "POST", body: JSON.stringify({ kind: "GROUP", title: "Guardians", memberIds: [otherFamilyId] }),
});
check("CHT-19", "families cannot create groups", r.status === 403, `HTTP ${r.status}`);

r = await as("T1-TEACHER", "/chat/conversations", {
  method: "POST", body: JSON.stringify({ kind: "GROUP", title: "Grade 5 planning", memberIds: staffIds }),
});
check("CHT-20", "staff can create a group of people they already reach", r.status === 200, `HTTP ${r.status}`);
const groupId = r.body?.conversation?.id;
check("CHT-21", "the creator owns it",
  r.body?.conversation?.members?.find((m) => m.userId === teacherId)?.memberRole === "OWNER");

r = await as("T1-TEACHER", "/chat/conversations", {
  method: "POST",
  body: JSON.stringify({ kind: "GROUP", title: "Smuggle", memberIds: [...staffIds, fx.personas["T2-PARENT"].userId] }),
});
check("CHT-22", "a group carrying one unreachable member is refused whole", r.status !== 200, `HTTP ${r.status}`);

r = await as("T1-TEACHER", "/chat/conversations", {
  method: "POST", body: JSON.stringify({ kind: "ANNOUNCEMENT", title: "Notice", memberIds: staffIds }),
});
check("CHT-23", "only leadership opens an announcement channel", r.status === 403, `HTTP ${r.status}`);

// ─── Thread mechanics ───────────────────────────────────────────
const first = await as("T1-TEACHER", `/chat/conversations/${threadId}/messages`, {
  method: "POST", body: JSON.stringify({ body: "Ayesha did very well this week.", clientKey: RUN_KEY }),
});
check("CHT-24", "a message sends", first.status === 200, `HTTP ${first.status}`);
const messageId = first.body?.message?.id;

const retry = await as("T1-TEACHER", `/chat/conversations/${threadId}/messages`, {
  method: "POST", body: JSON.stringify({ body: "Ayesha did very well this week.", clientKey: RUN_KEY }),
});
check("CHT-25", "a retried send resolves to the same message, not a second one",
  retry.body?.message?.id === messageId, `${retry.body?.message?.id} vs ${messageId}`);

r = await as("T1-PARENT", "/chat/unread");
check("CHT-26", "the recipient's badge rises", r.body?.unreadCount >= 1, `${r.body?.unreadCount}`);

r = await as("T1-PARENT", "/chat/conversations");
const row = r.body?.conversations?.find((c) => c.id === threadId);
check("CHT-27", "the thread is titled by the other person, with a preview",
  Boolean(row?.title) && row?.lastMessagePreview?.startsWith("Ayesha"), `${row?.title} / ${row?.lastMessagePreview}`);

r = await as("T1-PARENT", `/chat/conversations/${threadId}/messages`, {
  method: "POST", body: JSON.stringify({ body: "Thank you, that is good to hear." }),
});
check("CHT-28", "the guardian can reply", r.status === 200, `HTTP ${r.status}`);

await as("T1-PARENT", `/chat/conversations/${threadId}/read`, { method: "POST" });
r = await as("T1-PARENT", "/chat/unread");
check("CHT-29", "marking read clears the badge", r.body?.unreadCount === 0, `${r.body?.unreadCount}`);

r = await as("T1-PARENT", `/chat/conversations/${threadId}/messages`);
const bodies = r.body?.messages?.map((m) => m.body) ?? [];
check("CHT-30", "history reads back oldest-first",
  bodies.length === 2 && bodies[0].startsWith("Ayesha"), JSON.stringify(bodies));

// A non-member must not learn anything from a thread id, including that it
// exists — hence 404 rather than 403.
r = await as("T1-PARENT-B", `/chat/conversations/${threadId}/messages`);
check("CHT-31", "a non-member cannot read a thread by id", r.status === 404, `HTTP ${r.status}`);
r = await as("T1-PARENT-B", `/chat/conversations/${threadId}/messages`, {
  method: "POST", body: JSON.stringify({ body: "let me in" }),
});
check("CHT-32", "a non-member cannot post into a thread", r.status === 404, `HTTP ${r.status}`);
r = await as("T2-PRINCIPAL", `/chat/conversations/${threadId}`);
check("CHT-33", "another tenant's leadership cannot read the thread", r.status === 404, `HTTP ${r.status}`);

// ─── Editing and moderation ─────────────────────────────────────
r = await as("T1-TEACHER", `/chat/messages/${messageId}`, {
  method: "PATCH", body: JSON.stringify({ body: "Ayesha did very well this term." }),
});
check("CHT-34", "an author edits their own message", r.status === 200 && r.body?.message?.isEdited === true, `HTTP ${r.status}`);

r = await as("T1-PARENT", `/chat/messages/${messageId}`, {
  method: "PATCH", body: JSON.stringify({ body: "words in someone else's mouth" }),
});
check("CHT-35", "nobody edits another person's message", r.status === 403, `HTTP ${r.status}`);

r = await as("T1-TEACHER", `/chat/messages/${messageId}`, { method: "DELETE" });
check("CHT-36", "withdrawing hides the body but keeps the record",
  r.status === 200 && r.body?.message?.isDeleted === true && r.body?.message?.body === "", `HTTP ${r.status}`);
const stillThere = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { body: true, deletedById: true } });
check("CHT-37", "the withdrawn row survives for audit, naming who removed it",
  Boolean(stillThere?.body) && stillThere?.deletedById === teacherId);

// ─── School policy ──────────────────────────────────────────────
r = await as("T1-TEACHER", "/chat/settings");
check("CHT-38", "peer channels are closed by default",
  r.body?.settings?.parentToParent === false && r.body?.settings?.studentToStudent === false,
  JSON.stringify(r.body?.settings));
check("CHT-39", "a teacher may read but not manage the policy", r.body?.canManage === false);

r = await as("T1-TEACHER", "/chat/settings", { method: "PATCH", body: JSON.stringify({ parentToParent: true }) });
check("CHT-40", "a teacher cannot change the policy", r.status === 403, `HTTP ${r.status}`);

// Toggled on the guardian↔support channel, whose two parties share a campus,
// so the only variable under test is the setting itself.
const librarianId = fx.personas["T1-LIBRARIAN"].userId;
await as("T1-SUPER_ADMIN", "/chat/settings", { method: "PATCH", body: JSON.stringify({ parentToSupport: false }) });
r = await openDirect("T1-PARENT", librarianId);
check("CHT-41", "closing a channel takes effect immediately", r.status === 403, `HTTP ${r.status}`);
check("CHT-42", "and the directory agrees with the policy",
  !(await dirOf("T1-PARENT")).some((c) => c.role === "LIBRARIAN"));

await as("T1-SUPER_ADMIN", "/chat/settings", { method: "PATCH", body: JSON.stringify({ parentToSupport: true }) });
r = await openDirect("T1-PARENT", librarianId);
check("CHT-43", "reopening it restores access", r.status === 200, `HTTP ${r.status}`);

r = await as("T2-TEACHER", "/chat/settings");
check("CHT-44", "policy is per school, not platform-wide",
  r.body?.settings?.parentToSupport === true && r.body?.settings?.parentToParent === false,
  JSON.stringify(r.body?.settings));

// ─── Leaving ────────────────────────────────────────────────────
r = await as("T1-TEACHER", `/chat/conversations/${groupId}`, { method: "DELETE" });
check("CHT-45", "a member can leave a group", r.status === 200, `HTTP ${r.status}`);
r = await as("T1-TEACHER", `/chat/conversations/${groupId}`);
check("CHT-46", "a thread they left is gone from their view", r.status === 404, `HTTP ${r.status}`);
const survivors = await prisma.conversationMember.count({ where: { conversationId: groupId, leftAt: null } });
check("CHT-47", "but it survives for everyone still in it", survivors > 0, `${survivors} remaining`);

await prisma.$disconnect();

const failed = out.filter((o) => !o.pass);
console.log(`\n  ${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
