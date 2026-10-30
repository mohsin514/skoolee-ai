"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

interface ReportCard {
  id: string;
  examTitle: string;
  term: string;
  academicYear: number;
  percentage: number;
  grade: string | null;
  rank: number | null;
  obtainedMarks: number;
  totalMarks: number;
  remarksEn: string | null;
  remarksUr: string | null;
  pdfUrl: string | null;
  status: string;
}

interface MarkEntry {
  subject: string;
  obtained: number;
  total: number;
  grade: string | null;
}

interface ExamMarks {
  examId: string;
  examTitle: string;
  term: string;
  marks: MarkEntry[];
}

interface AttendanceData {
  rate: number | null;
  total: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  excused: number;
  /** Days attended under the school's published rule. */
  counted: number;
  attended: number;
  recent: { date: string; status: string }[];
}

interface FeeItem {
  currency: string;
  id: string;
  invoiceNumber: string | null;
  totalAmount: number;
  paid: number;
  balance: number;
  status: string;
  dueDate: string;
}

/** Outstanding balance per currency across every open invoice (the statement's semantics). */
export interface FeeTotal {
  currency: string;
  outstanding: number;
  invoices: number;
}

export interface ParentData {
  /** Booleans for the family console's registry: permission modules plus the family capability keys. */
  navigationAccess: Record<string, boolean>;
  access: { learningRecords: boolean; attendance: boolean; finances: boolean; communication: boolean; pickup: boolean };
  /** The signed-in guardian; the header greets them, not the child. */
  guardian: { fullName: string | null } | null;
  student: {
    fullName: string;
    rollNo: string;
    gender: string;
    profileImageUrl: string | null;
    className: string;
    academicYear: number;
  };
  campus: {
    name: string;
    city: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    principalName: string | null;
    board: string | null;
    logoUrl: string | null;
    school?: {
      name: string;
      logoUrl: string | null;
      phone: string | null;
      website: string | null;
      tagline: string | null;
      contactEmail: string | null;
      establishedYear: number | null;
    } | null;
  };
  reportCards: ReportCard[];
  marksByExam: ExamMarks[];
  attendance: AttendanceData;
  /** The few most recent invoices (charts only). Totals come from `feeTotals`. */
  fees: FeeItem[];
  feeTotals: FeeTotal[];
}

export type ParentChild = { id: string; fullName: string; rollNo: string | null };

type ParentDataContextType = {
  data: ParentData | null;
  loading: boolean;
  /** An EN UI key (pages pass it through `ui()`), never a raw server message. */
  error: string | null;
  refetch: () => void;
  /** Every child this guardian has at the school. */
  children: ParentChild[];
  /** The child currently being viewed, or null on a single-child account. */
  selectedStudentId: string | null;
  selectChild: (studentId: string) => void;
  /**
   * The registry access map the shell shows: the current child's, or — while the next child loads — the last
   * confirmed one, so the sidebar and mobile bar never drop to a skeleton on a child switch (§3.2, F19).
   */
  navigationAccess: Record<string, boolean> | null;
  /** The signed-in guardian's name, known even before (or without) a child payload. */
  guardianName: string | null;
  /** M98 / G4: a signed-in guardian with no linked child yet (an invitation may be waiting). */
  noChildren: boolean;
}

const ParentDataContext = createContext<ParentDataContextType>({
  data: null,
  loading: true,
  error: null,
  refetch: () => {},
  children: [],
  selectedStudentId: null,
  selectChild: () => {},
  navigationAccess: null,
  guardianName: null,
  noChildren: false,
});

/**
 * The last confirmed family payload in this tab (memory only — the child's records never go to storage): a remount of
 * the provider (back from a framed route such as /messages) shows it at once and revalidates in the background
 * instead of re-opening the skeleton. Both copies carry the identity they belong to and are ignored for any other.
 */
let lastPayload: { identity: string | null; requested: string | null; data: ParentData; children: ParentChild[] } | null = null;
let lastAccess: { identity: string | null; access: Record<string, boolean> } | null = null;

/**
 * The family console's navigation map for this browser tab's session (addendum 2026-10-22 §3): after a reload the
 * shell shows the guardian's last confirmed sidebar at once — only a session's very first load shows the shell
 * skeleton — while `/api/parent/data` revalidates. Booleans only (no child records), sessionStorage only (never
 * localStorage, never shared across tabs), trusted only for the exact identity the server rendered this page for
 * (user · school · role · access version), dropped on any other identity and on a refused load. Presentation only:
 * every family API and page route still enforces access on each request.
 */
const ACCESS_STORAGE_KEY = "skoolee.parent-access.v1";
function isBooleanMap(value: unknown): value is Record<string, boolean> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.values(value as object).every((entry) => typeof entry === "boolean");
}
function readStoredAccess(identity: string): Record<string, boolean> | null {
  try {
    const raw = window.sessionStorage.getItem(ACCESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; access?: unknown };
    if (parsed.key !== identity) {
      window.sessionStorage.removeItem(ACCESS_STORAGE_KEY);
      return null;
    }
    return isBooleanMap(parsed.access) ? parsed.access : null;
  } catch {
    return null;
  }
}
function storeAccess(identity: string | null, access: Record<string, boolean> | null) {
  lastAccess = access ? { identity, access } : null;
  try {
    if (identity && access) window.sessionStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify({ key: identity, access }));
    else window.sessionStorage.removeItem(ACCESS_STORAGE_KEY);
  } catch { /* blocked storage: the memory copy still serves client navigations */ }
}

/** Turns a failed response into one translated sentence that says what to do next (R4, R11). */
function loadErrorKey(status: number): string {
  if (status === 401 || status === 403) return "Your account can't open this child's records right now. Ask the school office to check your guardian link.";
  if (status === 404) return "This child's record wasn't found. Choose another child, or ask the school office.";
  return "Your child's details didn't load just now. Please try again in a moment.";
}

