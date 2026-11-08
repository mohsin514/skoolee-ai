// SKAI-1774: GET /api/transport/routes returns each route's links as `vehicles[]`. The list and its CSV export
// read the count from here so the Vehicles column matches the links saved in Riders & stops.
export function routeVehicleCount(route: { vehicles?: unknown[] | null } | null | undefined): number {
  return Array.isArray(route?.vehicles) ? route.vehicles.length : 0;
}
