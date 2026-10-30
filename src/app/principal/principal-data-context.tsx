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

/**
 * The academic console's one data source, scoped to this provider mount (never a module cache).
 * A refresh after a save keeps the screen in place until the fresh payload lands (stale-while-revalidate, addendum
 * 2026-10-22 §3 — no skeleton flash); a refresh that fails clears what was shown (fail closed: a revoked grant never
 * leaves earlier records on screen) and the page shows its inline ErrorState with Retry — never also a toast (R4).
 */
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
