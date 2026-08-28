/**
 * Derivations for the leadership dashboards.
 *
 * Every function here reads only what the existing dashboard payloads already
 * return — no new queries, and nothing invented. Where a payload cannot support
 * a series (no history, no denominator), the function returns an empty array so
 * the card renders its empty state rather than a fabricated trend.
 */

import { fromMinor, GRADE_COLOR, GRADE_ORDER, RAMP_BRAND, STATUS } from "./palette";

/** Matches the server's ON_ROLL filter, so counts agree with the headline. */
const OFF_ROLL = new Set(["inactive", "archived", "transferred", "graduated"]);

export function isOnRoll(student: any): boolean {
  return !OFF_ROLL.has(String(student?.status ?? "active").toLowerCase());
}

function dayKey(value: string | Date): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortDay(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

/* ─── Attendance ─────────────────────────────────────────── */

export interface AttendanceDay {
  key: string;
  label: string;
  present: number;
  absent: number;
  leave: number;
  rate: number;
}

/**
 * Aggregates the per-student attendance rows the dashboard already ships into
 * one row per day it was actually marked. Days nobody was marked simply do not
 * appear — an unmarked day is missing data, not a zero.
 */
export function attendanceTrend(students: any[], days = 21): AttendanceDay[] {
  const byDay = new Map<string, { present: number; absent: number; leave: number }>();

  for (const student of students ?? []) {
    for (const record of student?.attendance ?? []) {
      if (!record?.date) continue;
      const key = dayKey(record.date);
      const bucket = byDay.get(key) ?? { present: 0, absent: 0, leave: 0 };
      if (record.status === "PRESENT") bucket.present += 1;
      else if (record.status === "ABSENT") bucket.absent += 1;
      else if (record.status === "LEAVE") bucket.leave += 1;
      byDay.set(key, bucket);
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-days)
    .map(([key, b]) => {
      const marked = b.present + b.absent + b.leave;
      return {
        key,
        label: shortDay(key),
        present: b.present,
        absent: b.absent,
        leave: b.leave,
        rate: marked > 0 ? Math.round((b.present / marked) * 100) : 0,
      };
    });
}

export interface AttendanceSplit {
  name: string;
  value: number;
  color: string;
}

/** Today's split, as the three states the schema actually has. */
export function attendanceSplit(summary: { present?: number; absent?: number; leave?: number } | undefined): AttendanceSplit[] {
  const s = summary ?? {};
  return [
    { name: "Present", value: s.present ?? 0, color: STATUS.good },
    { name: "Absent", value: s.absent ?? 0, color: STATUS.critical },
    { name: "On leave", value: s.leave ?? 0, color: STATUS.warning },
  ].filter((slice) => slice.value > 0);
}

export function attendanceRate(summary: { present?: number; absent?: number; leave?: number } | undefined): number | null {
  const s = summary ?? {};
  const marked = (s.present ?? 0) + (s.absent ?? 0) + (s.leave ?? 0);
  if (marked === 0) return null;
  return Math.round(((s.present ?? 0) / marked) * 100);
}

/** Per-student attendance rate across their whole marked history. */
export function studentAttendanceRate(student: any): number | null {
  const rows = student?.attendance ?? [];
  if (rows.length === 0) return null;
  const present = rows.filter((r: any) => r.status === "PRESENT").length;
  return Math.round((present / rows.length) * 100);
}

/* ─── Academic performance ───────────────────────────────── */

export interface GradeSlice {
  grade: string;
  count: number;
  color: string;
}

/** Counts letter grades off report cards, kept in report order. */
export function gradeDistribution(reportCards: any[]): GradeSlice[] {
  const counts = new Map<string, number>();
  for (const card of reportCards ?? []) {
    const grade = (card?.grade ?? "").trim().toUpperCase();
    if (!grade) continue;
    counts.set(grade, (counts.get(grade) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      const ai = GRADE_ORDER.indexOf(a[0]);
      const bi = GRADE_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([grade, count]) => ({ grade, count, color: GRADE_COLOR[grade] ?? "#918a95" }));
}

/** The latest report card per student, which is what "current standing" means. */
export function latestReportCards(students: any[]): any[] {
  const cards: any[] = [];
  for (const student of students ?? []) {
    const card = student?.reportCards?.[0];
    if (card) cards.push({ ...card, student });
  }
  return cards;
}

export interface ClassPerformance {
  id: string;
  name: string;
  students: number;
  average: number | null;
  attendance: number | null;
  graded: number;
}

/**
 * Per-class averages, built from the latest report card of each student in the
 * class. Classes where nobody has a graded card yet come back with a null
 * average so the chart can drop them instead of plotting a misleading zero.
 *
 * `studentsByClass` wins over the roster nested on the class: only the payload's
 * top-level student list carries attendance history, and a class average with
 * no attendance beside it is half a picture.
 */
export function classPerformance(classes: any[], studentsByClass?: Map<string, any[]>): ClassPerformance[] {
  return (classes ?? []).map((klass: any) => {
    const roster: any[] = studentsByClass?.get(klass.id) ?? klass.students ?? [];
    const percentages = roster
      .map((s: any) => s?.reportCards?.[0]?.percentage)
      .filter((p: any) => typeof p === "number" && p > 0);
    const rates = roster.map(studentAttendanceRate).filter((r): r is number => r !== null);

    return {
      id: klass.id,
      name: klass.section ? `${klass.name}-${klass.section}` : klass.name,
      students: klass._count?.students ?? roster.length,
      average: percentages.length ? Math.round(percentages.reduce((a: number, b: number) => a + b, 0) / percentages.length) : null,
      attendance: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
      graded: percentages.length,
    };
  });
}

/** Groups the payload's flat student list by class id. */
export function groupByClass(students: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const student of students ?? []) {
    const id = student?.class?.id;
    if (!id) continue;
    const bucket = map.get(id);
    if (bucket) bucket.push(student);
    else map.set(id, [student]);
  }
  return map;
}

export interface ClassStrength {
  name: string;
  students: number;
  subjects: number;
}

export function classStrength(classes: any[]): ClassStrength[] {
  return (classes ?? [])
    .map((k: any) => ({
      name: k.section ? `${k.name}-${k.section}` : k.name,
      students: k._count?.students ?? k.students?.length ?? 0,
      subjects: k._count?.subjects ?? k.subjects?.length ?? 0,
    }))
    .sort((a, b) => b.students - a.students);
}

/* ─── Enrolment ──────────────────────────────────────────── */

export interface EnrolmentMonth {
  key: string;
  label: string;
  joined: number;
  total: number;
}

/**
 * Admissions by month, plus the running roll. Only months from the first
 * enrolment onward are emitted, so a young school does not get a year of
 * flat-zero runway.
 */
export function enrolmentTrend(students: any[], months = 12): EnrolmentMonth[] {
  const dated = (students ?? [])
    .map((s: any) => s?.enrollmentDate)
    .filter(Boolean)
    .map((d: any) => new Date(d))
    .filter((d: Date) => !Number.isNaN(d.getTime()))
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());

  if (dated.length === 0) return [];

  const byMonth = new Map<string, number>();
  for (const d of dated) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }

  // Walk every month from the first admission to now so gaps read as zero
  // admissions rather than as a missing month.
  const start = new Date(dated[0].getFullYear(), dated[0].getMonth(), 1);
  const end = new Date();
  const rows: EnrolmentMonth[] = [];
  let running = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const joined = byMonth.get(key) ?? 0;
    running += joined;
    rows.push({
      key,
      label: cursor.toLocaleDateString(undefined, { month: "short" }),
      joined,
      total: running,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return rows.slice(-months);
}

/* ─── Fees ───────────────────────────────────────────────── */

export interface FeeBucket {
  status: string;
  label: string;
  count: number;
  amount: number;
  color: string;
}

const FEE_LABEL: Record<string, string> = {
  PAID: "Paid",
  PARTIAL: "Part paid",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

const FEE_COLOR: Record<string, string> = {
  PAID: STATUS.good,
  PARTIAL: STATUS.warning,
  PENDING: RAMP_BRAND[1],
  OVERDUE: STATUS.critical,
  CANCELLED: STATUS.neutral,
};

/** Normalises Prisma groupBy rows, whose `_count` is a number in one payload
 *  and an object in another. */
export function feeBuckets(byStatus: any[]): FeeBucket[] {
  return (byStatus ?? [])
    .map((row: any) => {
      const status = String(row.status ?? "").toUpperCase();
      const count = typeof row._count === "number" ? row._count : (row._count?._all ?? 0);
      return {
        status,
        label: FEE_LABEL[status] ?? status,
        count,
        amount: fromMinor(row._sum?.totalAmount ?? 0),
        color: FEE_COLOR[status] ?? STATUS.neutral,
      };
    })
    .filter((b) => b.count > 0 || b.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function collectionRate(buckets: FeeBucket[]): { collected: number; billed: number; rate: number } {
  const billed = buckets.filter((b) => b.status !== "CANCELLED").reduce((sum, b) => sum + b.amount, 0);
  const collected = buckets.filter((b) => b.status === "PAID" || b.status === "PARTIAL").reduce((sum, b) => sum + b.amount, 0);
  return { collected, billed, rate: billed > 0 ? Math.round((collected / billed) * 100) : 0 };
}

/* ─── Report-card pipeline ───────────────────────────────── */

export interface PipelineStage {
  stage: string;
  count: number;
  color: string;
}

/**
 * Where this term's report cards have got to. The stages are cumulative — a
 * sent card is also a generated one — so the shape reads as a funnel rather
 * than as disjoint buckets.
 */
export function reportPipeline(reportCards: any[]): PipelineStage[] {
  const cards = reportCards ?? [];
  if (cards.length === 0) return [];
  const generated = cards.length;
  const reviewed = cards.filter((c: any) => ["REVIEWED", "PUBLISHED", "SENT"].includes(String(c.status).toUpperCase())).length;
  const approved = cards.filter((c: any) => c.remarksApproved === true || ["PUBLISHED", "SENT"].includes(String(c.status).toUpperCase())).length;
  const sent = cards.filter((c: any) => c.isSent === true || String(c.deliveryStatus).toUpperCase() === "SENT").length;

  return [
    { stage: "Generated", count: generated, color: RAMP_BRAND[0] },
    { stage: "Reviewed", count: reviewed, color: RAMP_BRAND[2] },
    { stage: "Approved", count: approved, color: RAMP_BRAND[3] },
    { stage: "Sent home", count: sent, color: RAMP_BRAND[5] },
  ];
}

/* ─── Parent communication ───────────────────────────────── */

export interface CommsBucket {
  label: string;
  value: number;
  color: string;
}

export function commsHealth(summary: Record<string, number> | undefined): CommsBucket[] {
  const s = summary ?? {};
  return [
    { label: "Delivered", value: s.SENT ?? 0, color: STATUS.good },
    { label: "Failed", value: s.FAILED ?? 0, color: STATUS.critical },
    { label: "Blocked", value: s.BLOCKED ?? 0, color: STATUS.warning },
    { label: "No contact", value: s.NO_RECIPIENT ?? 0, color: STATUS.neutral },
  ].filter((b) => b.value > 0);
}

/* ─── Network (super admin) ──────────────────────────────── */

export interface CampusRow {
  id: string;
  name: string;
  city: string;
  students: number;
  classes: number;
  teachers: number;
  staff: number;
  aiRuns: number;
  reportCards: number;
  exams: number;
  messagesSent: number;
  messageIssues: number;
  collected: number;
  billed: number;
  collectionRate: number;
  average: number | null;
  hasAdmin: boolean;
  hasPrincipal: boolean;
}

export function campusRows(campuses: any[]): CampusRow[] {
  return (campuses ?? []).map((campus: any) => {
    const invoice = campus.invoiceSummary ?? {};
    const billed = fromMinor(
      Object.entries(invoice)
        .filter(([status]) => status !== "CANCELLED")
        .reduce((sum, [, v]: [string, any]) => sum + (v?.amount ?? 0), 0),
    );
    const collected = fromMinor(
      ["PAID", "PARTIAL"].reduce((sum, key) => sum + (invoice[key]?.amount ?? 0), 0),
    );

    const percentages = (campus.students ?? [])
      .map((s: any) => s?.reportCards?.[0]?.percentage)
      .filter((p: any) => typeof p === "number" && p > 0);

    const active = (status: any) => status === "Active";

    return {
      id: campus.id,
      name: campus.name,
      city: campus.city ?? "",
      students: campus.studentCount ?? 0,
      classes: campus.classCount ?? 0,
      teachers: campus.teacherCount ?? 0,
      staff: campus.staffCount ?? 0,
      aiRuns: campus.aiUsage?.runs ?? 0,
      reportCards: campus.reportCardCount ?? 0,
      exams: campus.examCount ?? 0,
      messagesSent: campus.communicationSummary?.SENT ?? 0,
      messageIssues: (campus.communicationSummary?.FAILED ?? 0) + (campus.communicationSummary?.BLOCKED ?? 0),
      collected,
      billed,
      collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
      average: percentages.length
        ? Math.round(percentages.reduce((a: number, b: number) => a + b, 0) / percentages.length)
        : null,
      hasAdmin: active(campus.admin?.status),
      hasPrincipal: active(campus.principal?.status),
    };
  });
}

/** Every student across every campus, for network-wide distributions. */
export function networkStudents(campuses: any[]): any[] {
  return (campuses ?? []).flatMap((c: any) => c.students ?? []);
}

export interface StaffMixRow {
  role: string;
  count: number;
}

const ROLE_LABEL: Record<string, string> = {
  CAMPUS_ADMIN: "Campus admin",
  ADMIN: "Admin",
  PRINCIPAL: "Principal",
  TEACHER: "Teacher",
  ACCOUNTANT: "Accountant",
  LIBRARIAN: "Librarian",
  RECEPTIONIST: "Receptionist",
};

export function staffMix(users: any[]): StaffMixRow[] {
  const counts = new Map<string, number>();
  for (const user of users ?? []) {
    const label = ROLE_LABEL[user?.role] ?? user?.role ?? "Staff";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count);
}

/* ─── Ratios ─────────────────────────────────────────────── */

export function ratio(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 10) / 10}:1`;
}

/* ─── Fees, per campus ───────────────────────────────────── */

export interface CampusFeeStack {
  name: string;
  Paid: number;
  "Part paid": number;
  Pending: number;
  Overdue: number;
  billed: number;
}

/** Fee book per campus, as amounts, ready for a stacked bar. */
export function campusFeeStack(campuses: any[]): CampusFeeStack[] {
  return (campuses ?? [])
    .map((campus: any) => {
      const summary = campus.invoiceSummary ?? {};
      const amount = (key: string) => fromMinor(summary[key]?.amount ?? 0);
      const row = {
        name: campus.name,
        Paid: amount("PAID"),
        "Part paid": amount("PARTIAL"),
        Pending: amount("PENDING"),
        Overdue: amount("OVERDUE"),
      };
      return { ...row, billed: row.Paid + row["Part paid"] + row.Pending + row.Overdue };
    })
    .filter((row) => row.billed > 0);
}

export const FEE_STACK_KEYS = ["Paid", "Part paid", "Pending", "Overdue"] as const;

export const FEE_STACK_COLOR: Record<string, string> = {
  Paid: STATUS.good,
  "Part paid": STATUS.warning,
  Pending: RAMP_BRAND[1],
  Overdue: STATUS.critical,
};
