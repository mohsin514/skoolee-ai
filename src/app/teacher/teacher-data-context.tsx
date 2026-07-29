"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { getTeacherDashboardData } from "@/app/actions/dashboard"

type TeacherDataContextType = {
  data: any
  loading: boolean
  error: string | null
  refetch: () => void
}

const TeacherDataContext = createContext<TeacherDataContextType>({
  data: null,
  loading: true,
  error: null,
  refetch: () => {},
})

export function TeacherDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getTeacherDashboardData())
    } catch (err: any) {
      setError(err.message)
      toast.error(`Access denied: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <TeacherDataContext.Provider value={{ data, loading, error, refetch: loadData }}>
      {children}
    </TeacherDataContext.Provider>
  )
}

export function useTeacherData() {
  return useContext(TeacherDataContext)
}
