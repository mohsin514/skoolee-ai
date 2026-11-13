import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { definitionProblems, priorityScore, rankByPriority, starterDefinition, type FormDefinition } from "../../src/lib/admissions/form-rules";

// SKAI-1261: configurable priority criteria and the score used to rank offers.
const form = (): FormDefinition => {
  const definition = starterDefinition();
  definition.fields.push(
    { key: "hasSibling", type: "select", required: false, label: { en: "Sibling at the school?" }, options: [{ value: "yes", label: { en: "Yes" } }, { value: "no", label: { en: "No" } }] },
    { key: "zone", type: "text", required: false, label: { en: "Catchment zone" } },
    { key: "siblingName", type: "text", required: false, label: { en: "Sibling name" }, showIf: { field: "hasSibling", equals: "yes" } },
  );
  definition.priorityCriteria = [
    { label: { en: "Sibling" }, field: "hasSibling", equals: "yes", points: 10 },
    { label: { en: "Catchment" }, field: "zone", equals: "A", points: 5 },
    { label: { en: "Named sibling" }, field: "siblingName", equals: "Sara", points: 1 },
  ];
  return definition;
};

describe("priority criteria", () => {
  it("accepts a valid set and rejects bad criteria", () => {
    assert.deepEqual(definitionProblems(form()), []);
    const bad = form();
    bad.priorityCriteria = [{ label: { en: "" }, field: "missing", equals: "", points: 0 }];
    const problems = definitionProblems(bad).join(" ");
    assert.ok(problems.includes("write the English name"));
    assert.ok(problems.includes("question on this form"));
    assert.ok(problems.includes("answer that earns the points"));
    assert.ok(problems.includes("not 0"));
  });

  it("sums the met criteria, ignoring case and hidden questions", () => {
    assert.equal(priorityScore(form(), { hasSibling: "yes", zone: "a", siblingName: "Sara" }).score, 16);
    // siblingName is hidden when hasSibling is "no", so a stale answer earns nothing.
    assert.deepEqual(priorityScore(form(), { hasSibling: "no", zone: "B", siblingName: "Sara" }), { score: 0, met: [] });
    assert.deepEqual(priorityScore(starterDefinition(), { childName: "x" }), { score: 0, met: [] });
  });

  it("ranks highest score first, earliest submission on ties, unscored last", () => {
    const day = (d: number) => new Date(Date.UTC(2026, 0, d));
    const rows = [
      { id: "none", priorityScore: null, submittedAt: day(1) },
      { id: "late10", priorityScore: 10, submittedAt: day(5) },
      { id: "early10", priorityScore: 10, submittedAt: day(2) },
      { id: "five", priorityScore: 5, submittedAt: day(1) },
    ];
    assert.deepEqual(rankByPriority(rows, true).map(row => row.id), ["early10", "late10", "five", "none"]);
    assert.equal(rankByPriority(rows, false), rows);
  });
});
