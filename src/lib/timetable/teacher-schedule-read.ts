import { checkedListJson, readRequest, requestFailure, RequestFailure } from "@/lib/http/request-state";

/**
 * SKAI-1024: the one read of a teacher's published week, shared by the Today dashboard and /teacher/timetable so the
 * two can never disagree. An empty list is the valid "No published timetable yet" state, never a failure. A transient
 * failure (server, timeout, provider) is retried once before it is reported: the dashboard fires this read while its
 * own console loads, and a single slow moment used to show "Couldn't load your timetable" on Today while the
 * timetable page, loaded a moment later, showed the empty state.
 */
export type TeacherScheduleAvailability = "published" | "unpublished" | "failed";

const TRANSIENT = new Set(["server", "timeout", "provider"]);

export async function readTeacherSchedule<T = unknown>(options: { signal?: AbortSignal; request?: typeof fetch; retryDelayMs?: number } = {}): Promise<T[]> {
  const { signal, request = fetch, retryDelayMs = 600 } = options;
  const attempt = async () => (await checkedListJson(await readRequest("/api/timetable/teacher", signal, request))).data as T[];
  try {
    return await attempt();
  } catch (error) {
    const failure = requestFailure(error);
    if (!TRANSIENT.has(failure.kind) || signal?.aborted) throw failure;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    try {
      return await attempt();
    } catch (retryError) {
      throw requestFailure(retryError);
    }
  }
}

export function scheduleAvailability(slots: readonly unknown[] | null, failure: RequestFailure | null): TeacherScheduleAvailability {
  if (failure || !slots) return "failed";
  return slots.length ? "published" : "unpublished";
}
