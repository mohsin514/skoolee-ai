"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
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
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getStudentDashboardData())
    } catch (err: any) {
      setError(err.message)
      toast.error(`Access denied: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <StudentDataContext.Provider value={{ data, loading, error, refetch: loadData }}>
      {children}
    </StudentDataContext.Provider>
  )
}

export function useStudentData() {
  return useContext(StudentDataContext)
}
