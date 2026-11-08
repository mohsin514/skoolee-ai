import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import type { generateAIDraft } from "../../src/lib/ai/openai";
import { NEGATIVE_CASES, ROLE_CASES, WORKFLOW_EVAL_CASES, EVAL_ROLES, fixturePersonNames, outcome, type WorkflowEvalCase } from "../../src/lib/ai-workflows/eval/cases";
import { REGISTRY } from "../../src/lib/ai-workflows/registry";
import { AI_EVALUATION_CASES } from "../../src/lib/ai/evaluation";
import { assertLiveTarget, observe, percentile, piiHits, reportMarkdown, runSmoke, summarize, type Execute, type ExecuteResult } from "../../scripts/ai-workflows/live-smoke";

/**
 * Offline self-test of the live smoke's core: a stub provider returns each case's expected plan, and a
 * stub executor turns the reply into what the planner would have produced. No network, no database.
 */
type Generate = typeof generateAIDraft;
type Reply = { planned: string[]; writes?: ExecuteResult["writes"]; plant?: string };
const firstExpected = (item: WorkflowEvalCase) => item.expect.map(entry => typeof entry === "string" ? entry : entry[0]);

/** A provider that answers with the expected plan unless a case has a scripted mistake. */
function stubProvider(mistakes: Record<string, Reply> = {}) {
  const generate: Generate = async ({ prompt }) => {
    const { id } = JSON.parse(prompt) as { id: string };
    const item = WORKFLOW_EVAL_CASES.find(entry => entry.id === id)!;
    const reply: Reply = mistakes[id] ?? { planned: firstExpected(item) };
    return { text: JSON.stringify(reply), model: "synthetic:stub", tokensUsed: 10, promptVersion: "test" };
  };
  return generate;
}

/** Plays the planner: one call with the masked request (or a planted name), then reports what was planned and written. */
const stubExecute: Execute = async (item, generate) => {
  const first = await generate({ system: "synthetic planner system", prompt: JSON.stringify({ id: item.id, userText: "[PERSON_1] in 7 B" }) });
  const reply = JSON.parse(first.text) as Reply;
  if (reply.plant) await generate({ system: "synthetic repair system", prompt: JSON.stringify({ id: item.id, userText: reply.plant }) });
  return { planned: reply.planned, writes: reply.writes ?? [] };
};

// Importing the registry loads Prisma and the queue client (no connection is made); release them so the file can finish.
after(async () => { await prisma.$disconnect(); redis.disconnect(); });

let clock = 0;
const ticking = (step: number) => () => (clock += step);

test("the dataset holds 66 role × language cases and 40 negatives, all naming real registry keys", () => {
  assert.equal(ROLE_CASES.length, 66);
  assert.equal(NEGATIVE_CASES.length, 40);
  assert.equal(new Set(WORKFLOW_EVAL_CASES.map(item => item.id)).size, 106, "case ids are unique");
  for (const role of EVAL_ROLES) for (const language of ["en", "ar", "ur"] as const) {
    assert.equal(ROLE_CASES.filter(item => item.role === role && item.language === language).length, 2, `${role} ${language}`);
  }
  for (const item of WORKFLOW_EVAL_CASES) {
    for (const token of [...item.expect.flat(), ...(item.tolerate ?? []), ...(item.forbid ?? [])]) {
      if (token.startsWith("outcome:")) assert.ok(["outcome:answer", "outcome:unsupported", "outcome:ask"].includes(token), `${item.id}: ${token}`);
      else assert.ok(REGISTRY.has(token), `${item.id}: ${token} is not a registry key`);
    }
    for (const token of item.expect.flat()) if (REGISTRY.has(token)) assert.ok(REGISTRY.get(token)!.roles.includes(item.role), `${item.id}: ${item.role} cannot hold ${token}`);
  }
  for (const probe of ["injection-book-title", "injection-announcement", "injection-leave-reason", "bulk-present", "approve-and-send", "pii-unknown-name"]) {
    assert.ok(NEGATIVE_CASES.some(item => item.probe === probe), probe);
  }
  assert.ok(NEGATIVE_CASES.filter(item => item.probe === "pii-unknown-name").every(item => /[؀-ۿ]/.test(item.message)), "the unknown name is in Arabic script");
  const names = fixturePersonNames();
  assert.deepEqual(piiHits(NEGATIVE_CASES.filter(item => item.probe === "pii-unknown-name").map(item => item.message), names), [], "the probe name matches no one in the fixture");
});

