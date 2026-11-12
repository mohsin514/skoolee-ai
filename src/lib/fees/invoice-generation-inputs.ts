import type { TxClient } from "@/lib/db/prisma";

// SKAI-1814: monthly invoice generation used to read the fee group, discounts, carry-forward and previous
// open invoice once per student inside the locked Serializable transaction, so a whole campus ran out of
// time. These set-based reads load the same rows for the whole batch, each with an explicit school scope.

type GenerationStudent = { id: string; classId: string; categoryId: string | null; class: { academicYear: number } };
type InputsTx = Pick<TxClient, "feeGroupAssignment" | "feeDiscount" | "feeDiscountAssignment" | "feeCarryForward" | "invoice">;

const discountSelect = { id: true, name: true, code: true, type: true, value: true, currency: true } as const;

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row); else map.set(k, [row]);
  }
  return map;
}

/** First row per key, in the order the database returned them (the per-student findFirst picked the same way). */
function firstBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T>();
  for (const row of rows) if (!map.has(key(row))) map.set(key(row), row);
  return map;
}

const unique = <T>(values: T[]) => [...new Set(values)];

export const classYearKey = (classId: string, academicYear: number) => `${classId}:${academicYear}`;

export async function loadInvoiceGenerationInputs(tx: InputsTx, scope: { schoolId: string; campusId: string }, students: GenerationStudent[], includeLateFees: boolean) {
  const { schoolId, campusId } = scope;
  const studentIds = unique(students.map(student => student.id));
  const classIds = unique(students.map(student => student.classId));
  const years = unique(students.map(student => student.class.academicYear));
  const categoryIds = unique(students.flatMap(student => (student.categoryId ? [student.categoryId] : [])));

  const assignments = studentIds.length
    ? await tx.feeGroupAssignment.findMany({
        where: { schoolId, campusId, classId: { in: classIds }, academicYear: { in: years } },
        include: { feeGroup: { include: { lines: { include: { feeType: { select: { id: true, name: true, code: true } } } } } } },
      })
    : [];
  const assignmentByClassYear = firstBy(assignments, row => classYearKey(row.classId, row.academicYear));
  const newModel = students.filter(student => assignmentByClassYear.has(classYearKey(student.classId, student.class.academicYear)));
  const newModelIds = unique(newModel.map(student => student.id));
  const newModelIdSet = new Set(newModelIds);
  const newModelCategorySet = new Set(newModel.map(student => student.categoryId));
  const newModelCategories = categoryIds.filter(id => newModelCategorySet.has(id));

  const categoryDiscounts = newModelCategories.length
    ? await tx.feeDiscount.findMany({ where: { schoolId, campusId, categoryId: { in: newModelCategories } }, select: { ...discountSelect, categoryId: true } })
    : [];
  const explicitAssignments = newModelIds.length
    ? await tx.feeDiscountAssignment.findMany({ where: { schoolId, studentId: { in: newModelIds } }, include: { discount: { select: discountSelect } } })
    : [];
  const carryForwards = newModelIds.length
    ? await tx.feeCarryForward.findMany({ where: { schoolId, studentId: { in: newModelIds }, toAcademicYear: { in: years } } })
    : [];

  const legacyIds = includeLateFees ? studentIds.filter(id => !newModelIdSet.has(id)) : [];
  const openInvoices = legacyIds.length
    ? await tx.invoice.findMany({
        where: { schoolId, studentId: { in: legacyIds }, status: { in: ["PENDING", "OVERDUE"] } },
        orderBy: { dueDate: "desc" },
        select: { studentId: true, currency: true, dueDate: true, balanceDue: true },
      })
    : [];

  return {
    assignmentByClassYear,
    categoryDiscountsByCategory: groupBy(categoryDiscounts, row => row.categoryId ?? ""),
    explicitDiscountsByStudent: groupBy(explicitAssignments, row => row.studentId),
    carryForwardByStudentYear: firstBy(carryForwards, row => classYearKey(row.studentId, row.toAcademicYear)),
    latestOpenInvoiceByStudent: firstBy(openInvoices, row => row.studentId),
  };
}

/** Lazily runs `load` once per key; later callers share the same promise. */
export function memoByKey<T>(load: (key: string) => Promise<T>) {
  const cache = new Map<string, Promise<T>>();
  return (key: string) => {
    let hit = cache.get(key);
    if (!hit) { hit = load(key); cache.set(key, hit); }
    return hit;
  };
}