/**
 * The family portal's one data source, kept by the layout across every /parent route.
 *
 * It loads once per chosen child and keeps that payload while the guardian moves between pages,
 * so a page change never blanks the portal or re-fetches the same child (F19). Switching child
 * clears the payload first — showing the previous child's figures under the new name would be
 * worse than a skeleton — but the navigation keeps the last confirmed access map meanwhile.
 * A failed load is reported once, inline, by the page's ErrorState; it is never also toasted (R4).
 */
export function ParentDataProvider({ children, identity = null }: {
  children: ReactNode;
  /** `userId|schoolId|role|accessVersion` of the signed-in guardian, from the server render (layout). */
  identity?: string | null;
}) {
  const searchParams = useSearchParams();
  // A payment return (?student=) reopens the same child; the server still authorizes the choice.
  const requestedChild = searchParams.get("student");
  const seed = lastPayload && lastPayload.identity === identity && lastPayload.requested === requestedChild ? lastPayload : null;
  const seedAccess = lastAccess && lastAccess.identity === identity ? lastAccess.access : null;
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(requestedChild);
  // Shared layouts persist across client navigation and payment-return query changes.
  useEffect(() => {
    if (requestedChild !== null) setSelectedStudentId(requestedChild);
  }, [requestedChild]);
  const [data, setData] = useState<ParentData | null>(seed?.data ?? null);
  const [childList, setChildList] = useState<ParentChild[]>(seed?.children ?? []);
  const [loading, setLoading] = useState(!seed);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<Record<string, boolean> | null>(seed?.data.navigationAccess ?? seedAccess);
  const [guardianOnly, setGuardianOnly] = useState<{ fullName: string | null } | null>(null);
  const requestVersion = useRef(0);
  /** The child the current payload belongs to; a refetch for the same child keeps it on screen. */
  const loadedFor = useRef<string | null | undefined>(seed ? (seed.data as unknown as { selectedStudentId?: string }).selectedStudentId ?? seed.requested : undefined);

  const loadData = useCallback(async () => {
    const version = ++requestVersion.current;
    if (loadedFor.current !== undefined && selectedStudentId !== null && loadedFor.current !== selectedStudentId) setData(null);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedStudentId) params.set("studentId", selectedStudentId);
      const query = params.toString();
      const res = await fetch(`/api/parent/data${query ? `?${query}` : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (version !== requestVersion.current) return;
      if (res.ok && json.success && json.noChildren) {
        // No linked child yet: Home shows the invitations banner and an empty state; nothing else applies.
        setData(null);
        setChildList([]);
        setGuardianOnly(json.guardian ?? { fullName: null });
        setAccess(json.navigationAccess ?? {});
        storeAccess(identity, isBooleanMap(json.navigationAccess) ? json.navigationAccess : {});
        lastPayload = null;
        loadedFor.current = selectedStudentId;
      } else if (res.ok && json.success) {
        const payload = json.data as ParentData & { selectedStudentId?: string };
        loadedFor.current = payload.selectedStudentId ?? selectedStudentId;
        setGuardianOnly(null);
        setData(payload);
        setAccess(payload.navigationAccess);
        storeAccess(identity, isBooleanMap(payload.navigationAccess) ? payload.navigationAccess : null);
        const list = Array.isArray((payload as unknown as { children?: ParentChild[] }).children) ? (payload as unknown as { children: ParentChild[] }).children : [];
        setChildList(list);
        lastPayload = { identity, requested: selectedStudentId, data: payload, children: list };
      } else {
        setData(null);
        setError(loadErrorKey(res.status));
        // A refused load (signed out, guardian link revoked) drops the remembered navigation with it.
        if (res.status === 401 || res.status === 403) {
          storeAccess(null, null);
          lastPayload = null;
          setAccess(null);
        }
      }
    } catch {
      if (version !== requestVersion.current) return;
      // Shown under "Couldn't load your portal", so it says what to do next
      // rather than repeating that something failed.
      setData(null);
      setError("Your child's details didn't load just now. Please try again in a moment.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [selectedStudentId, identity]);

  useEffect(() => {
    void loadData();
    return () => { requestVersion.current += 1; };
  }, [loadData]);

  // After a reload (no memory copy) the stored map for this same identity draws the navigation while the family
  // payload loads; a map that arrives from the server first always wins. Read after mount: the server render has
  // no storage, so the first client render must match it.
  useEffect(() => {
    if (!identity) return;
    const stored = readStoredAccess(identity);
    if (stored) setAccess((current) => current ?? stored);
  }, [identity]);

  const activeId =
    selectedStudentId ??
    (data as unknown as { selectedStudentId?: string } | null)?.selectedStudentId ??
    null;

  // G7: choosing the child already on screen (the inbox and Home's primary do this before navigating) is a no-op,
  // so it never forces a reload of the same child.
  const activeRef = useRef(activeId);
  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  const selectChild = useCallback((studentId: string) => {
    if (studentId === activeRef.current) return;
    setSelectedStudentId(studentId);
  }, []);

  return (
    <ParentDataContext.Provider
      value={{
        data,
        loading,
        error,
        refetch: loadData,
        children: childList,
        selectedStudentId: activeId,
        selectChild,
        navigationAccess: data?.navigationAccess ?? access,
        guardianName: data?.guardian?.fullName ?? guardianOnly?.fullName ?? null,
        noChildren: Boolean(guardianOnly) && !data,
      }}
    >
      {children}
    </ParentDataContext.Provider>
  );
}

export function useParentData() {
  return useContext(ParentDataContext);
}
