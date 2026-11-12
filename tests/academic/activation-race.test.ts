import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isActivationRace } from "../../src/lib/academic/cycle-rules";
import { subjectMappingMessage } from "../../src/lib/academic/model-config";

describe("SKAI-208 concurrent activation", () => {
  it("treats serialization failures and claim conflicts as a race", () => {
    assert.equal(isActivationRace({ code: "P2034" }), true);
    assert.equal(isActivationRace({ code: "P2025" }), true);
    assert.equal(isActivationRace({ status: 409 }), true);
  });
  it("lets unrelated failures surface", () => {
    assert.equal(isActivationRace(new Error("boom")), false);
    assert.equal(isActivationRace({ status: 403 }), false);
    assert.equal(isActivationRace(null), false);
  });
});

describe("SKAI-208 subject mapping message", () => {
  it("names leftover mappings when nothing is missing", () => {
    const message = subjectMappingMessage(0, 2);
    assert.ok(!message.includes("0 "));
    assert.ok(message.includes("2 mappings point"));
  });
  it("uses correct plurals", () => {
    assert.ok(subjectMappingMessage(1, 0).includes("1 class subject still needs a curriculum match"));
    assert.ok(subjectMappingMessage(3, 1).includes("3 class subjects still need"));
    assert.ok(subjectMappingMessage(3, 1).includes("1 mapping points"));
  });
});
