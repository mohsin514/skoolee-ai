import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import { normalizeText, detectScript } from "../../src/lib/ai-workflows/planner/normalize";
import { matchQuote, checkEvidence } from "../../src/lib/ai-workflows/planner/evidence";
import { bindHandles } from "../../src/lib/ai-workflows/planner/context";
import { rank } from "../../src/lib/ai-workflows/planner/retrieve";
import { cardFor } from "../../src/lib/ai-workflows/planner/protocol";
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
  assert.equal(rank("أضف إجازة", admin)[0].entry.key, "setup.holidays");
  assert.ok(!entriesForRole("TEACHER").some(entry => entry.key.startsWith("fees.")));
});

test("every card the model can see renders in each language with a class note and no executable proposal in drafts", () => {
  for (const entry of REGISTRY.values()) for (const language of ["en", "ar", "ur"] as const) {
    const card = cardFor(entry, language);
    assert.ok(card.title && card.whenToUse && card.examples.length && ["RUNS", "CONFIRM", "HANDOFF"].includes(card.class));
  }
  assert.ok(!JSON.stringify(cardFor(REGISTRY.get("work.save")!, "en")).includes("fees.generate_invoices"), "a draft plan cannot carry an operation");
});
