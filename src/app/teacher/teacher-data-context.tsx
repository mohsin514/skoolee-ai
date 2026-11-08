"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
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

  // Stale-while-revalidate within this mount (addendum 2026-10-22 §3): a refresh after a save (marks, report
  // cards, an AI draft) keeps the screen the teacher is working on instead of dropping it to the skeleton, and the
  // fresh payload replaces it when it lands. A refresh that fails clears what was shown (fail closed: a revoked
  // assignment must not leave its records on screen) and the page shows its inline error with Retry.
  const loadData = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true)
    setError(null)
    try {
      const fresh = await getTeacherDashboardData()
      if (version !== requestVersion.current) return
      setData(fresh)
    } catch (err: any) {
      if (version !== requestVersion.current) return
      setData(null)
      // Server-action failures surface raw engine text (query, build paths,
      // database host), so they never go straight to the user.
      // Reported once, inline, by the page's ErrorState with a retry — never
      // also as a toast (R4).
      setError(userMessage(err, "Could not load your dashboard."))
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
