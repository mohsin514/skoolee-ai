"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

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

export interface ParentData {
  navigationAccess: Record<string, boolean>;
  access: { learningRecords: boolean; attendance: boolean; finances: boolean; communication: boolean; pickup: boolean };
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
  fees: FeeItem[];
}

export type ParentChild = { id: string; fullName: string; rollNo: string | null };

type ParentDataContextType = {
  data: ParentData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  token: string | null;
  /** Every child this guardian has at the school. */
  children: ParentChild[];
  /** The child currently being viewed, or null on a single-child account. */
  selectedStudentId: string | null;
  selectChild: (studentId: string) => void;
}

const ParentDataContext = createContext<ParentDataContextType>({
  data: null,
  loading: true,
  error: null,
  refetch: () => {},
  token: null,
  children: [],
  selectedStudentId: null,
  selectChild: () => {},
});

export function ParentDataProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const token = searchParams.get("token");
  // A guardian with siblings switches between them, and each child's payload
  // has to cache separately or the switch would serve the previous child.
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [data, setData] = useState<ParentData | null>(null);
  const [loading, setLoading] = useState(data === null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      if (selectedStudentId) params.set("studentId", selectedStudentId);
      const res = await fetch(`/api/parent/data?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Access denied");
      }
    } catch {
      setError("Failed to load data");
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token, selectedStudentId]);

  useEffect(() => {
    loadData();
  }, [loadData, pathname]);

  const selectChild = useCallback((studentId: string) => {
    setSelectedStudentId(studentId);
  }, []);

  const childList = (data as unknown as { children?: ParentChild[] })?.children ?? [];
  const activeId =
    selectedStudentId ??
    (data as unknown as { selectedStudentId?: string })?.selectedStudentId ??
    null;

  return (
    <ParentDataContext.Provider
      value={{
        data,
        loading,
        error,
        refetch: loadData,
        token,
        children: childList,
        selectedStudentId: activeId,
        selectChild,
      }}
    >
      {children}
    </ParentDataContext.Provider>
  );
}

export function useParentData() {
  return useContext(ParentDataContext);
}