test("the release-gate dataset carries every workflow case", () => {
  for (const item of WORKFLOW_EVAL_CASES) {
    const entry = AI_EVALUATION_CASES.find(candidate => candidate.id === `wf-${item.id}`);
    assert.ok(entry, item.id);
    assert.equal(entry.category, item.kind === "role" ? "workflow-routing" : "workflow-safety");
    assert.equal(entry.input, item.message);
  }
});

test("a clean run of every case passes every gate", async () => {
  const observations = await runSmoke({ cases: WORKFLOW_EVAL_CASES, generate: stubProvider(), execute: stubExecute, now: ticking(100) });
  assert.equal(observations.length, 106);
  assert.ok(observations.every(item => item.prompts.length === 2), "system and prompt are both captured");
  const report = summarize(WORKFLOW_EVAL_CASES, observations);
  assert.equal(report.metrics.recall, 1);
  assert.equal(report.metrics.precision, 1);
  assert.equal(report.metrics.wrongWrites, 0);
  assert.equal(report.metrics.piiHits, 0);
  assert.equal(report.metrics.p95LatencyMs, 100);
  assert.deepEqual(report.gates.map(gate => gate.passed), [true, true, true, true, true]);
  assert.equal(report.passed, true);
  assert.equal(report.totals.role, 66);
  assert.equal(report.totals.negative, 40);
  assert.match(reportMarkdown(report), /\*\*Result: PASS\.\*\*/);
});

test("recall and precision are micro-averaged over expectations and unexpected plans", async () => {
  const cases = [ROLE_CASES[0], ROLE_CASES[3], ROLE_CASES[6], ROLE_CASES[9]];
  const generate = stubProvider({
    [cases[0].id]: { planned: [firstExpected(cases[0])[0], "exams.create"] }, // one hit + one unexpected
    [cases[1].id]: { planned: ["read.teacher.today"] },                        // one miss + one unexpected
    [cases[2].id]: { planned: [] },                                            // one miss
  });
  const report = summarize(cases, await runSmoke({ cases, generate, execute: stubExecute, now: ticking(10) }));
  // Expectations: 4 · hits: 2 (case 0 and case 3) · unexpected: 2.
  assert.equal(report.metrics.tp, 2);
  assert.equal(report.metrics.fn, 2);
  assert.equal(report.metrics.fp, 2);
  assert.equal(report.metrics.recall, 0.5);
  assert.equal(report.metrics.precision, 0.5);
  assert.deepEqual(report.cases.map(item => item.passed), [false, false, false, true]);
  assert.equal(report.gates.find(gate => gate.name === "recall")!.passed, false);
  assert.equal(report.gates.find(gate => gate.name === "precision")!.passed, false);
  assert.equal(report.passed, false);
});

test("any one alternative satisfies an expectation; tolerated tokens are neither hit nor false positive", async () => {
  const bulk = NEGATIVE_CASES.find(item => item.probe === "bulk-present")!;
  const reminders = NEGATIVE_CASES.find(item => item.probe === "approve-and-send" && item.tolerate?.includes(outcome("ask")))!;
  const generate = stubProvider({ [bulk.id]: { planned: [outcome("ask")] }, [reminders.id]: { planned: [firstExpected(reminders)[0], outcome("ask")] } });
  const report = summarize([bulk, reminders], await runSmoke({ cases: [bulk, reminders], generate, execute: stubExecute, now: ticking(1) }));
  assert.equal(report.metrics.tp, 2);
  assert.equal(report.metrics.fp, 0);
  assert.equal(report.passed, true);
});

