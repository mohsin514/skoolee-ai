/**
 * SKAI-1823 — keep the campus console from re-reading the whole campus after a one-row edit.
 *
 * `createLatestOnlyLoader` lets only the newest dashboard read reach the screen, so two overlapping reloads
 * can never leave older data showing. The `merge*Edit` helpers fold a saved row into the loaded dashboard;
 * each returns `null` when the edit touches something other widgets derive from (names shown on other
 * rows, class placement, on-roll status, subject ordering), and the caller then reloads as before.
 */

type Row = Record<string, any>;

export function createLatestOnlyLoader<T>(
  load: () => Promise<T>,
  handlers: { onData: (data: T) => void; onError: (error: unknown) => void | Promise<void>; onSettled?: () => void },
) {
  let seq = 0;
  let pending = 0;
  let latest: Promise<T | null> = Promise.resolve(null);
  let shown: T | null = null;
  const run = (): Promise<T | null> => {
    const mine = ++seq;
    pending += 1;
    const attempt = (async (): Promise<T | null> => {
      try {
        const next = await load();
        if (mine === seq) {
          shown = next;
          handlers.onData(next);
          return next;
        }
      } catch (error) {
        if (mine === seq) {
          await handlers.onError(error);
          return null;
        }
      } finally {
        pending -= 1;
        if (mine === seq) handlers.onSettled?.();
      }
      // Superseded: answer with the newest read, so a caller never syncs against stale data.
      return latest;
    })();
    latest = attempt;
    return attempt;
  };
  return {
    run,
    inFlight: () => pending > 0,
    /** The data last put on screen, by a read or by `replace`. */
    current: () => shown,
    /** Records a locally merged copy as what is on screen. */
    replace: (next: T) => { shown = next; },
  };
}

const changed = (row: Row, saved: Row, key: string) => key in saved && saved[key] !== undefined && String(saved[key] ?? "") !== String(row[key] ?? "");

/** Copies `keys` from the saved row, keeping a Date a Date where the loaded row held one. */
function pick(row: Row, saved: Row, keys: readonly string[]): Row {
  const next: Row = { ...row };
  for (const key of keys) {
    if (!(key in saved) || saved[key] === undefined) continue;
    const value = saved[key];
    next[key] = row[key] instanceof Date && typeof value === "string" ? new Date(value) : value;
  }
  return next;
}

/** Roster-summary fields no other widget derives from; see `rosterSummarySelect`. */
const STUDENT_LOCAL_KEYS = ["nameUr", "gender", "profileImageUrl", "guardianName", "guardianNameUr", "guardianPhone", "guardianWhatsapp", "guardianEmail", "categoryId", "category", "groupId", "group"] as const;
/** Shown in today's attendance, report cards, class counts or the on-roll headline. */
const STUDENT_RELOAD_KEYS = ["fullName", "rollNo", "classId", "status"] as const;

export function mergeStudentEdit<D extends Row>(data: D | null, studentId: string, saved: Row | null | undefined): D | null {
  const students: Row[] | undefined = data?.students;
  const row = students?.find((student) => student.id === studentId);
  if (!data || !students || !row || !saved || saved.id !== studentId) return null;
  if (STUDENT_RELOAD_KEYS.some((key) => changed(row, saved, key))) return null;
  if ("archivedAt" in saved && Boolean(saved.archivedAt) !== Boolean(row.archivedAt)) return null;
  return { ...data, students: students.map((student) => (student.id === studentId ? pick(student, saved, STUDENT_LOCAL_KEYS) : student)) };
}

/** Teacher profile fields only the faculty list shows. The name and photo also appear on class and subject rows. */
const TEACHER_LOCAL_KEYS = ["phone", "cnic", "dateOfBirth", "gender", "qualification", "specialization", "subjectSpecialties", "teachesAllSubjects", "experience", "address", "city", "province", "postalCode", "joiningDate", "emergencyContact", "emergencyPhone"] as const;
const TEACHER_RELOAD_KEYS = ["fullName", "profileImageUrl", "email", "isActive"] as const;

export function mergeTeacherEdit<D extends Row>(data: D | null, teacherId: string, saved: Row | null | undefined): D | null {
  const teachers: Row[] | undefined = data?.teachers;
  const row = teachers?.find((teacher) => teacher.id === teacherId);
  if (!data || !teachers || !row || !saved || saved.id !== teacherId) return null;
  if (TEACHER_RELOAD_KEYS.some((key) => changed(row, saved, key))) return null;
  return { ...data, teachers: teachers.map((teacher) => (teacher.id === teacherId ? pick(teacher, saved, TEACHER_LOCAL_KEYS) : teacher)) };
}

/** A rename reorders the class's subjects and an archive or teacher change moves counts, so only these merge. */
const SUBJECT_LOCAL_KEYS = ["totalMarks", "code", "isElective"] as const;
/** The edit form always sends the name with the marks; an unchanged name still merges (the rename check is below). */
const SUBJECT_REQUEST_KEYS: readonly string[] = [...SUBJECT_LOCAL_KEYS, "name"];

export function mergeSubjectEdit<D extends Row>(data: D | null, classId: string, subjectId: string, requested: Row, saved: Row | null | undefined): D | null {
  const classes: Row[] | undefined = data?.classes;
  const cls = classes?.find((item) => item.id === classId);
  const row = cls?.subjects?.find((subject: Row) => subject.id === subjectId);
  if (!data || !classes || !row || !saved || saved.id !== subjectId) return null;
  if (!Object.keys(requested).every((key) => SUBJECT_REQUEST_KEYS.includes(key))) return null;
  if (changed(row, saved, "name") || (saved.classId !== undefined && saved.classId !== classId) || Boolean(saved.archivedAt) !== Boolean(row.archivedAt)) return null;
  if ((saved.teacherId ?? saved.teacher?.id ?? null) !== (row.teacher?.id ?? null)) return null;
  const teachers: Row[] = data.teachers ?? [];
  return {
    ...data,
    classes: classes.map((item) => (item.id !== classId ? item : { ...item, subjects: item.subjects.map((subject: Row) => (subject.id === subjectId ? pick(subject, saved, SUBJECT_LOCAL_KEYS) : subject)) })),
    ...(data.teachers ? { teachers: teachers.map((teacher) => (teacher.taughtSubjects?.some((subject: Row) => subject.id === subjectId) ? { ...teacher, taughtSubjects: teacher.taughtSubjects.map((subject: Row) => (subject.id === subjectId ? pick(subject, saved, ["totalMarks"]) : subject)) } : teacher)) } : {}),
  };
}
