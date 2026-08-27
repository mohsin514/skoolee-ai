/**
 * The staff hierarchy: ranks, units, reporting lines and service history.
 *
 * Four things are deliberately kept apart here, because institutions treat
 * them as four different facts about a person and conflating them is what
 * makes staff modules unusable outside the one school they were built for:
 *
 *   RANK        what they are — Senior Teacher, Associate Professor.
 *               A row in `staff_designations`, defined by the tenant.
 *   UNIT        where they sit — Science, Faculty of Engineering, Accounts.
 *               A row in `departments`, which nests.
 *   POST        what they run — Head of Science, Acting Principal.
 *               A HEAD/DEPUTY_HEAD row in `department_members`, held ON TOP
 *               of a rank and transferable without touching the rank.
 *   LINE        who they answer to — one solid line on the profile, plus any
 *               number of dotted/functional lines in `staff_reporting_lines`.
 *
 * Every position change writes a `staff_appointments` row, so a promotion is
 * not an in-place edit that loses what came before: the old row is closed, a
 * new one opened, and the service record stays reconstructable years later
 * even after the rank has been renamed and the manager has left.
 */

import {
  Prisma,
  type Department,
  type DepartmentRole,
  type StaffAppointment,
  type StaffChangeKind,
  type StaffDesignation,
  type StaffEmploymentStatus,
  type StaffEmploymentType,
} from "@prisma/client";
import { prisma, tenantTransaction, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { ApiError } from "@/lib/api/scope";
import type { AuthUser } from "@/lib/auth";
import {
  ENDED_STATUSES,
  INSTITUTION_PRESETS,
  type InstitutionType,
} from "./hierarchy-presets";

/** How far a reporting chain is walked before we call it a runaway. Real
 *  hierarchies are ~6 deep; a university with faculties reaches maybe 8. */
const MAX_CHAIN_DEPTH = 64;

/**
 * Binds the tenant for a multi-statement write.
 *
 * Route handlers normally let the Prisma guard derive the school from the
 * session cookie, but `tenantTransaction` reads the context directly and would
 * find nothing. Binding it here keeps the guard fail-closed rather than
 * working around it.
 */
function inTenant<T>(user: AuthUser, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return runWithTenantContext({ schoolId: user.schoolId, userId: user.userId }, () =>
    tenantTransaction(fn)
  );
}

// ─────────────────────────────────────────────────────────────────
// Seeding a tenant's ladder
// ─────────────────────────────────────────────────────────────────

/**
 * Seeds the designation ladder and unit tree for an institution type.
 *
 * Idempotent by name: anything the tenant already has is left exactly as it
 * is, so re-applying a preset tops up what is missing instead of resetting
 * work. That matters because the only safe way to offer "switch to the college
 * ladder" on a live school is for it to be additive — ranks already assigned
 * to staff must never disappear underneath them.
 */
export async function applyInstitutionPreset(opts: {
  user: AuthUser;
  campusId: string;
  type: InstitutionType;
}): Promise<{ designationsAdded: number; departmentsAdded: number }> {
  const preset = INSTITUTION_PRESETS[opts.type];
  if (!preset) throw new ApiError(`Unknown institution type "${opts.type}"`, 400);

  return inTenant(opts.user, async (tx) => {
    // ── Ranks ───────────────────────────────────────────────
    const existingRanks = await tx.staffDesignation.findMany({ select: { id: true, name: true } });
    const rankIdByName = new Map(existingRanks.map((d) => [d.name.toLowerCase(), d.id]));

    // An institution head is unique. If the tenant already has one, the
    // preset's own head is seeded as an ordinary leadership rank rather than
    // quietly creating a second root for the chart.
    const headTaken = (await tx.staffDesignation.count({ where: { isInstitutionHead: true } })) > 0;

    let designationsAdded = 0;
    let claimedHead = headTaken;

    for (const [index, seed] of preset.designations.entries()) {
      if (rankIdByName.has(seed.name.toLowerCase())) continue;

      const isHead = Boolean(seed.isInstitutionHead) && !claimedHead;
      if (isHead) claimedHead = true;

      const created = await tx.staffDesignation.create({
        data: {
          name: seed.name,
          shortName: seed.shortName ?? null,
          level: seed.level,
          track: seed.track,
          canHeadDepartment: seed.canHeadDepartment ?? false,
          isInstitutionHead: isHead,
          minYearsInRank: seed.minYearsInRank ?? null,
          description: seed.description ?? null,
          sortOrder: index,
        },
        select: { id: true, name: true },
      });
      rankIdByName.set(created.name.toLowerCase(), created.id);
      designationsAdded += 1;
    }

    // Second pass: the ladder's own links, now that every rank has an id.
    // Only filled where empty, so a tenant's rewiring is never overwritten.
    for (const seed of preset.designations) {
      if (!seed.promotesTo) continue;
      const selfId = rankIdByName.get(seed.name.toLowerCase());
      const targetId = rankIdByName.get(seed.promotesTo.toLowerCase());
      if (!selfId || !targetId || selfId === targetId) continue;
      await tx.staffDesignation.updateMany({
        where: { id: selfId, promotesToId: null },
        data: { promotesToId: targetId },
      });
    }

    // ── Units ───────────────────────────────────────────────
    const existingUnits = await tx.department.findMany({
      where: { campusId: opts.campusId },
      select: { id: true, name: true },
    });
    const unitIdByName = new Map(existingUnits.map((d) => [d.name.toLowerCase(), d.id]));

    let departmentsAdded = 0;

    // Parents before children, so a faculty exists before its departments
    // try to point at it.
    const ordered = [...preset.departments].sort((a, b) => Number(!!a.parent) - Number(!!b.parent));

    for (const [index, seed] of ordered.entries()) {
      if (unitIdByName.has(seed.name.toLowerCase())) continue;
      const parentId = seed.parent ? unitIdByName.get(seed.parent.toLowerCase()) ?? null : null;

      const created = await tx.department.create({
        data: {
          campusId: opts.campusId,
          name: seed.name,
          code: seed.code ?? null,
          kind: seed.kind,
          parentId,
          sortOrder: index,
        },
        select: { id: true, name: true },
      });
      unitIdByName.set(created.name.toLowerCase(), created.id);
      departmentsAdded += 1;
    }

    await tx.school.update({
      where: { id: opts.user.schoolId },
      data: { institutionType: opts.type },
    });

    return { designationsAdded, departmentsAdded };
  });
}

// ─────────────────────────────────────────────────────────────────
// Reporting lines
// ─────────────────────────────────────────────────────────────────

/**
 * Refuses a reporting line that would close a loop.
 *
 * A cycle is not a cosmetic problem: the org chart walks the chain to lay
 * nodes out, and payroll approval and leave escalation both walk it upwards
 * looking for someone senior. A → B → A hangs all three. The check runs
 * before the write, every time, including when a manager is reassigned to
 * someone who happens to sit below them today.
 */
export async function assertNoReportingCycle(
  client: TxClient | typeof prisma,
  userId: string,
  managerId: string | null | undefined
): Promise<void> {
  if (!managerId) return;
  if (managerId === userId) {
    throw new ApiError("A staff member cannot report to themselves", 400);
  }

  let cursor: string | null = managerId;
  for (let depth = 0; depth < MAX_CHAIN_DEPTH && cursor; depth += 1) {
    const profile: { reportsToId: string | null } | null = await client.staffProfile.findUnique({
      where: { userId: cursor },
      select: { reportsToId: true },
    });
    cursor = profile?.reportsToId ?? null;
    if (cursor === userId) {
      throw new ApiError(
        "That would create a reporting loop — the person you picked already reports to this staff member, directly or through someone else.",
        400
      );
    }
  }

  if (cursor) {
    throw new ApiError("The reporting chain above that person is too deep to verify", 400);
  }
}

/** Walks upward from a staff member and returns their chain of managers,
 *  nearest first. Used for approval routing and for the chart's breadcrumb. */
export async function getReportingChain(userId: string, limit = MAX_CHAIN_DEPTH) {
  const chain: Array<{ id: string; fullName: string; designation: string | null }> = [];
  let cursor = userId;

  for (let depth = 0; depth < limit; depth += 1) {
    const profile = await prisma.staffProfile.findUnique({
      where: { userId: cursor },
      select: {
        reportsToId: true,
        reportsTo: {
          select: { id: true, fullName: true, staffProfile: { select: { designation: true } } },
        },
      },
    });

    const manager = profile?.reportsTo;
    if (!manager) break;
    chain.push({
      id: manager.id,
      fullName: manager.fullName,
      designation: manager.staffProfile?.designation ?? null,
    });
    cursor = manager.id;
  }

  return chain;
}

// ─────────────────────────────────────────────────────────────────
// Position changes
// ─────────────────────────────────────────────────────────────────

export interface PositionChange {
  designationId?: string | null;
  primaryDepartmentId?: string | null;
  reportsToId?: string | null;
  employmentType?: StaffEmploymentType;
  employmentStatus?: StaffEmploymentStatus;
  employeeCode?: string | null;
  basicSalary?: number;
  probationEndsAt?: Date | null;
  contractEndsAt?: Date | null;
  /** Backdating is normal — an office order dated last month. */
  effectiveFrom?: Date;
  /** Override the inferred kind, e.g. to record a sideways move as a promotion. */
  changeKind?: StaffChangeKind;
  isActing?: boolean;
  orderRef?: string | null;
  notes?: string | null;
}

interface PositionSnapshot {
  designationId: string | null;
  designationName: string | null;
  level: number | null;
  departmentId: string | null;
  departmentName: string | null;
  reportsToId: string | null;
  reportsToName: string | null;
  employmentType: StaffEmploymentType;
  employmentStatus: StaffEmploymentStatus;
  basicSalary: number;
}

/** The appointment kind a change implies, when the caller has not said. */
function inferChangeKind(before: PositionSnapshot | null, after: PositionSnapshot): StaffChangeKind | null {
  if (!before) return "JOINED";

  // A status that ends or suspends employment describes the change on its own,
  // whatever else moved alongside it.
  if (before.employmentStatus !== after.employmentStatus) {
    switch (after.employmentStatus) {
      case "RESIGNED":
        return "RESIGNED";
      case "RETIRED":
        return "RETIRED";
      case "TERMINATED":
        return "TERMINATED";
      case "SUSPENDED":
        return "SUSPENDED";
      case "ACTIVE":
        if (before.employmentStatus === "SUSPENDED") return "REINSTATED";
        if (before.employmentStatus === "PROBATION") return "CONFIRMED";
        break;
      default:
        break;
    }
  }

  const rankMoved = before.designationId !== after.designationId;
  if (rankMoved && before.level != null && after.level != null) {
    // Lower level number is more senior — see the note in the schema.
    if (after.level < before.level) return "PROMOTION";
    if (after.level > before.level) return "DEMOTION";
    return "LATERAL_MOVE";
  }
  if (rankMoved) return "LATERAL_MOVE";

  if (before.departmentId !== after.departmentId) return "DEPARTMENT_TRANSFER";
  if (before.reportsToId !== after.reportsToId) return "REPORTING_CHANGE";
  if (before.employmentType !== after.employmentType) return "CONTRACT_RENEWAL";
  if (before.employmentStatus !== after.employmentStatus) return "REPORTING_CHANGE";
  return null;
}

/** Human-readable summary for the staff timeline. */
function describeChange(before: PositionSnapshot | null, after: PositionSnapshot): string {
  const parts: string[] = [];
  const moved = (label: string, a: string | null, b: string | null) => {
    if ((a ?? "") === (b ?? "")) return;
    parts.push(`${label}: ${a || "—"} → ${b || "—"}`);
  };

  moved("Rank", before?.designationName ?? null, after.designationName);
  moved("Department", before?.departmentName ?? null, after.departmentName);
  moved("Reports to", before?.reportsToName ?? null, after.reportsToName);
  if (before && before.employmentType !== after.employmentType) {
    parts.push(`Employment: ${before.employmentType} → ${after.employmentType}`);
  }
  if (before && before.employmentStatus !== after.employmentStatus) {
    parts.push(`Status: ${before.employmentStatus} → ${after.employmentStatus}`);
  }
  if (before && before.basicSalary !== after.basicSalary) {
    parts.push(
      `Basic salary: Rs. ${(before.basicSalary / 100).toLocaleString("en-PK")} → Rs. ${(after.basicSalary / 100).toLocaleString("en-PK")}`
    );
  }

  return parts.join(" · ");
}

/**
 * Applies a position change and records it as an appointment.
 *
 * This is the single door for everything that moves someone in the hierarchy —
 * hiring, promotion, transfer, acting charge, suspension, retirement — so the
 * history can never disagree with the current state. The profile is updated
 * and the appointment written in one transaction.
 */
export async function setStaffPosition(opts: {
  user: AuthUser;
  userId: string;
  change: PositionChange;
}): Promise<{ appointment: StaffAppointment | null; changeKind: StaffChangeKind | null }> {
  const { user, userId, change } = opts;
  const effectiveFrom = change.effectiveFrom ?? new Date();

  return inTenant(user, async (tx) => {
    const staff = await tx.user.findFirst({
      where: { id: userId },
      select: { id: true, fullName: true, campusId: true, staffProfile: true },
    });
    if (!staff) throw new ApiError("Staff member not found", 404);

    // ── Resolve and validate the targets ────────────────────
    let designation: Pick<StaffDesignation, "id" | "name" | "level"> | null = null;
    if (change.designationId) {
      designation = await tx.staffDesignation.findFirst({
        where: { id: change.designationId },
        select: { id: true, name: true, level: true },
      });
      if (!designation) throw new ApiError("That rank is not one of this institution's designations", 400);
    }

    let department: Pick<Department, "id" | "name" | "campusId"> | null = null;
    if (change.primaryDepartmentId) {
      department = await tx.department.findFirst({
        where: { id: change.primaryDepartmentId },
        select: { id: true, name: true, campusId: true },
      });
      if (!department) throw new ApiError("That department does not exist", 400);
      if (staff.campusId && department.campusId !== staff.campusId) {
        throw new ApiError("That department belongs to a different campus", 400);
      }
    }

    let manager: { id: string; fullName: string } | null = null;
    if (change.reportsToId) {
      manager = await tx.user.findFirst({
        where: { id: change.reportsToId, isActive: true },
        select: { id: true, fullName: true },
      });
      if (!manager) throw new ApiError("That manager is not an active member of this school", 400);
      await assertNoReportingCycle(tx, userId, manager.id);
    }

    const existing = staff.staffProfile;
    const before: PositionSnapshot | null = existing
      ? {
          designationId: existing.designationId,
          designationName: existing.designation,
          level: existing.seniorityLevel,
          departmentId: existing.primaryDepartmentId,
          departmentName: null,
          reportsToId: existing.reportsToId,
          reportsToName: null,
          employmentType: existing.employmentType,
          employmentStatus: existing.employmentStatus,
          basicSalary: existing.basicSalary,
        }
      : null;

    // Fill the names the previous snapshot needs, from the last appointment if
    // there is one — cheaper and more faithful than re-resolving deleted rows.
    const openAppointment = existing
      ? await tx.staffAppointment.findFirst({
          where: { userId, effectiveTo: null },
          orderBy: { effectiveFrom: "desc" },
        })
      : null;
    if (before && openAppointment) {
      before.departmentName = openAppointment.departmentName;
      before.reportsToName = openAppointment.reportsToName;
    }

    const has = (key: keyof PositionChange) => Object.prototype.hasOwnProperty.call(change, key);

    const after: PositionSnapshot = {
      designationId: has("designationId") ? change.designationId ?? null : before?.designationId ?? null,
      designationName: has("designationId")
        ? designation?.name ?? null
        : before?.designationName ?? null,
      level: has("designationId") ? designation?.level ?? null : before?.level ?? null,
      departmentId: has("primaryDepartmentId")
        ? change.primaryDepartmentId ?? null
        : before?.departmentId ?? null,
      departmentName: has("primaryDepartmentId")
        ? department?.name ?? null
        : before?.departmentName ?? null,
      reportsToId: has("reportsToId") ? change.reportsToId ?? null : before?.reportsToId ?? null,
      reportsToName: has("reportsToId") ? manager?.fullName ?? null : before?.reportsToName ?? null,
      employmentType: change.employmentType ?? before?.employmentType ?? "FULL_TIME",
      employmentStatus: change.employmentStatus ?? before?.employmentStatus ?? "ACTIVE",
      basicSalary: change.basicSalary ?? before?.basicSalary ?? 0,
    };

    const changeKind = change.changeKind ?? inferChangeKind(before, after);
    const rankMoved = (before?.designationId ?? null) !== after.designationId;

    // ── Write the profile ───────────────────────────────────
    const profileData: Prisma.StaffProfileUncheckedUpdateInput = {
      designationId: after.designationId,
      // The legacy free-text label is mirrored so older screens keep rendering.
      designation: after.designationName,
      seniorityLevel: after.level,
      primaryDepartmentId: after.departmentId,
      reportsToId: after.reportsToId,
      employmentType: after.employmentType,
      employmentStatus: after.employmentStatus,
    };
    if (has("employeeCode")) profileData.employeeCode = change.employeeCode ?? null;
    if (has("basicSalary")) profileData.basicSalary = after.basicSalary;
    if (has("probationEndsAt")) profileData.probationEndsAt = change.probationEndsAt ?? null;
    if (has("contractEndsAt")) profileData.contractEndsAt = change.contractEndsAt ?? null;
    // The clock a promotion-eligibility rule runs against only restarts when
    // the rank itself moves.
    if (rankMoved || !existing) profileData.rankSince = effectiveFrom;

    await tx.staffProfile.upsert({
      where: { userId },
      create: {
        userId,
        designationId: after.designationId,
        designation: after.designationName,
        seniorityLevel: after.level,
        primaryDepartmentId: after.departmentId,
        reportsToId: after.reportsToId,
        employmentType: after.employmentType,
        employmentStatus: after.employmentStatus,
        employeeCode: change.employeeCode ?? null,
        basicSalary: after.basicSalary,
        probationEndsAt: change.probationEndsAt ?? null,
        contractEndsAt: change.contractEndsAt ?? null,
        rankSince: effectiveFrom,
      },
      update: profileData,
    });

    // A primary department implies membership in it. Without this the person
    // is filed under a department the department itself has never heard of.
    if (has("primaryDepartmentId") && after.departmentId) {
      await tx.departmentMember.updateMany({
        where: { userId, isPrimary: true, endedAt: null, departmentId: { not: after.departmentId } },
        data: { isPrimary: false },
      });
      const already = await tx.departmentMember.findFirst({
        where: { userId, departmentId: after.departmentId, endedAt: null },
        select: { id: true },
      });
      if (already) {
        await tx.departmentMember.update({ where: { id: already.id }, data: { isPrimary: true } });
      } else {
        await tx.departmentMember.create({
          data: { userId, departmentId: after.departmentId, role: "MEMBER", isPrimary: true, startedAt: effectiveFrom },
        });
      }
    }

    // Someone who has left holds no posts and no reports' lines should point
    // at them being current — close their memberships out.
    if ((ENDED_STATUSES as readonly string[]).includes(after.employmentStatus)) {
      await tx.departmentMember.updateMany({
        where: { userId, endedAt: null },
        data: { endedAt: effectiveFrom },
      });
      await tx.department.updateMany({ where: { headId: userId }, data: { headId: null } });
      await tx.staffReportingLine.updateMany({
        where: { OR: [{ userId }, { managerId: userId }], endedAt: null },
        data: { endedAt: effectiveFrom },
      });
    }

    if (!changeKind) {
      return { appointment: null, changeKind: null };
    }

    // ── Close the open appointment, open the new one ────────
    await tx.staffAppointment.updateMany({
      where: { userId, effectiveTo: null },
      data: { effectiveTo: effectiveFrom },
    });

    const appointment = await tx.staffAppointment.create({
      data: {
        userId,
        changeKind,
        designationId: after.designationId,
        designationName: after.designationName,
        departmentId: after.departmentId,
        departmentName: after.departmentName,
        reportsToId: after.reportsToId,
        reportsToName: after.reportsToName,
        level: after.level,
        employmentType: after.employmentType,
        employmentStatus: after.employmentStatus,
        basicSalary: after.basicSalary,
        isActing: change.isActing ?? false,
        effectiveFrom,
        orderRef: change.orderRef ?? null,
        notes: change.notes ?? null,
        approvedById: user.userId,
      },
    });

    await tx.staffTimelineEvent.create({
      data: {
        userId,
        kind: "DESIGNATION",
        title: CHANGE_TITLES[changeKind],
        detail: describeChange(before, after) || null,
        actorId: user.userId,
      },
    });

    return { appointment, changeKind };
  });
}

const CHANGE_TITLES: Record<StaffChangeKind, string> = {
  JOINED: "Joined the institution",
  CONFIRMED: "Confirmed after probation",
  PROMOTION: "Promoted",
  DEMOTION: "Demoted",
  LATERAL_MOVE: "Moved to another post",
  DEPARTMENT_TRANSFER: "Transferred to another department",
  CAMPUS_TRANSFER: "Transferred to another campus",
  REPORTING_CHANGE: "Reporting line changed",
  ACTING_ASSIGNMENT: "Given acting charge",
  ACTING_ENDED: "Acting charge ended",
  CONTRACT_RENEWAL: "Contract updated",
  SUSPENDED: "Suspended",
  REINSTATED: "Reinstated",
  RESIGNED: "Resigned",
  RETIRED: "Retired",
  TERMINATED: "Service terminated",
};

// ─────────────────────────────────────────────────────────────────
// Department headship
// ─────────────────────────────────────────────────────────────────

/**
 * Hands a department to a new head.
 *
 * Headship is a POST, not a rank: the outgoing head keeps their designation
 * and stays in the department as an ordinary member, and the incoming head
 * takes the post without being promoted. Acting charge is the same operation
 * with `isActing` set, which is how an institution covers a vacancy without
 * committing to a permanent appointment.
 */
export async function setDepartmentHead(opts: {
  user: AuthUser;
  departmentId: string;
  userId: string | null;
  isActing?: boolean;
  effectiveFrom?: Date;
}) {
  const { user, departmentId, userId } = opts;
  const effectiveFrom = opts.effectiveFrom ?? new Date();

  return inTenant(user, async (tx) => {
    const department = await tx.department.findFirst({
      where: { id: departmentId },
      select: { id: true, name: true, campusId: true, headId: true },
    });
    if (!department) throw new ApiError("Department not found", 404);

    // Step the outgoing head down to MEMBER rather than removing them.
    await tx.departmentMember.updateMany({
      where: { departmentId, role: "HEAD", endedAt: null },
      data: { role: "MEMBER", isActing: false },
    });

    if (!userId) {
      await tx.department.update({ where: { id: departmentId }, data: { headId: null } });
      return { headId: null };
    }

    const staff = await tx.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true, fullName: true, campusId: true },
    });
    if (!staff) throw new ApiError("That staff member is not active in this school", 404);
    if (staff.campusId !== department.campusId) {
      throw new ApiError("That staff member belongs to a different campus", 400);
    }

    const membership = await tx.departmentMember.findFirst({
      where: { departmentId, userId, endedAt: null },
      select: { id: true },
    });

    if (membership) {
      await tx.departmentMember.update({
        where: { id: membership.id },
        data: { role: "HEAD", isActing: opts.isActing ?? false },
      });
    } else {
      await tx.departmentMember.create({
        data: {
          departmentId,
          userId,
          role: "HEAD",
          isActing: opts.isActing ?? false,
          startedAt: effectiveFrom,
        },
      });
    }

    await tx.department.update({ where: { id: departmentId }, data: { headId: userId } });

    await tx.staffTimelineEvent.create({
      data: {
        userId,
        kind: "DESIGNATION",
        title: opts.isActing ? `Given acting charge of ${department.name}` : `Made head of ${department.name}`,
        detail: null,
        actorId: user.userId,
      },
    });

    return { headId: userId };
  });
}