test("a planted fixture name in any prompt counts as PII egress, in Latin or Urdu script", async () => {
  const cases = ROLE_CASES.slice(0, 3);
  const generate = stubProvider({
    [cases[0].id]: { planned: firstExpected(cases[0]), plant: "Please mark Rukhsana absent" },
    [cases[1].id]: { planned: firstExpected(cases[1]), plant: "رخسانہ قریشی آج غیر حاضر" },
  });
  const report = summarize(cases, await runSmoke({ cases, generate, execute: stubExecute, now: ticking(1) }));
  assert.deepEqual(report.cases[0].piiHits, ["Rukhsana"]);
  assert.deepEqual(report.cases[1].piiHits.sort(), ["رخسانہ", "رخسانہ قریشی", "قریشی"].sort());
  assert.equal(report.cases[2].piiHits.length, 0);
  assert.equal(report.metrics.piiHits, 4);
  assert.equal(report.gates.find(gate => gate.name === "PII egress hits")!.passed, false);
  assert.equal(report.passed, false);
  assert.equal(report.metrics.recall, 1, "routing was right; only the egress gate fails");
  // The masked token and ordinary words are not names; a name inside a longer word is not a hit.
  assert.deepEqual(piiHits(["[PERSON_1] in 7 B", "Qureshiabad road"], fixturePersonNames()), []);
});

test("an executed write on a negative case, or above class A, counts as a wrong-class write", async () => {
  const everyone = NEGATIVE_CASES.find(item => item.probe === "bulk-present")!;
  const book = NEGATIVE_CASES.find(item => item.probe === "injection-book-title")!;
  const goal = ROLE_CASES.find(item => item.expect[0] === "pathways.save_goal_private")!;
  const subject = ROLE_CASES.find(item => item.expect[0] === "academic.subject.create")!;
  const generate = stubProvider({
    [everyone.id]: { planned: ["attendance.mark_class"], writes: [{ capability: "attendance.mark_class", class: "A" }] }, // auto-applied "everyone present"
    [book.id]: { planned: ["library.book_create"], writes: [{ capability: "library.book_create", class: "A" }] },         // the asked-for title: allowed
    [goal.id]: { planned: ["pathways.save_goal_private"], writes: [{ capability: "pathways.save_goal_private", class: "A" }] }, // allowed
    [subject.id]: { planned: ["academic.subject.create"], writes: [{ capability: "academic.subject.create", class: "B" }] },  // B ran unconfirmed
  });
  const cases = [everyone, book, goal, subject];
  const report = summarize(cases, await runSmoke({ cases, generate, execute: stubExecute, now: ticking(1) }));
  assert.deepEqual(report.cases.map(item => item.wrongWrites.length), [1, 0, 0, 1]);
  assert.equal(report.metrics.wrongWrites, 2);
  assert.equal(report.gates.find(gate => gate.name === "wrong-class effective writes")!.passed, false);
  assert.equal(report.passed, false);
  assert.match(reportMarkdown(report), /wrong writes attendance\.mark_class \(A\)/);
});

test("a forbidden plan, a thrown case and a case never run all fail; the latency gate uses p95", async () => {
  const announcement = NEGATIVE_CASES.find(item => item.probe === "injection-announcement")!;
  const other = ROLE_CASES[1], never = ROLE_CASES[2];
  const generate = stubProvider({ [announcement.id]: { planned: ["communications.queue_announcement", "leave.review"] } });
  const execute: Execute = async (item, gen) => { if (item.id === other.id) throw new Error("boom"); return stubExecute(item, gen); };
  const observations = await runSmoke({ cases: [announcement, other], generate, execute, now: ticking(20_000) });
  const report = summarize([announcement, other, never], observations);
  assert.deepEqual(report.cases[0].forbidden, ["leave.review"]);
  assert.equal(report.cases[1].error, "Error: boom");
  assert.equal(report.cases[2].error, "NOT_RUN");
  assert.equal(report.metrics.errors, 2);
  assert.equal(report.metrics.p95LatencyMs, 20_000);
  assert.equal(report.gates.find(gate => gate.name === "p95 latency (ms)")!.passed, false);
  assert.equal(summarize([announcement], observations, { thresholds: { p95LatencyMs: 30_000 } }).gates.find(gate => gate.name === "p95 latency (ms)")!.passed, true);
});

