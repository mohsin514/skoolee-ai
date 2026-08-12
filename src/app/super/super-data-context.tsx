"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { getSuperAdminDashboardData } from "@/app/actions/dashboard"

type SuperAdminDataContextType = {
  data: any
  loading: boolean
  error: string | null
  refetch: () => void
}

const SuperAdminDataContext = createContext<SuperAdminDataContextType>({
  data: null,
  loading: true,
  error: null,
  refetch: () => {},
})

const CACHE_KEY = "super-dashboard"
const CACHE_TTL = 60_000
const cache = new Map<string, { data: any; ts: number }>()

export function SuperAdminDataProvider({ children }: { children: ReactNode }) {
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
      const fresh = await getSuperAdminDashboardData()
      cache.set(CACHE_KEY, { data: fresh, ts: Date.now() })
      setData(fresh)
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
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
    <SuperAdminDataContext.Provider value={{ data, loading, error, refetch: loadData }}>
      {children}
    </SuperAdminDataContext.Provider>
  )
}

export function useSuperAdminData() {
  return useContext(SuperAdminDataContext)
}
