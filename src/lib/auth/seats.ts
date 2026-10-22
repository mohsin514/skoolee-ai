// §1.1a/§1.2: server only — a client import fails the build instead of bundling Prisma.
import "server-only";
import { prisma } from "@/lib/db/prisma";

/** Which campus seats are held by an active user (§1.2, §2.6). A campus operator holds a desk only while it is vacant. */
export type CampusSeats = { campusAdmin: boolean; principal: boolean; accountant: boolean; receptionist: boolean; librarian: boolean };

const NO_SEATS: CampusSeats = { campusAdmin: false, principal: false, accountant: false, receptionist: false, librarian: false };

/** One groupBy over active users on the campus (isActive = true). campusAdmin = an active CAMPUS_ADMIN or ADMIN pinned to the campus.
 *  Empty/unknown campus → all false. Runs inside the caller's tenant context with an explicit school and campus filter. */
export async function getCampusSeats(schoolId: string, campusId: string | null): Promise<CampusSeats> {
  if (!schoolId || !campusId) return { ...NO_SEATS };
  const rows = await prisma.user.groupBy({
    by: ["role"],
    where: { schoolId, campusId, isActive: true, role: { in: ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN"] } },
    _count: { _all: true },
  });
  const held = new Set(rows.filter((row) => row._count._all > 0).map((row) => row.role as string));
  return {
    campusAdmin: held.has("CAMPUS_ADMIN") || held.has("ADMIN"),
    principal: held.has("PRINCIPAL"),
    accountant: held.has("ACCOUNTANT"),
    receptionist: held.has("RECEPTIONIST"),
    librarian: held.has("LIBRARIAN"),
  };
}
