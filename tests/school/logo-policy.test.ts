import { test } from "node:test";
import assert from "node:assert/strict";
import { LOGO_MAX_BYTES, logoFileProblem, logoKeyInScope } from "@/lib/school/logo-policy";
import { parseLogo } from "@/lib/school/details";

const A = { schoolId: "school-a" };
const B = { schoolId: "school-b" };

test("raster logos within the size limit are accepted", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) assert.equal(logoFileProblem(type, 10_000), null);
});

test("SVG and non-images are refused by type", () => {
  assert.equal(logoFileProblem("image/svg+xml", 1_000), "type");
  assert.equal(logoFileProblem("application/pdf", 1_000), "type");
});

test("empty and oversized files are refused by size", () => {
  assert.equal(logoFileProblem("image/png", 0), "size");
  assert.equal(logoFileProblem("image/png", LOGO_MAX_BYTES), null);
  assert.equal(logoFileProblem("image/png", LOGO_MAX_BYTES + 1), "size");
});

test("school logo keys must sit under the caller's own school", () => {
  assert.equal(logoKeyInScope("logos/school/school-a/x.png", A), true);
  assert.equal(logoKeyInScope("logos/school/school-b/x.png", A), false);
  assert.equal(logoKeyInScope("logos/school/school-a/", A), false);
  assert.equal(logoKeyInScope("logos/school/school-a/../school-b/x.png", A), false);
  assert.equal(logoKeyInScope("logos/campus/school-a/c1/x.png", A), false);
});

test("campus logo keys must sit under the caller's school and that campus", () => {
  assert.equal(logoKeyInScope("logos/campus/school-a/c1/x.png", { schoolId: "school-a", campusId: "c1" }), true);
  assert.equal(logoKeyInScope("logos/campus/school-a/c2/x.png", { schoolId: "school-a", campusId: "c1" }), false);
  assert.equal(logoKeyInScope("logos/campus/school-b/c1/x.png", { schoolId: "school-a", campusId: "c1" }), false);
});

test("parseLogo keeps own keys, clears blanks and refuses another tenant's key", () => {
  assert.equal(parseLogo("logos/school/school-a/x.png", A), "logos/school/school-a/x.png");
  assert.equal(parseLogo("  ", A), null);
  assert.equal(parseLogo(null, A), null);
  assert.throws(() => parseLogo("logos/school/school-a/x.png", B), /does not belong/);
});

test("parseLogo refuses SVG data URIs but keeps raster ones and https URLs", () => {
  assert.throws(() => parseLogo("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", A));
  assert.equal(parseLogo("data:image/png;base64,iVBORw0KGgo=", A), "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(parseLogo("https://cdn.example.test/crest.png", A), "https://cdn.example.test/crest.png");
});
