/** Synthetic server-action boundary: no database or current-user context is imported. */
export async function getTeacherDashboardData() {
  const response = await fetch('/synthetic/teacher-dashboard');
  if (!response.ok) throw new Error('Synthetic dashboard unavailable');
  return response.json();
}
