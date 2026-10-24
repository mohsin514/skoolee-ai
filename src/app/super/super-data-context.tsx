"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { getSuperAdminDashboardData } from "@/app/actions/dashboard"
import { usePrivateDashboardData } from "@/lib/auth/use-private-dashboard-data"

/**
 * The group console's dashboard data, loaded once per signed-in scope (the layout keys this provider on the
 * session) and shared by every `?view=`. A failed load is reported inline by the view that needs the data
 * (ErrorState with retry, R4) — never as a toast and never by signing the user out. Views that do not need it
 * (Billing & plan, which must work while the school is suspended, F3) render without waiting for it.
 *
 * Suspension (F3, §3.2, §2.1 note 2) is decided from the school's state, not from "the loader failed":
 * - the layout reads it on the server for the page load (`initialSuspended`), so a suspended school never opens
 *   the chat stream, even while the first load is in flight, and the loader is not called at all;
 * - a school suspended mid-session is recognised when a reload fails: production builds strip server-action
 *   error messages, so the console asks the proxy, which answers 402 for any school API that is not on the
 *   suspended allow-list (a HEAD request is the cheapest question).
 */
type SuperAdminData = Awaited<ReturnType<typeof getSuperAdminDashboardData>>

type SuperAdminDataContextType = {
  data: SuperAdminData | null
  loading: boolean
  error: string | null
  /** The school's subscription is paused: only Billing & plan works; no chat stream opens. */
  suspended: boolean
  refetch: () => Promise<void>
}

const SuperAdminDataContext = createContext<SuperAdminDataContextType>({
  data: null,
  loading: true,
  error: null,
  suspended: false,
  refetch: async () => {},
})

/** True when the proxy answers a school API with 402 (the suspended school's refusal). */
export async function probeSuspended(): Promise<boolean> {
  try {
    const response = await fetch("/api/super/support-grants", { method: "HEAD", cache: "no-store" })
    return response.status === 402
  } catch {
    return false
  }
}

export function SuperAdminDataProvider({ children, initialSuspended = false }: { children: ReactNode; initialSuspended?: boolean }) {
  const [suspended, setSuspended] = useState(initialSuspended)
  const { data, loading, error, refetch } = usePrivateDashboardData<SuperAdminData>(getSuperAdminDashboardData, {
    // A school the layout already knows is paused has nothing to load: every view but Billing & plan shows the
    // paused notice. Renewing reloads the page (provider return) or calls refetch.
    enabled: !initialSuspended,
    onSettled: async (ok, isCurrent) => {
      if (ok) { setSuspended(false); return }
      const paused = await probeSuspended()
      if (isCurrent()) setSuspended(paused)
    },
  })

  return (
    <SuperAdminDataContext.Provider value={{ data, loading, error, suspended, refetch }}>
      {children}
    </SuperAdminDataContext.Provider>
  )
}

export function useSuperAdminData() {
  return useContext(SuperAdminDataContext)
}
