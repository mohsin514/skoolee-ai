/**
 * SKO-453 scenario evaluation. Pure and deterministic: a baseline snapshot plus assumptions give the
 * same result every time, and nothing here reads or writes live records.
 *
 * Units are explicit: students, sections, rooms and teaching periods per week. Costs are estimates
 * entered by the planner, kept apart from any verified amount, and unknown when not entered.
 */

export interface BaselineData {
  teachingDays: number;
  periodsPerDay: number;
  grades: { grade: string; sections: { classId: string; label: string; capacity: number | null; enrolled: number }[] }[];
  rooms: { id: string; roomNumber: string; type: string; seats: number }[];
  /** Periods per section per week by subject, and the room type those periods use. */
  subjects: { grade: string; subject: string; periodsPerSection: number; roomType: string }[];
  teachers: { userId: string; name: string; contracted: number | null; load: { subject: string; periods: number }[] }[];
}

export interface Assumptions {
  classCap: number;
  intake: { grade: string; students: number }[];
  subjectNeeds: { grade?: string | null; subject: string; periodsPerSection: number; roomType: string }[];
  addRooms: { type: string; count: number; seats: number }[];
  teacherChanges: { userId?: string | null; name?: string | null; subject?: string | null; periodsPerWeek: number }[];
  costs: { currency?: string | null; teacherAnnual?: { low: number; high: number } | null; roomAnnual?: { low: number; high: number } | null };
}

export type Link = { kind: "room" | "staff" | "subject" | "class"; id?: string; label: string };
export interface Finding { severity: "HARD" | "WARNING" | "UNMODELED"; code: string; message: string; needed?: number; available?: number; unit?: string; links: Link[] }
export interface Result {
  provisional: boolean;
  missing: { code: string; detail: string }[];
  sections: { grade: string; students: number; existing: number; needed: number; added: number }[];
  metrics: { students: number; sections: number; sectionsAdded: number; roomsAdded: number; teachersAdded: number; periodsPerWeek: number };
  findings: Finding[];
  sensitivity: { intakeChange: number; sections: number; hardConflicts: number }[];
  costs: { label: "Estimate"; currency: string | null; teachers: { low: number; high: number } | null; rooms: { low: number; high: number } | null; unknown: string[] };
}

export const UNMODELED = [
  "Transport routes and travel time between buildings or campuses",
  "Local occupancy, safety and licensing rules",
  "Teacher qualifications beyond the subjects they teach today",
  "Part-day timing, shifts and break supervision",
];

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function sectionsFor(base: BaselineData, a: Assumptions, intakeFactor: number) {
  return base.grades.map((g) => {
    const enrolled = sum(g.sections.map((s) => s.enrolled));
    const extra = sum(a.intake.filter((i) => i.grade === g.grade).map((i) => i.students));
    const students = Math.max(0, Math.round(enrolled + extra * intakeFactor));
    const needed = students === 0 ? 0 : Math.ceil(students / Math.max(1, a.classCap));
    return { grade: g.grade, students, existing: g.sections.length, needed, added: Math.max(0, needed - g.sections.length) };
  });
}

/** Subject demand per grade: the baseline, overridden by any assumption for that subject. */
function demand(base: BaselineData, a: Assumptions) {
  const rows = new Map<string, { grade: string; subject: string; periodsPerSection: number; roomType: string }>();
  for (const s of base.subjects) rows.set(`${s.grade}\u0000${s.subject}`, { ...s });
  for (const n of a.subjectNeeds) {
    for (const g of base.grades.filter((g) => !n.grade || g.grade === n.grade)) rows.set(`${g.grade}\u0000${n.subject}`, { grade: g.grade, subject: n.subject, periodsPerSection: n.periodsPerSection, roomType: n.roomType });
  }
  return [...rows.values()];
}

