import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientBaseline, markBaseline } from "@/lib/marks/baseline";

const ABSENT = -1;
const EXEMPT = -2;

describe("markBaseline (SKAI-1616)", () => {
  it("encodes a missing mark row as empty", () => {
    assert.equal(markBaseline(undefined), "");
  });

  it("encodes numeric marks, including zero, as their string", () => {
    assert.equal(markBaseline({ marksObtained: 0 }), "0");
    assert.equal(markBaseline({ marksObtained: 42, isAbsent: false, isExempt: false }), "42");
  });

  it("keeps absent distinct from a stored zero", () => {
    assert.equal(markBaseline({ marksObtained: 0, isAbsent: true }), "ABSENT");
    assert.notEqual(markBaseline({ marksObtained: 0, isAbsent: true }), markBaseline({ marksObtained: 0 }));
  });

  it("encodes exempt results", () => {
    assert.equal(markBaseline({ marksObtained: 0, isExempt: true }), "EXEMPT");
  });
});

describe("clientBaseline (SKAI-1616)", () => {
  it("matches the server encoding for every state the marks dialog can hold", () => {
    assert.equal(clientBaseline(undefined, ABSENT, EXEMPT), markBaseline(undefined));
    assert.equal(clientBaseline(0, ABSENT, EXEMPT), markBaseline({ marksObtained: 0 }));
    assert.equal(clientBaseline(37, ABSENT, EXEMPT), markBaseline({ marksObtained: 37 }));
    assert.equal(clientBaseline(ABSENT, ABSENT, EXEMPT), markBaseline({ marksObtained: 0, isAbsent: true }));
    assert.equal(clientBaseline(EXEMPT, ABSENT, EXEMPT), markBaseline({ marksObtained: 0, isExempt: true }));
  });
});
