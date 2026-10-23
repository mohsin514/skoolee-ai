/** Campus setup writes belong to campus operators. Group governance and platform support are separate. */
export function canConfigureCampus(role: string): boolean {
  return role === "ADMIN" || role === "CAMPUS_ADMIN";
}

export function institutionSetupDestination(kind: string): "/setup/readiness" | "/ai?setup=1" {
  return kind === "GROUP" ? "/setup/readiness" : "/ai?setup=1";
}

/** Presentation restrictions supplement server permissions; historical records remain in History. */
export function roleAllowsWorkflowTab(role: string, tab: string): boolean {
  if (role === "SUPER_ADMIN") return ["overview", "setupTasks", "policies", "knowledge", "sources", "history"].includes(tab);
  if (role === "PRINCIPAL") return !["schoolSetup", "financeOperations", "feeInvoices"].includes(tab);
  return true;
}