function evaluateOnce(base: BaselineData, a: Assumptions, intakeFactor: number) {
  const sections = sectionsFor(base, a, intakeFactor);
  const findings: Finding[] = [];
  const missing: Result["missing"] = [];
  const slotsPerRoom = base.teachingDays * base.periodsPerDay;
  const rooms = [...base.rooms];
  a.addRooms.forEach((r, i) => { for (let n = 0; n < r.count; n++) rooms.push({ id: `new-${i}-${n}`, roomNumber: `New ${r.type.toLowerCase()} ${n + 1}`, type: r.type, seats: r.seats }); });
  const totalSections = sum(sections.map((s) => s.needed));
  const sectionsBy = new Map(sections.map((s) => [s.grade, s.needed]));

  // Home rooms and seats.
  const classrooms = rooms.filter((r) => r.type === "CLASSROOM");
  if (totalSections > classrooms.length) findings.push({ severity: "HARD", code: "HOME_ROOMS", message: `${totalSections} sections need a home classroom; ${classrooms.length} classrooms exist.`, needed: totalSections, available: classrooms.length, unit: "rooms", links: classrooms.map((r) => ({ kind: "room", id: r.id, label: r.roomNumber })) });
  const students = sum(sections.map((s) => s.students));
  const seats = sum(classrooms.map((r) => r.seats));
  if (students > seats) findings.push({ severity: "HARD", code: "SEATS", message: `${students} students and ${seats} classroom seats.`, needed: students, available: seats, unit: "seats", links: classrooms.map((r) => ({ kind: "room", id: r.id, label: r.roomNumber })) });
  for (const r of classrooms) {
    if (!r.seats) missing.push({ code: "ROOM_SEATS", detail: `Room ${r.roomNumber} has no recorded seats.` });
    else if (r.seats < a.classCap) findings.push({ severity: "WARNING", code: "ROOM_BELOW_CAP", message: `Room ${r.roomNumber} seats ${r.seats}, below the class cap of ${a.classCap}.`, needed: a.classCap, available: r.seats, unit: "seats", links: [{ kind: "room", id: r.id, label: r.roomNumber }] });
  }

  // Specialist rooms: periods needed against periods those rooms can host.
  const subjects = demand(base, a);
  for (const type of [...new Set(subjects.map((s) => s.roomType).filter((t) => t !== "CLASSROOM"))]) {
    const users = subjects.filter((s) => s.roomType === type);
    const needed = sum(users.map((s) => (sectionsBy.get(s.grade) ?? 0) * s.periodsPerSection));
    const typed = rooms.filter((r) => r.type === type);
    const available = typed.length * slotsPerRoom;
    if (needed > available) findings.push({ severity: "HARD", code: "ROOM_TYPE_PERIODS", message: `${needed - available} ${type.toLowerCase()} periods are missing: ${needed} needed each week, ${available} available.`, needed, available, unit: "periods per week", links: [...typed.map((r) => ({ kind: "room" as const, id: r.id, label: r.roomNumber })), ...users.map((s) => ({ kind: "subject" as const, label: `${s.grade} · ${s.subject} · ${s.periodsPerSection}/section` }))] });
  }

  // Staffing by subject. A teacher's availability is split across subjects by today's load.
  const changes = new Map(a.teacherChanges.filter((c) => c.userId).map((c) => [c.userId!, c.periodsPerWeek]));
  const supply = new Map<string, { periods: number; staff: Link[] }>();
  const add = (subject: string, periods: number, link: Link) => { const e = supply.get(subject) ?? { periods: 0, staff: [] }; e.periods += periods; e.staff.push(link); supply.set(subject, e); };
  for (const t of base.teachers) {
    const current = sum(t.load.map((l) => l.periods));
    const capacity = changes.get(t.userId) ?? t.contracted;
    if (capacity == null) missing.push({ code: "STAFF_AVAILABILITY", detail: `${t.name} has no contracted periods per week; today's ${current} periods are used.` });
    const available = capacity ?? current;
    if (changes.has(t.userId) && available < current) findings.push({ severity: "WARNING", code: "AVAILABILITY_BELOW_LOAD", message: `${t.name} would be available for ${available} periods but teaches ${current} today.`, needed: current, available, unit: "periods per week", links: [{ kind: "staff", id: t.userId, label: t.name }] });
    for (const l of t.load) add(l.subject, current ? (available * l.periods) / current : 0, { kind: "staff", id: t.userId, label: t.name });
  }
  let teachersAdded = 0;
  for (const c of a.teacherChanges.filter((c) => !c.userId && c.subject)) { teachersAdded++; add(c.subject!, c.periodsPerWeek, { kind: "staff", label: c.name || `New ${c.subject} teacher` }); }
  for (const subject of [...new Set(subjects.map((s) => s.subject))]) {
    const rows = subjects.filter((s) => s.subject === subject);
    const needed = sum(rows.map((s) => (sectionsBy.get(s.grade) ?? 0) * s.periodsPerSection));
    const have = Math.floor(supply.get(subject)?.periods ?? 0);
    if (needed > have) findings.push({ severity: "HARD", code: "STAFF_PERIODS", message: `${subject}: ${needed} teaching periods needed each week, ${have} available from current staff.`, needed, available: have, unit: "periods per week", links: [...(supply.get(subject)?.staff ?? []), ...rows.map((s) => ({ kind: "subject" as const, label: `${s.grade} · ${s.subject} · ${s.periodsPerSection}/section` }))] });
  }
  for (const s of sections.filter((s) => s.added > 0)) findings.push({ severity: "WARNING", code: "NEW_SECTION", message: `${s.grade} needs ${s.added} more section(s) for ${s.students} students at a cap of ${a.classCap}.`, needed: s.needed, available: s.existing, unit: "sections", links: [{ kind: "class", label: s.grade }] });

  return { sections, findings, missing, teachersAdded, roomsAdded: sum(a.addRooms.map((r) => r.count)), totalSections, students, slotsPerRoom };
}

export function evaluate(base: BaselineData, a: Assumptions, baselineMissing: { code: string; detail: string }[] = []): Result {
  const run = evaluateOnce(base, a, 1);
  const findings = [...run.findings, ...UNMODELED.map((m) => ({ severity: "UNMODELED" as const, code: "UNMODELED", message: m, links: [] }))];
  const missing = [...baselineMissing, ...run.missing];
  const range = (r: { low: number; high: number } | null | undefined, n: number) => (r && n ? { low: r.low * n, high: r.high * n } : n ? null : { low: 0, high: 0 });
  const unknown: string[] = [];
  const teachers = range(a.costs.teacherAnnual, run.teachersAdded);
  const roomsCost = range(a.costs.roomAnnual, run.roomsAdded);
  if (!teachers) unknown.push("Teacher cost not entered");
  if (!roomsCost) unknown.push("Room cost not entered");
  return {
    provisional: missing.length > 0,
    missing,
    sections: run.sections,
    metrics: { students: run.students, sections: run.totalSections, sectionsAdded: sum(run.sections.map((s) => s.added)), roomsAdded: run.roomsAdded, teachersAdded: run.teachersAdded, periodsPerWeek: run.slotsPerRoom },
    findings,
    sensitivity: [-10, 10].map((pct) => { const r = evaluateOnce(base, a, 1 + pct / 100); return { intakeChange: pct, sections: r.totalSections, hardConflicts: r.findings.filter((f) => f.severity === "HARD").length }; }),
    costs: { label: "Estimate", currency: a.costs.currency ?? null, teachers, rooms: roomsCost, unknown },
  };
}
