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

export function SuperAdminDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getSuperAdminDashboardData())
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <SuperAdminDataContext.Provider value={{ data, loading, error, refetch: loadData }}>
      {children}
    </SuperAdminDataContext.Provider>
  )
}

export function useSuperAdminData() {
  return useContext(SuperAdminDataContext)
}
