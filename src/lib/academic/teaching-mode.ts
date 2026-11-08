import { ApiError } from "@/lib/api/scope";

/** SINGLE: the class teacher teaches every subject. SUBJECT: each subject has its own teacher. */
export const TEACHING_MODES = ["SINGLE", "SUBJECT"] as const;
export type TeachingMode = (typeof TEACHING_MODES)[number];

/** SKAI-197: an omitted mode takes the fallback; an unknown one is refused instead of silently becoming SINGLE. */
export function parseTeachingMode(value: unknown, fallback: TeachingMode): TeachingMode {
  if (value === undefined || value === null || value === "") return fallback;
  const mode = String(value).trim().toUpperCase();
  if ((TEACHING_MODES as readonly string[]).includes(mode)) return mode as TeachingMode;
  throw new ApiError("teachingMode must be SINGLE or SUBJECT", 400);
}
