import assert from "node:assert/strict";
import test from "node:test";
import { buildExpectedMarks, expectedBaselineToken } from "../../src/lib/marks/expected-baseline";

const ABSENT = -1;
const EXEMPT = -2;

test("SKAI-1616: a numeric baseline is sent as its score, a missing row as empty", () => {
  assert.equal(expectedBaselineToken(45, ABSENT, EXEMPT), "45");
  assert.equal(expectedBaselineToken(0, ABSENT, EXEMPT), "0");
  assert.equal(expectedBaselineToken(undefined, ABSENT, EXEMPT), "");
});

test("SKAI-1616: absent and exempt baselines keep their own tokens", () => {
  assert.equal(expectedBaselineToken(ABSENT, ABSENT, EXEMPT), "ABSENT");
  assert.equal(expectedBaselineToken(EXEMPT, ABSENT, EXEMPT), "EXEMPT");
});

test("SKAI-1616: every edited cell gets a baseline, including new and two-school pupils", () => {
  const saved = { "pupilA:math": 40, "pupilB:math": ABSENT, "pupilC:math": EXEMPT };
  const entries = [
    { studentId: "pupilA", subjectId: "math" },
    { studentId: "pupilB", subjectId: "math" },
    { studentId: "pupilC", subjectId: "math" },
    { studentId: "pupilNew", subjectId: "math" },
    { studentId: "otherSchoolPupil", subjectId: "math" },
  ];
  assert.deepEqual(buildExpectedMarks(entries, saved, ABSENT, EXEMPT), {
    "pupilA:math": "40",
    "pupilB:math": "ABSENT",
    "pupilC:math": "EXEMPT",
    "pupilNew:math": "",
    "otherSchoolPupil:math": "",
  });
});
