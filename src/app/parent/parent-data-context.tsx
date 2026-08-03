"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
  recent: { date: string; status: string }[];
}

interface FeeItem {
  id: string;
  invoiceNumber: string | null;
  totalAmount: number;
  paid: number;
  balance: number;
  status: string;
  dueDate: string;
}

export interface ParentData {
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
    logoUrl: string | null;
  };
  reportCards: ReportCard[];
  marksByExam: ExamMarks[];
  attendance: AttendanceData;
  fees: FeeItem[];
}

type ParentDataContextType = {
  data: ParentData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  token: string | null;
}

const ParentDataContext = createContext<ParentDataContextType>({
  data: null,
  loading: true,
  error: null,
  refetch: () => {},
  token: null,
});

export function ParentDataProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [data, setData] = useState<ParentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      const res = await fetch(`/api/parent/data?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Access denied");
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <ParentDataContext.Provider value={{ data, loading, error, refetch: loadData, token }}>
      {children}
    </ParentDataContext.Provider>
  );
}

export function useParentData() {
  return useContext(ParentDataContext);
}
