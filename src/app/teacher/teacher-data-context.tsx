"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { userMessage } from "@/lib/errors"
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
  const requestVersion = useRef(0)

  const loadData = useCallback(async () => {
    const version = ++requestVersion.current
    setData(null)
    setLoading(true)
    setError(null)
    try {
      const fresh = await getTeacherDashboardData()
      if (version !== requestVersion.current) return
      setData(fresh)
    } catch (err: any) {
      if (version !== requestVersion.current) return
      // Server-action failures surface raw engine text (query, build paths,
      // database host), so they never go straight to the user.
      const message = userMessage(err, "Could not load your dashboard.")
      setError(message)
      toast.error(message)
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [])

  // The layout retains this context between teacher routes. A module-global
  // cache would outlive its actor/campus and expose the previous roster on a
  // new scope's first render. Each scoped mount starts closed instead.
  useEffect(() => {
    void loadData()
    return () => { requestVersion.current += 1 }
  }, [loadData])

  return (
    <TeacherDataContext.Provider value={{ data, loading, error, refetch: loadData }}>
      {children}
    </TeacherDataContext.Provider>
  )
}

export function useTeacherData() {
  return useContext(TeacherDataContext)
}
