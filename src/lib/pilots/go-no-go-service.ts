import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { measureFinding, timeFinding, type MeasureRow, type ObservationRow } from "./findings";
import { evaluateGoNoGo, type GoNoGoResult } from "./go-no-go";
import { pilotActivationGate, schoolPilotRecords } from "./readiness-service";

/**
 * SKAI-1102 read-only board: one row per measurement pilot linked to a school. Every figure comes from
 * the existing SKO-430 findings and SKAI-1017/1018 records; nothing is written. Platform owner only.
 */
export type GoNoGoRow = { pilotId: string; pilotName: string; status: string; synthetic: boolean; schoolId: string; schoolName: string; result: GoNoGoResult };

const workflowKeys = (workflows: Prisma.JsonValue) => (Array.isArray(workflows) ? (workflows as { key: string }[]).map((w) => w.key) : []);

export async function goNoGoBoard(now = new Date()): Promise<GoNoGoRow[]> {
  const pilots = await prisma.pilot.findMany({ where: { targetSchoolId: { not: null } }, orderBy: [{ synthetic: "asc" }, { createdAt: "desc" }], take: 100 });
  const schoolIds = [...new Set(pilots.map((p) => p.targetSchoolId!))];
  const schools = await prisma.school.findMany({ where: { id: { in: schoolIds }, status: { not: "DELETED" } }, select: { id: true, name: true } });
  const names = new Map(schools.map((s) => [s.id, s.name]));

  const rows: GoNoGoRow[] = [];
  for (const pilot of pilots) {
    const schoolId = pilot.targetSchoolId!;
    if (!names.has(schoolId)) continue;
    const [observations, measures, records, gate] = await Promise.all([
      prisma.pilotObservation.findMany({ where: { pilotId: pilot.id }, take: 2000 }),
      prisma.pilotMeasure.findMany({ where: { pilotId: pilot.id }, take: 2000 }),
      schoolPilotRecords(schoolId),
      pilotActivationGate(schoolId, now),
    ]);
    const rate = (kind: string) => { const f = measureFinding(kind, null, measures as MeasureRow[]); return { value: f.rate, withheld: f.rateWithheld }; };
    const times = workflowKeys(pilot.workflows).map((w) => timeFinding(w, observations as ObservationRow[]));
    const measured = times.filter((t) => t.changePercent != null).map((t) => t.changePercent!);
    const taskTimeChange = measured.length
      ? { value: Math.max(...measured), withheld: null }
      : { value: null, withheld: times.find((t) => t.percentWithheld)?.percentWithheld ?? "No paired task-time findings." };
    const result = evaluateGoNoGo({
      gate: records.readiness.length ? gate : null,
      decision: records.readiness[0]?.outcome ?? null,
      commercialStage: records.events[0]?.stage ?? null,
      teacherUsage: rate("WEEKLY_ACTIVE"),
      paperAcceptance: rate("CORRECTNESS_FINAL"),
      taskTimeChange,
    });
    rows.push({ pilotId: pilot.id, pilotName: pilot.name, status: pilot.status, synthetic: pilot.synthetic, schoolId, schoolName: names.get(schoolId)!, result });
  }
  return rows;
}
