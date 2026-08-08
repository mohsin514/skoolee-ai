import { prisma } from "@/lib/db/prisma";

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface TimetableClash {
  teacherName: string;
  label: string;
  classes: string[];
  message: string;
}

/**
 * Repoint a subject's timetable slots at whoever now teaches that subject.
 *
 * Without this, changing a subject's teacher leaves the published timetable
 * still showing the previous teacher — the roster and the schedule silently
 * disagree. Slots are the authoritative "who is where, when" record, so they
 * have to move with the assignment.
 */
export async function syncTimetableSlotsForSubjects(
  subjectIds: string[],
  teacherId: string | null
): Promise<void> {
  if (subjectIds.length === 0) return;
  await prisma.timetableSlot.updateMany({
    where: { subjectId: { in: subjectIds } },
    data: { teacherId },
  });
}

/**
 * Find genuine double-bookings for a teacher: the same weekday + period
 * occupied by two different classes. Returns [] when the teacher is unset or
 * has no clashes, so callers can spread it into a response unconditionally.
 */
export async function detectTeacherClashes(teacherId: string | null): Promise<TimetableClash[]> {
  if (!teacherId) return [];

  const [teacher, slots] = await Promise.all([
    prisma.user.findUnique({ where: { id: teacherId }, select: { fullName: true } }),
    prisma.timetableSlot.findMany({
      where: { teacherId, slotType: "CLASS" },
      select: {
        dayOfWeek: true,
        periodNumber: true,
        timetable: { select: { class: { select: { name: true, section: true } } } },
      },
    }),
  ]);

  const byKey = new Map<string, string[]>();
  for (const slot of slots) {
    const key = `${slot.dayOfWeek}-${slot.periodNumber}`;
    const cls = slot.timetable?.class;
    const label = cls ? `${cls.name}${cls.section ? ` ${cls.section}` : ""}` : "Unknown class";
    byKey.set(key, [...(byKey.get(key) || []), label]);
  }

  const teacherName = teacher?.fullName || "This teacher";
  return [...byKey.entries()]
    .filter(([, classes]) => new Set(classes).size > 1)
    .map(([key, classes]) => {
      const [day, period] = key.split("-").map(Number);
      const label = `${DAY_LABELS[day] || `Day ${day}`} P${period}`;
      const unique = [...new Set(classes)];
      return {
        teacherName,
        label,
        classes: unique,
        message: `${teacherName} is double-booked on ${label} (${unique.join(" & ")})`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
