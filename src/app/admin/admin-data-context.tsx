"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { getCampusDashboardData } from "@/app/actions/dashboard"

type AdminDataContextType = {
  data: any
  loading: boolean
  error: string | null
  refetch: () => void
}

const AdminDataContext = createContext<AdminDataContextType>({
  data: null,
  loading: true,
  error: null,
  refetch: () => {},
})

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getCampusDashboardData())
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <AdminDataContext.Provider value={{ data, loading, error, refetch: loadData }}>
      {children}
    </AdminDataContext.Provider>
  )
}

export function useAdminData() {
  return useContext(AdminDataContext)
}
