// SKO-507: the shape of one Pilot Ledger metric, shared by the service and the slide.
export interface LedgerMetric { claim: string; key: string; value: number | null; unit: "PERCENT" | "DAYS" | "COUNT" | "POINTS"; sample: number; estimate: boolean }
