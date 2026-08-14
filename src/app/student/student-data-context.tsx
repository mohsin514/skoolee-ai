"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { userMessage } from "@/lib/errors"
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

const CACHE_KEY = "student-dashboard"
const CACHE_TTL = 60_000
const cache = new Map<string, { data: any; ts: number }>()

export function StudentDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<any>(() => {
    const cached = cache.get(CACHE_KEY)
    return cached && Date.now() - cached.ts < CACHE_TTL ? cached.data : null
  })
  const [loading, setLoading] = useState(data === null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (data === null) setLoading(true)
    setError(null)
    try {
      const fresh = await getStudentDashboardData()
      cache.set(CACHE_KEY, { data: fresh, ts: Date.now() })
      setData(fresh)
    } catch (err: any) {
      // Server-action failures surface raw engine text (query, build paths,
      // database host), so they never go straight to the user.
      const message = userMessage(err, "Could not load your dashboard.")
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [data])

  useEffect(() => {
    const cached = cache.get(CACHE_KEY)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setData(cached.data)
      setLoading(false)
      return
    }
    loadData()
  }, [loadData])

  return (
    <StudentDataContext.Provider value={{ data, loading, error, refetch: loadData }}>
      {children}
    </StudentDataContext.Provider>
  )
}

export function useStudentData() {
  return useContext(StudentDataContext)
}
