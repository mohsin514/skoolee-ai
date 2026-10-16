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
