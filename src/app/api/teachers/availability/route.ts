import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface TeacherAvailability {
  id: string;
  fullName: string | null;
  email: string | null;
  profileImageUrl: string | null;
  subjectSpecialties: string[];
  teachesAllSubjects: boolean;
  /** Sections where this teacher is the homeroom teacher of a SINGLE-mode
   *  class — i.e. they take every period, so they cannot take another. */
  wholeSectionClasses: { id: string; label: string }[];
  subjectCount: number;
  classCount: number;
  /** Timetable slots they're booked into, as "day-period" keys. */
  busySlots: string[];
  /** Genuine double-bookings: same day + period, two different classes. */
  conflicts: { day: number; period: number; label: string; classes: string[] }[];
}

/**
 * Per-teacher load and clash data for the campus.
 *
 * Powers the teacher picker's "already committed" / "clashes with…" states and
 * the admin-facing conflict list. Read-only, so any authenticated campus user
 * may call it.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const campusId =
      user.role === "SUPER_ADMIN" && !requestedCampusId ? null : requestedCampusId || user.campusId;

    const teachers = await prisma.user.findMany({
      where: {
        role: { in: ["TEACHER", "PRINCIPAL"] },
        isActive: true,
        schoolId: user.schoolId,
        ...(campusId ? { campusId } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        profileImageUrl: true,
        subjectSpecialties: true,
        teachesAllSubjects: true,
        specialization: true,
        ledClasses: {
          select: { id: true, name: true, section: true, teachingMode: true },
        },
        _count: { select: { taughtSubjects: true, ledClasses: true } },
        timetableSlots: {
          where: { slotType: "CLASS" },
          select: {
            dayOfWeek: true,
            periodNumber: true,
            timetable: { select: { class: { select: { name: true, section: true } } } },
          },
        },
      },
      orderBy: { fullName: "asc" },
    });

    const data: TeacherAvailability[] = teachers.map((t) => {
      // Group slots by day+period so repeats surface as genuine clashes.
      const byKey = new Map<string, string[]>();
      for (const slot of t.timetableSlots) {
        const key = `${slot.dayOfWeek}-${slot.periodNumber}`;
        const cls = slot.timetable?.class;
        const label = cls ? `${cls.name}${cls.section ? ` ${cls.section}` : ""}` : "Unknown class";
        byKey.set(key, [...(byKey.get(key) || []), label]);
      }

      const conflicts = [...byKey.entries()]
        .filter(([, classes]) => new Set(classes).size > 1)
        .map(([key, classes]) => {
          const [day, period] = key.split("-").map(Number);
          return {
            day,
            period,
            label: `${DAY_LABELS[day] || `Day ${day}`} P${period}`,
            classes: [...new Set(classes)],
          };
        })
        .sort((a, b) => a.day - b.day || a.period - b.period);

      // Fall back to the legacy free-text field so teachers who haven't been
      // re-saved since the migration still show something meaningful.
      const specialties =
        t.subjectSpecialties.length > 0
          ? t.subjectSpecialties
          : (t.specialization || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

      return {
        id: t.id,
        fullName: t.fullName,
        email: t.email,
        profileImageUrl: t.profileImageUrl,
        subjectSpecialties: specialties,
        teachesAllSubjects: t.teachesAllSubjects,
        wholeSectionClasses: t.ledClasses
          .filter((c) => c.teachingMode === "SINGLE")
          .map((c) => ({ id: c.id, label: `${c.name}${c.section ? ` ${c.section}` : ""}` })),
        subjectCount: t._count.taughtSubjects,
        classCount: t._count.ledClasses,
        busySlots: [...byKey.keys()],
        conflicts,
      };
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[teachers/availability] GET failed");
  }
}