export async function setDepartmentMembership(opts: {
  user: AuthUser;
  departmentId: string;
  userId: string;
  role: DepartmentRole;
  isPrimary?: boolean;
}) {
  const { user, departmentId, userId, role } = opts;
  if (role === "HEAD") {
    return setDepartmentHead({ user, departmentId, userId });
  }

  return inTenant(user, async (tx) => {
    const existing = await tx.departmentMember.findFirst({
      where: { departmentId, userId, endedAt: null },
      select: { id: true },
    });

    if (opts.isPrimary) {
      await tx.departmentMember.updateMany({
        where: { userId, isPrimary: true, endedAt: null, departmentId: { not: departmentId } },
        data: { isPrimary: false },
      });
      await tx.staffProfile.updateMany({ where: { userId }, data: { primaryDepartmentId: departmentId } });
    }

    if (existing) {
      return tx.departmentMember.update({
        where: { id: existing.id },
        data: { role, ...(opts.isPrimary === undefined ? {} : { isPrimary: opts.isPrimary }) },
      });
    }

    return tx.departmentMember.create({
      data: { departmentId, userId, role, isPrimary: opts.isPrimary ?? false },
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// The chart
// ─────────────────────────────────────────────────────────────────

export interface OrgNode {
  id: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  managerId: string | null;
  designation: { id: string; name: string; shortName: string | null; level: number; track: string } | null;
  /** Free-text fallback for staff who predate the ladder. */
  designationLabel: string | null;
  department: { id: string; name: string; kind: string } | null;
  /** Units this person heads. A person can head more than one. */
  headOf: Array<{ id: string; name: string; isActing: boolean }>;
  employmentType: StaffEmploymentType;
  employmentStatus: StaffEmploymentStatus;
  employeeCode: string | null;
  joiningDate: string | null;
  rankSince: string | null;
  /** Set when the rank's minYearsInRank has elapsed. Advisory only. */
  dueForReview: boolean;
  isInstitutionHead: boolean;
  directReportCount: number;
  subjectCount: number;
  classCount: number;
}

export interface OrgChartData {
  nodes: OrgNode[];
  /** Secondary lines, drawn dashed. */
  dottedEdges: Array<{ userId: string; managerId: string; kind: string; label: string | null }>;
  rootIds: string[];
  /** Active staff with no rank yet — the work an admin still has to do. */
  unrankedIds: string[];
  departments: Array<{
    id: string;
    name: string;
    code: string | null;
    kind: string;
    parentId: string | null;
    headId: string | null;
    memberCount: number;
  }>;
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Assembles everything the org chart needs in one round of queries. */
export async function buildOrgChart(opts: {
  campusId: string;
  includeFormer?: boolean;
}): Promise<OrgChartData> {
  const [staff, departments, dottedLines] = await Promise.all([
    prisma.user.findMany({
      where: {
        campusId: opts.campusId,
        isActive: true,
        role: { notIn: ["STUDENT", "PARENT"] },
        ...(opts.includeFormer
          ? {}
          : { OR: [{ staffProfile: null }, { staffProfile: { employmentStatus: { notIn: [...ENDED_STATUSES] } } }] }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        profileImageUrl: true,
        joiningDate: true,
        staffProfile: {
          select: {
            designationId: true,
            designation: true,
            seniorityLevel: true,
            primaryDepartmentId: true,
            reportsToId: true,
            employmentType: true,
            employmentStatus: true,
            employeeCode: true,
            rankSince: true,
            designationRef: {
              select: { id: true, name: true, shortName: true, level: true, track: true, isInstitutionHead: true, minYearsInRank: true },
            },
            primaryDepartment: { select: { id: true, name: true, kind: true } },
          },
        },
        headedDepartments: { where: { isActive: true }, select: { id: true, name: true } },
        departmentMemberships: {
          where: { endedAt: null, role: "HEAD" },
          select: { departmentId: true, isActing: true },
        },
        _count: { select: { taughtSubjects: true, ledClasses: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.department.findMany({
      where: { campusId: opts.campusId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        kind: true,
        parentId: true,
        headId: true,
        sortOrder: true,
        _count: { select: { members: { where: { endedAt: null } } } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.staffReportingLine.findMany({
      where: { endedAt: null, user: { campusId: opts.campusId } },
      select: { userId: true, managerId: true, kind: true, label: true },
    }),
  ]);

  const present = new Set(staff.map((s) => s.id));
  const directReports = new Map<string, number>();
  for (const person of staff) {
    const managerId = person.staffProfile?.reportsToId;
    if (managerId && present.has(managerId)) {
      directReports.set(managerId, (directReports.get(managerId) ?? 0) + 1);
    }
  }

  const now = Date.now();

  const nodes: OrgNode[] = staff.map((person) => {
    const profile = person.staffProfile;
    const rank = profile?.designationRef ?? null;
    const actingByDept = new Map(person.departmentMemberships.map((m) => [m.departmentId, m.isActing]));

    // A manager who has left the campus is not a manager. Dangling ids would
    // otherwise strand their reports in a subtree with no root.
    const managerId = profile?.reportsToId && present.has(profile.reportsToId) ? profile.reportsToId : null;

    const dueForReview = Boolean(
      rank?.minYearsInRank &&
        profile?.rankSince &&
        now - profile.rankSince.getTime() >= rank.minYearsInRank * YEAR_MS
    );

    return {
      id: person.id,
      fullName: person.fullName,
      email: person.email,
      role: person.role,
      avatarUrl: person.profileImageUrl,
      managerId,
      designation: rank
        ? { id: rank.id, name: rank.name, shortName: rank.shortName, level: rank.level, track: rank.track }
        : null,
      designationLabel: profile?.designation ?? null,
      department: profile?.primaryDepartment
        ? { id: profile.primaryDepartment.id, name: profile.primaryDepartment.name, kind: profile.primaryDepartment.kind }
        : null,
      headOf: person.headedDepartments.map((d) => ({
        id: d.id,
        name: d.name,
        isActing: actingByDept.get(d.id) ?? false,
      })),
      employmentType: profile?.employmentType ?? "FULL_TIME",
      employmentStatus: profile?.employmentStatus ?? "ACTIVE",
      employeeCode: profile?.employeeCode ?? null,
      joiningDate: person.joiningDate?.toISOString() ?? null,
      rankSince: profile?.rankSince?.toISOString() ?? null,
      dueForReview,
      isInstitutionHead: rank?.isInstitutionHead ?? false,
      directReportCount: directReports.get(person.id) ?? 0,
      subjectCount: person._count.taughtSubjects,
      classCount: person._count.ledClasses,
    };
  });

  return {
    nodes,
    dottedEdges: dottedLines.filter((l) => present.has(l.userId) && present.has(l.managerId)),
    rootIds: nodes.filter((n) => !n.managerId).map((n) => n.id),
    unrankedIds: nodes.filter((n) => !n.designation).map((n) => n.id),
    departments: departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      kind: d.kind,
      parentId: d.parentId,
      headId: d.headId,
      memberCount: d._count.members,
    })),
  };
}
