import "server-only";

// SKAI-167: admission numbers are unique per school (see the restore conflict check in /api/students).
// The old "count numbered pupils on this campus + 1" handed two campuses of one school the same
// ADM-<year>-0001 and reused numbers after deletions. Allocation now takes a school+year transaction
// lock and continues from the highest number already issued for that year, so it never repeats.

type AllocatorTx = {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export const admissionPrefix = (year: number) => `ADM-${year}-`;
export const formatAdmissionNo = (year: number, seq: number) => `${admissionPrefix(year)}${String(seq).padStart(4, "0")}`;

export function highestAdmissionSeq(year: number, numbers: (string | null)[]): number {
  const prefix = admissionPrefix(year);
  let max = 0;
  for (const n of numbers) {
    if (!n?.startsWith(prefix)) continue;
    const tail = n.slice(prefix.length);
    if (/^\d{1,9}$/.test(tail)) max = Math.max(max, Number(tail));
  }
  return max;
}

/** Returns an allocator for one school and year. Call it inside the caller's transaction. */
export async function admissionNumberAllocator(tx: AllocatorTx, schoolId: string, year: number) {
  // Serialises every allocation for this school+year until the transaction ends.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admission-no:${schoolId}:${year}`}))`;
  // Raw SQL on purpose: the year-close route runs inside a campus-scoped tenant context, and the Prisma
  // guard would add the caller's campusId to a delegate read, hiding numbers other campuses issued.
  // RLS still limits rows to the current school; the explicit school_id filter keeps it fail-closed.
  const existing = await tx.$queryRaw<{ admission_no: string | null }[]>`SELECT admission_no FROM students WHERE school_id = ${schoolId} AND admission_no LIKE ${`${admissionPrefix(year)}%`}`;
  let seq = highestAdmissionSeq(year, existing.map((row) => row.admission_no));
  return () => formatAdmissionNo(year, ++seq);
}
