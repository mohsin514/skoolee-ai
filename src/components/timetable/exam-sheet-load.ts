/**
 * Loads a family's exam date sheet by token. A non-2xx response or an unsuccessful payload throws, so the
 * panel shows its inline ErrorState with Retry; a successful response with no exams resolves to an empty list.
 */
export async function loadFamilyExamSheet(token: string, fetcher: typeof fetch = fetch) {
  const res = await fetcher(`/api/parent/exam-datesheet?token=${encodeURIComponent(token)}`);
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success || !j.data) throw new Error("exam datesheet");
  return { exams: j.data.exams || [], schedules: j.data.schedules || {} };
}
