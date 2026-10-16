"use client"

import { createContext, useContext, type ReactNode } from "react"
import { usePrivateDashboardData } from "@/lib/auth/use-private-dashboard-data"
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
  const value = usePrivateDashboardData(getSuperAdminDashboardData)

  return (
    <SuperAdminDataContext.Provider value={value}>
      {children}
    </SuperAdminDataContext.Provider>
  )
}

export function useSuperAdminData() {
  return useContext(SuperAdminDataContext)
}
