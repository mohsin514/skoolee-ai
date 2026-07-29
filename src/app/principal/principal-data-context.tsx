"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { getPrincipalDashboardData } from "@/app/actions/dashboard"

type PrincipalDataContextType = {
  data: any
  loading: boolean
  error: string | null
  refetch: () => void
}

const PrincipalDataContext = createContext<PrincipalDataContextType>({
  data: null,
  loading: true,
  error: null,
  refetch: () => {},
})

export function PrincipalDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getPrincipalDashboardData())
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <PrincipalDataContext.Provider value={{ data, loading, error, refetch: loadData }}>
      {children}
    </PrincipalDataContext.Provider>
  )
}

export function usePrincipalData() {
  return useContext(PrincipalDataContext)
}
