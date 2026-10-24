import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import { normalizeText, detectScript, searchTokens } from "../../src/lib/ai-workflows/planner/normalize";
import { matchQuote, checkEvidence } from "../../src/lib/ai-workflows/planner/evidence";
import { bindHandles } from "../../src/lib/ai-workflows/planner/context";
import { rank } from "../../src/lib/ai-workflows/planner/retrieve";
import { cardFor, PLANNER_SYSTEM } from "../../src/lib/ai-workflows/planner/protocol";
import { REGISTRY, entriesForRole } from "../../src/lib/ai-workflows/registry";

after(async () => { await prisma.$disconnect(); redis.disconnect(); });

test("normalisation folds Arabic and Urdu variants, digits, diacritics and tatweel", () => {
  assert.equal(normalizeText("كتابُ  ١٢"), normalizeText("کتاب 12"));
  assert.equal(normalizeText("مدرســة"), normalizeText("مدرسہ"));
  assert.equal(normalizeText("۱۲ نومبر"), "12 نومبر");
  assert.equal(detectScript("علی اور سارہ غیر حاضر"), "ur");
  assert.equal(detectScript("أضف إجازة"), "ar");
});

test("evidence matches the user's own words in any script; a value they never said is not evidence", () => {
  const segments = [{ id: "s0", normalized: normalizeText("Add a holiday on ١٢ November for Iqbal Day") }];
  assert.ok(matchQuote("holiday on 12 November", segments));
  assert.equal(matchQuote("delete all invoices", segments), null);
  const { missing } = checkEvidence({ holidayName: "Quaid Day" }, ["/holidayName"], [{ pointer: "/holidayName", quote: "holiday on 12 November" }], segments);
  assert.deepEqual(missing, ["/holidayName"]);
  const ok = checkEvidence({ holidayName: "Iqbal Day" }, ["/holidayName"], [{ pointer: "/holidayName", quote: "for Iqbal Day" }], segments);
  assert.deepEqual(ok.missing, []);
});

test("handles bind to ids; unknown handles and invented ids become missing fields", () => {
  const ids = new Map([["class:1", "real-class-id"]]);
  const { value, missing } = bindHandles({ classId: "class:1", teacherId: "0f3a9c1e-7d2b-4c11-9a77-1b2c3d4e5f60", roomId: "room:9", note: "class:1 is fine as text?" }, ids);
  assert.equal((value as { classId: string }).classId, "real-class-id");
  assert.deepEqual(missing.sort(), ["/roomId", "/teacherId"]);
});

test("retrieval ranks by meaning words in all three languages and only within the role", () => {
  const admin = entriesForRole("CAMPUS_ADMIN");
  assert.equal(rank("add a holiday on 12 november", admin)[0].entry.key, "setup.holidays");
  assert.equal(rank("کمرے شامل کریں", admin)[0].entry.key, "setup.rooms");
  // "إجازة" is both a school holiday and staff leave: both cards must reach the model (MAX_CARDS), which asks if unclear.
  const arabic = rank("أضف إجازة", admin).slice(0, 8).map(item => item.entry.key);
  assert.ok(arabic.includes("setup.holidays") && arabic.includes("leave.create_type"), arabic.join(","));
  assert.ok(!entriesForRole("TEACHER").some(entry => entry.key.startsWith("fees.")));
});

test("retrieval matches singular and plural English, so \"create class\" finds the class-setup capability", () => {
  assert.deepEqual(searchTokens("classes sections students fees holidays libraries batches"), ["class", "section", "student", "fee", "holiday", "library", "batch"]);
  assert.deepEqual(searchTokens("status analysis 12s"), ["status", "analysis", "12s"]);
  const admin = entriesForRole("CAMPUS_ADMIN");
  assert.ok(rank("create class grade 12", admin).slice(0, 8).some(item => item.entry.key === "academics.setup_year"));
});

test("the planner is told missing inputs become questions, never a reason to refuse", () => {
  assert.match(PLANNER_SYSTEM, /Missing inputs are never a reason for "unsupported"/);
  assert.match(PLANNER_SYSTEM, /never use the handle of a different record/);
  assert.match(PLANNER_SYSTEM, /only when no listed capability does what the user asked/);
});

test("absent required-but-nullable fields become null (not a question); nothing else is filled", async () => {
  const { fillNullables } = await import("../../src/lib/ai-workflows/planner/plan");
  const schema = { type: "object", required: ["label", "startDate", "classes"], properties: {
    label: { type: "string" }, startDate: { anyOf: [{ type: "string" }, { type: "null" }] }, note: { anyOf: [{ type: "string" }, { type: "null" }] },
    classes: { type: "array", items: { type: "object", required: ["name", "section"], properties: { name: { type: "string" }, section: { anyOf: [{ type: "string" }, { type: "null" }] } } } },
  } };
  assert.deepEqual(fillNullables(schema, { classes: [{ name: "Grade 12" }, { name: "Grade 11", section: "B" }] }), { startDate: null, classes: [{ name: "Grade 12", section: null }, { name: "Grade 11", section: "B" }] });
});

test("the planner is told confirmation and empty context are never reasons to refuse", () => {
  assert.match(PLANNER_SYSTEM, /Needing confirmation is never a reason/);
  assert.match(PLANNER_SYSTEM, /an empty `context` is never a reason to refuse/);
  assert.match(PLANNER_SYSTEM, /Fill technical fields yourself/);
});

test("every card the model can see renders in each language with a class note and no executable proposal in drafts", () => {
  for (const entry of REGISTRY.values()) for (const language of ["en", "ar", "ur"] as const) {
    const card = cardFor(entry, language);
    assert.ok(card.title && card.whenToUse && card.examples.length && ["RUNS", "CONFIRM", "HANDOFF"].includes(card.class));
  }
  assert.ok(!JSON.stringify(cardFor(REGISTRY.get("work.save")!, "en")).includes("fees.generate_invoices"), "a draft plan cannot carry an operation");
});

test("amounts written with thousands separators count as the user's own number", () => {
  const segments = [{ id: "s0", normalized: "record rs 12,500 cash for bilal" }];
  assert.deepEqual(checkEvidence({ amount: 12500 }, ["/amount"], [{ pointer: "/amount", quote: "rs 12,500 cash" }], segments).missing, []);
  assert.deepEqual(checkEvidence({ amount: 12600 }, ["/amount"], [{ pointer: "/amount", quote: "rs 12,500 cash" }], segments).missing, ["/amount"], "a different number is not supported");
});
