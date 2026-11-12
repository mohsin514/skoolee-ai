import { h, groupUser, loadDashboard, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportPipeline } from "../../src/components/insights/metrics";

/**
 * SKAI-1818: the admin and principal consoles read report-card counts by status, not every card the campus ever
 * generated. The pipeline numbers stay the same as counting the rows, and every read stays scoped to the caller's
 * school and campus.
 */

const groups = [
  { status: "GENERATED", isSent: false, deliveryStatus: "NOT_SENT", remarksApproved: false, _count: { _all: 40 } },
  { status: "GENERATED", isSent: false, deliveryStatus: "NOT_SENT", remarksApproved: true, _count: { _all: 5 } },
  { status: "REVIEWED", isSent: false, deliveryStatus: "NOT_SENT", remarksApproved: true, _count: { _all: 12 } },
  { status: "PUBLISHED", isSent: false, deliveryStatus: "QUEUED", remarksApproved: true, _count: { _all: 9 } },
  { status: "SENT", isSent: true, deliveryStatus: "SENT", remarksApproved: true, _count: { _all: 30 } },
  { status: "PUBLISHED", isSent: false, deliveryStatus: "SENT", remarksApproved: false, _count: { _all: 4 } },
];

/** The card rows those groups stand for, as the consoles loaded them before. */
const rows = (withRemarksApproval: boolean) => groups.flatMap(({ _count, remarksApproved, ...fields }) =>
  Array.from({ length: _count._all }, () => (withRemarksApproval ? { ...fields, remarksApproved } : fields)));

const stages = (pipeline: { stage: string; count: number }[]) => pipeline.map(({ stage, count }) => [stage, count]);

const consoles = [
  ["admin", "getCampusDashboardData", user("ADMIN", { isInstitutionOwner: true }), false],
  ["group campus admin", "getCampusDashboardData", groupUser("CAMPUS_ADMIN"), false],
  ["principal", "getPrincipalDashboardData", user("PRINCIPAL"), true],
  ["group principal", "getPrincipalDashboardData", groupUser("PRINCIPAL"), true],
] as const;

for (const [label, loader, session, withRemarksApproval] of consoles) {
  test(`SKAI-1818: ${label} console reads report-card counts scoped to its own school and campus`, async () => {
    const dashboard = await loadDashboard();
    h.session = session;
    h.answers.set("reportCard.groupBy", groups);
    const data: any = await dashboard[loader]();

    assert.deepEqual(data.degraded, []);
    assert.equal(h.calls.some((call) => call.read === "reportCard.findMany"), false, "no report-card rows are loaded");
    assert.equal("recentReportCards" in data, false, "the payload carries counts, not cards");

    const reads = h.calls.filter((call) => call.read === "reportCard.groupBy");
    assert.equal(reads.length, 1);
    assert.deepEqual(reads[0].args.where, { campusId: session.campusId, schoolId: session.schoolId, campus: { schoolId: session.schoolId } });
    assert.equal(reads[0].args.take, undefined, "counts cover every card, so the pipeline totals are complete");

    assert.equal(data.reportCardCounts.reduce((sum: number, row: any) => sum + row.count, 0), 100);
    assert.deepEqual(stages(reportPipeline(data.reportCardCounts)), stages(reportPipeline(rows(withRemarksApproval))));
  });
}

test("SKAI-1818: one school's console never asks for the other school's report cards", async () => {
  const dashboard = await loadDashboard();
  h.session = user("PRINCIPAL");
  await dashboard.getPrincipalDashboardData();
  h.session = groupUser("PRINCIPAL");
  await dashboard.getPrincipalDashboardData();
  const scopes = h.calls.filter((call) => call.read === "reportCard.groupBy").map((call) => [call.args.where.schoolId, call.args.where.campusId]);
  assert.deepEqual(scopes, [["school-standalone", "campus-1"], ["school-group", "campus-g1"]]);
});

for (const role of ["TEACHER", "PARENT"]) {
  test(`SKAI-1818: ${role} is denied both consoles before any report-card read`, async () => {
    const dashboard = await loadDashboard();
    h.session = user(role);
    await assert.rejects(() => dashboard.getCampusDashboardData());
    await assert.rejects(() => dashboard.getPrincipalDashboardData());
    assert.equal(h.calls.some((call) => call.read.startsWith("reportCard.")), false);
  });
}

test("SKAI-1818: the pipeline counts grouped rows exactly like card rows", () => {
  assert.deepEqual(reportPipeline([]), []);
  assert.deepEqual(reportPipeline([{ status: "GENERATED", isSent: false, deliveryStatus: "NOT_SENT", count: 0 }]), []);
  // Principal console (reads remarksApproved): 100 generated, 55 reviewed, 60 approved, 34 sent.
  assert.deepEqual(stages(reportPipeline(rows(true))), [["Generated", 100], ["Reviewed", 55], ["Approved", 60], ["Sent home", 34]]);
  // Campus console never read remarksApproved, so "Approved" counts published and sent cards only.
  assert.deepEqual(stages(reportPipeline(rows(false))), [["Generated", 100], ["Reviewed", 55], ["Approved", 43], ["Sent home", 34]]);
});