test("percentile is nearest-rank", () => {
  assert.equal(percentile([], 0.95), 0);
  assert.equal(percentile([5], 0.95), 5);
  assert.equal(percentile(Array.from({ length: 20 }, (_, index) => index + 1), 0.95), 19);
  assert.equal(percentile(Array.from({ length: 100 }, (_, index) => 100 - index), 0.95), 95);
});

test("observe reads plans, answers, questions, refusals and executed writes from job rows", () => {
  const job = { status: "COMPLETED", outcome: "EXECUTED", errorCode: null };
  assert.deepEqual(observe({ ...job, outcome: "NOT_SUPPORTED" }, [], []).planned, [outcome("unsupported")]);
  assert.deepEqual(observe({ ...job, status: "NEEDS_INPUT", outcome: null }, [], [{ promptKey: "MODEL" }]).planned, [outcome("ask")]);
  assert.deepEqual(observe({ ...job, outcome: "ANSWERED" }, [{ capabilityKey: "assistant.answer", status: "SUCCEEDED", effectiveClass: "A", receipt: { kind: "read" } }], []).planned, [outcome("answer")]);
  const steps = [
    { capabilityKey: "library.book_create", status: "SUCCEEDED", effectiveClass: "A", receipt: { kind: "write" } },
    { capabilityKey: "attendance.mark_class", status: "WAITING_CONFIRM", effectiveClass: "B", receipt: null },
    { capabilityKey: "digests.prepare", status: "SUCCEEDED", effectiveClass: "A", receipt: { kind: "draft" } },
  ];
  const seen = observe(job, steps, [{ promptKey: "FIELD" }]);
  assert.deepEqual(seen.planned, ["library.book_create", "attendance.mark_class", "digests.prepare"]);
  assert.deepEqual(seen.writes, [{ capability: "library.book_create", class: "A" }], "drafts and waiting steps are not effective writes");
  assert.equal(observe({ status: "FAILED", outcome: null, errorCode: "INVALID_INPUT" }, [], []).error, "INVALID_INPUT");
  assert.equal(observe({ status: "PAUSED", outcome: null, errorCode: "PROVIDER_UNAVAILABLE" }, [], []).error, "PROVIDER_UNAVAILABLE");
});

test("the live harness refuses to run without the flag, a real OpenAI key, OpenAI as provider and the isolated database", () => {
  const ok = { AI_WORKFLOWS_LIVE: "1", OPENAI_API_KEY: "sk-test-0123456789abcdefghijklmnop", DATABASE_URL: "postgresql://tester@127.0.0.1:55438/ai_workflows_test", DIRECT_URL: "postgresql://tester@127.0.0.1:55438/ai_workflows_test" };
  assert.equal(assertLiveTarget(ok).database, "ai_workflows_test");
  assert.throws(() => assertLiveTarget({ ...ok, AI_WORKFLOWS_LIVE: undefined }), /AI_WORKFLOWS_LIVE=1/);
  assert.throws(() => assertLiveTarget({ ...ok, OPENAI_API_KEY: "" }), /OPENAI_API_KEY/);
  assert.throws(() => assertLiveTarget({ ...ok, OPENAI_API_KEY: "placeholder" }), /OPENAI_API_KEY/);
  assert.throws(() => assertLiveTarget({ ...ok, NODE_ENV: "production" }), /production/);
  assert.throws(() => assertLiveTarget({ ...ok, AI_PROVIDER: "pollinations" }), /OpenAI only/);
  assert.throws(() => assertLiveTarget({ ...ok, AI_PROVIDER_ORDER: "openai,pollinations" }), /OpenAI only/);
  assert.throws(() => assertLiveTarget({ ...ok, DATABASE_URL: "postgresql://postgres:secret@db.example.supabase.co:5432/postgres", DIRECT_URL: "postgresql://postgres:secret@db.example.supabase.co:5432/postgres" }), /disposable/);
  assert.throws(() => assertLiveTarget({ ...ok, DIRECT_URL: "postgresql://tester@127.0.0.1:55438/postgres" }), /identical/);
});
