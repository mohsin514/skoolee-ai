"use client";

import { useEffect, useState } from "react";
import type { StudentLite } from "./fee-types";

/** SKAI-1828: the fee pickers ask the server for at most this many matches instead of loading the roster. */
export const STUDENT_PICKER_LIMIT = 20;
export const STUDENT_PICKER_DEBOUNCE_MS = 300;

export function studentPickerUrl(campusId: string | undefined, search: string) {
  const params = new URLSearchParams({ fields: "picker", limit: String(STUDENT_PICKER_LIMIT) });
  if (campusId) params.set("campusId", campusId);
  const q = search.trim();
  if (q) params.set("search", q);
  return `/api/students?${params.toString()}`;
}

export type StudentPickerState = { students: StudentLite[]; total: number; loaded: boolean; failed: boolean };

/**
 * Server-side type-ahead over the campus roster (same scope as /api/students). Typing is debounced and a newer
 * query aborts the older request, so only the latest answer is shown. The empty query loads at once.
 */
export function useStudentPicker(campusId: string | undefined, search: string, enabled: boolean, reloadKey = 0): StudentPickerState {
  const [state, setState] = useState<StudentPickerState>({ students: [], total: 0, loaded: false, failed: false });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(studentPickerUrl(campusId, search), { signal: controller.signal });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error("Student search failed");
        setState({ students: json.data ?? [], total: json.pagination?.total ?? 0, loaded: true, failed: false });
      } catch {
        if (!controller.signal.aborted) setState((prev) => ({ ...prev, loaded: true, failed: true }));
      }
    }, search.trim() ? STUDENT_PICKER_DEBOUNCE_MS : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [campusId, search, enabled, reloadKey]);

  return state;
}

export type AddStudentNotice = "noStudents" | "allAssigned" | "noMatch" | "allMatchesAssigned" | null;

/**
 * SKAI-1945: which note the "Add student" list shows when it has nothing to add. An empty campus is not "all
 * assigned", and a search that finds nobody says so instead of leaving the list blank. Nothing shows while
 * loading, after a failure (the error state covers it) or when more students exist beyond this page.
 */
export function addStudentNotice(picker: StudentPickerState, search: string, addableCount: number): AddStudentNotice {
  if (!picker.loaded || picker.failed || addableCount > 0) return null;
  const searching = Boolean(search.trim());
  if (picker.students.length === 0) return searching ? "noMatch" : "noStudents";
  if (picker.total > picker.students.length) return null;
  return searching ? "allMatchesAssigned" : "allAssigned";
}
