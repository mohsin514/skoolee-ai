// SKAI-1260: admissions funnel — enquiry → application → offer → enrolled, by source and by year.
// A row's year is the calendar year (UTC) the enquiry or application was first created. An application
// takes its source from the enquiry it came from; one started without an enquiry counts as DIRECT.
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertModuleRead, assertStaffRole } from "@/lib/api/scope";

export const FUNNEL_STAGES = ["enquiries", "applications", "offers", "enrolled"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export type FunnelCounts = Record<FunnelStage, number>;
export type FunnelRow = FunnelCounts & { source: string };
export type Funnel = { year: number; years: number[]; total: FunnelCounts; bySource: FunnelRow[]; conversion: Record<Exclude<FunnelStage, "enquiries">, number | null> };

export type FunnelEnquiry = { id: string; source: string; createdAt: Date; convertedStudentId: string | null };
export type FunnelApplication = { id: string; status: string; createdAt: Date; enquiryId: string | null; reachedOffer: boolean };

/** Statuses that can only follow an offer. WITHDRAWN after an offer is caught by `reachedOffer` (an OFFERED event). */
const AFTER_OFFER = new Set(["OFFERED", "ACCEPTED", "DECLINED", "ENROLLED"]);
const empty = (): FunnelCounts => ({ enquiries: 0, applications: 0, offers: 0, enrolled: 0 });
const yearOf = (date: Date) => date.getUTCFullYear();
const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Pure: builds the funnel for one year from a campus's enquiries and (non-draft) applications. */
export function buildFunnel(enquiries: FunnelEnquiry[], applications: FunnelApplication[], year: number): Funnel {
  const sourceOf = new Map(enquiries.map(enquiry => [enquiry.id, enquiry.source]));
  const linked = new Set(applications.map(application => application.enquiryId).filter(Boolean));
  const rows = new Map<string, FunnelCounts>();
  const bump = (source: string, stage: FunnelStage) => { const row = rows.get(source) ?? empty(); row[stage] += 1; rows.set(source, row); };
  const years = new Set<number>([year]);
  for (const enquiry of enquiries) {
    years.add(yearOf(enquiry.createdAt));
    if (yearOf(enquiry.createdAt) !== year) continue;
    bump(enquiry.source, "enquiries");
    // An enquiry converted straight to a pupil (no application) still ends the funnel as enrolled.
    if (enquiry.convertedStudentId && !linked.has(enquiry.id)) { bump(enquiry.source, "applications"); bump(enquiry.source, "offers"); bump(enquiry.source, "enrolled"); }
  }
  for (const application of applications) {
    years.add(yearOf(application.createdAt));
    if (application.status === "DRAFT" || yearOf(application.createdAt) !== year) continue;
    const source = (application.enquiryId && sourceOf.get(application.enquiryId)) || "DIRECT";
    bump(source, "applications");
    if (application.reachedOffer || AFTER_OFFER.has(application.status)) bump(source, "offers");
    if (application.status === "ENROLLED") bump(source, "enrolled");
  }
  const bySource = [...rows.entries()].map(([source, counts]) => ({ source, ...counts })).sort((a, b) => b.enquiries - a.enquiries || b.applications - a.applications || a.source.localeCompare(b.source));
  const total = bySource.reduce((sum, row) => { for (const stage of FUNNEL_STAGES) sum[stage] += row[stage]; return sum; }, empty());
  return {
    year,
    years: [...years].sort((a, b) => b - a),
    total,
    bySource,
    conversion: { applications: rate(total.applications, total.enquiries), offers: rate(total.offers, total.applications), enrolled: rate(total.enrolled, total.applications) },
  };
}

export function parseFunnelYear(value: string | null, now = new Date()): number {
  if (!value) return now.getUTCFullYear();
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > now.getUTCFullYear() + 1) throw new ApiError("Unknown year", 400);
  return year;
}

/** Campus-scoped funnel; same read check as the rest of the admissions desk. */
export async function admissionsFunnel(user: AuthUser, campusId: string, year: number): Promise<Funnel> {
  assertStaffRole(user);
  await assertModuleRead(user, "admissions");
  const where = { schoolId: user.schoolId, campusId };
  const [enquiries, applications] = await Promise.all([
    prisma.admissionQuery.findMany({ where, select: { id: true, source: true, createdAt: true, convertedStudentId: true } }),
    prisma.admissionApplication.findMany({ where: { ...where, status: { not: "DRAFT" } }, select: { id: true, status: true, createdAt: true, enquiryId: true, events: { where: { toStatus: "OFFERED" }, select: { id: true }, take: 1 } } }),
  ]);
  return buildFunnel(enquiries, applications.map(({ events, ...application }) => ({ ...application, reachedOffer: events.length > 0 })), year);
}
