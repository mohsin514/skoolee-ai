export const pending: { id: number; role: string; resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
function request(role: string): Promise<unknown> {
  return new Promise((resolve, reject) => { pending.push({ id: pending.length + 1, role, resolve, reject }); });
}
export const getPrincipalDashboardData = () => request("principal");
export const getSuperAdminDashboardData = () => request("super");
export const getStudentDashboardData = () => request("student");
