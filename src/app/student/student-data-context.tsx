"use client"

import { createContext, useContext, type ReactNode } from "react"
import { usePrivateDashboardData } from "@/lib/auth/use-private-dashboard-data"
import { getStudentDashboardData } from "@/app/actions/dashboard"

type StudentDataContextType = {
  data: any
  loading: boolean
  error: string | null
  refetch: () => void
}

const StudentDataContext = createContext<StudentDataContextType>({
  data: null,
  loading: true,
  error: null,
  refetch: () => {},
})

/**
 * The learner console's one data source, kept by the layout across every /student route and scoped to this mount
 * (never a module cache). A refresh keeps the screen the learner is on until the fresh payload lands
 * (stale-while-revalidate, addendum 2026-10-22 §3); a refresh that fails clears what was shown (fail closed) and the
 * page shows its inline error with Retry — never also a toast (R4).
 */
export function StudentDataProvider({ children }: { children: ReactNode }) {
  const value = usePrivateDashboardData(getStudentDashboardData)

  return (
    <StudentDataContext.Provider value={value}>
      {children}
    </StudentDataContext.Provider>
  )
}

export function useStudentData() {
  return useContext(StudentDataContext)
}
