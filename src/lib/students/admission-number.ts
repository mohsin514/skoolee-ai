import "server-only";

// SKAI-167: admission numbers are unique per school (see the restore conflict check in /api/students).
// The old "count numbered pupils on this campus + 1" handed two campuses of one school the same
// ADM-<year>-0001 and reused numbers after deletions. Allocation now takes a school+year transaction
// lock and continues from the highest number already issued for that year, so it never repeats.

type AllocatorTx = {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  student: { findMany(args: { where: { schoolId: string; admissionNo: { startsWith: string } }; select: { admissionNo: true } }): Promise<{ admissionNo: string | null }[]> };
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
  const existing = await tx.student.findMany({ where: { schoolId, admissionNo: { startsWith: admissionPrefix(year) } }, select: { admissionNo: true } });
  let seq = highestAdmissionSeq(year, existing.map((row) => row.admissionNo));
  return () => formatAdmissionNo(year, ++seq);
}
