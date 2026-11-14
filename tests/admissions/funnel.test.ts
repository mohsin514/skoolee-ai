// SKAI-1260: admissions funnel counts by source and year; drafts and other years never count.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFunnel, parseFunnelYear, type FunnelApplication, type FunnelEnquiry } from "../../src/lib/admissions/funnel";

const d = (iso: string) => new Date(`${iso}T09:00:00Z`);
const enquiries: FunnelEnquiry[] = [
  { id: "e1", source: "WEBSITE", createdAt: d("2026-02-01"), convertedStudentId: null },
  { id: "e2", source: "WEBSITE", createdAt: d("2026-03-01"), convertedStudentId: null },
  { id: "e3", source: "REFERRAL", createdAt: d("2026-04-01"), convertedStudentId: "s9" }, // converted directly
  { id: "e4", source: "PHONE", createdAt: d("2025-11-01"), convertedStudentId: null },
];
const app = (id: string, status: string, enquiryId: string | null, created = "2026-05-01", reachedOffer = false): FunnelApplication => ({ id, status, enquiryId, createdAt: d(created), reachedOffer });
const applications: FunnelApplication[] = [
  app("a1", "ENROLLED", "e1"),
  app("a2", "WITHDRAWN", "e2", "2026-05-02", true), // withdrew after an offer
  app("a3", "UNDER_REVIEW", null),
  app("a4", "DRAFT", null),
  app("a5", "OFFERED", "e4", "2025-12-01"),
];

test("counts each stage by source for the chosen year", () => {
  const funnel = buildFunnel(enquiries, applications, 2026);
  assert.deepEqual(funnel.total, { enquiries: 3, applications: 4, offers: 3, enrolled: 2 });
  const web = funnel.bySource.find(row => row.source === "WEBSITE");
  assert.deepEqual(web, { source: "WEBSITE", enquiries: 2, applications: 2, offers: 2, enrolled: 1 });
  assert.deepEqual(funnel.bySource.find(row => row.source === "DIRECT"), { source: "DIRECT", enquiries: 0, applications: 1, offers: 0, enrolled: 0 });
  assert.equal(funnel.conversion.applications, 100); // a3 came in directly; e1, e2 and e3 each became an application
  assert.equal(funnel.conversion.enrolled, 50);
  assert.deepEqual(funnel.years, [2026, 2025]);
});

test("another year only sees its own rows", () => {
  const funnel = buildFunnel(enquiries, applications, 2025);
  assert.deepEqual(funnel.total, { enquiries: 1, applications: 1, offers: 1, enrolled: 0 });
  assert.equal(funnel.bySource[0].source, "PHONE");
});

test("direct applications cannot push the enquiry rate past 100%", () => {
  const direct = Array.from({ length: 17 }, (_, i) => app(`d${i}`, "SUBMITTED", null));
  const funnel = buildFunnel([enquiries[0]], direct, 2026);
  assert.equal(funnel.total.applications, 17);
  assert.equal(funnel.conversion.applications, 0);
});

test("two applications from one enquiry count that enquiry once", () => {
  const funnel = buildFunnel([enquiries[0]], [app("x1", "SUBMITTED", "e1"), app("x2", "SUBMITTED", "e1")], 2026);
  assert.equal(funnel.conversion.applications, 100);
});

test("an empty year has no rates", () => {
  const funnel = buildFunnel([], [], 2024);
  assert.deepEqual(funnel.conversion, { applications: null, offers: null, enrolled: null });
});

test("year parameter is validated", () => {
  const now = d("2026-11-13");
  assert.equal(parseFunnelYear(null, now), 2026);
  assert.equal(parseFunnelYear("2025", now), 2025);
  assert.throws(() => parseFunnelYear("1999", now));
  assert.throws(() => parseFunnelYear("abc", now));
  assert.throws(() => parseFunnelYear("2030", now));
});

// SKAI-1969: the server reads one year; facts from other years arrive as extras and give the same funnel.
test("extras from other years give the same funnel as the whole history", () => {
  const history = buildFunnel(enquiries, applications, 2026);
  const yearOnly = buildFunnel(enquiries.filter(e => e.createdAt.getUTCFullYear() === 2026), applications.filter(a => a.status !== "DRAFT" && a.createdAt.getUTCFullYear() === 2026), 2026, { years: [2025] });
  assert.deepEqual(yearOnly, history);
});

test("a converted enquiry with a later-year application is linked, not enrolled directly", () => {
  const e = [{ id: "c1", source: "PHONE", createdAt: d("2026-12-20"), convertedStudentId: "s1" }];
  assert.equal(buildFunnel(e, [], 2026).total.enrolled, 1);
  const linked = buildFunnel(e, [], 2026, { linked: ["c1"] });
  assert.deepEqual(linked.total, { enquiries: 1, applications: 0, offers: 0, enrolled: 0 });
});
