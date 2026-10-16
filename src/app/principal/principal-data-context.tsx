"use client"

import { createContext, useContext, type ReactNode } from "react"
import { usePrivateDashboardData } from "@/lib/auth/use-private-dashboard-data"
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
  const value = usePrivateDashboardData(getPrincipalDashboardData)

  return (
    <PrincipalDataContext.Provider value={value}>
      {children}
    </PrincipalDataContext.Provider>
  )
}

export function usePrincipalData() {
  return useContext(PrincipalDataContext)
}
