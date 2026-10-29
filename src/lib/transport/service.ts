import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, assertStaffRole, canManageOperations } from "@/lib/api/scope";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { guardianRelationshipAuthorityWhere } from "@/lib/parent/guardian-query";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-437: routes, fleet and riders, then dated trips with a frozen expected manifest.
// - Coordinators (campus leaders) manage stops, vehicles on a route and riders. A route never carries more
//   riders than its largest active vehicle seats, and nothing crosses campuses.
// - Publishing a trip copies the route's riders, vehicle and crew into the trip. Later route or fleet edits
//   never rewrite it; changes are recorded amendments by a coordinator, and a removed rider stays visible.
// - The attendant records what they observe — boarding, stop arrival, absence, handover — each with actor,
//   student, trip and the time it happened (sent from the device, so an offline queue keeps its times); a
//   replayed event is recognised by its client id and changes nothing. A child is boarded on one trip at a
//   time (a partial unique index); a second boarding opens an exception for the coordinator.
// - Handover needs a named recipient: staff, a current guardian or an authorised adult whose identity was
//   checked. No recipient means an exception, never a "handed over".
// - Normal closure needs every rider reconciled, no open exception and a signed empty-vehicle check. An
//   emergency closure needs a reason and leaves an owned exception for everyone unresolved.
// - Crews see their trip only: names, stops and status — no academic, clinic or family contact data.
// This module sends no notifications (see ./notify).

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const required = (v: unknown, max: number, message: string) => {
  const s = String(v ?? "").trim();
  if (!s) throw new ApiError(message, 400);
  return s.slice(0, max);
};
const isCoordinator = canManageOperations;
const campusOf = (user: AuthUser, requested?: unknown) => {
  const campusId = user.role === "SUPER_ADMIN" ? String(requested || user.campusId || "") : user.campusId ?? "";
  if (!campusId) throw new ApiError("Choose a campus.", 400);
  return campusId;
};
function coordinator(user: AuthUser) {
  if (!isCoordinator(user)) throw new ApiError("Only transport coordinators can change routes, riders and trips.", 403);
}
const OPEN = ["PUBLISHED", "DEPARTED"];
const UNRESOLVED = ["EXPECTED", "BOARDED"];
const ACTIVE_ON_TRIP = ["EXPECTED", "ABSENT", "BOARDED", "HANDED_OVER"];

// ─── Routes, stops, vehicles, riders ─────────────────────────────────────

/** Seats on the route: the largest active vehicle assigned to it (one vehicle runs a trip). */
async function routeSeats(tx: TxClient | typeof prisma, routeId: string) {
  const links = await tx.routeVehicle.findMany({ where: { routeId, vehicle: { active: true } }, select: { vehicle: { select: { capacity: true } } } });
  return links.reduce((max, l) => Math.max(max, l.vehicle.capacity ?? 0), 0);
}

export async function routeDetail(user: AuthUser, routeId: string) {
  coordinator(user);
  const campusId = campusOf(user);
  const route = await prisma.transportRoute.findFirst({ where: { id: routeId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId }) }, include: { stops: { orderBy: { sequence: "asc" } }, vehicles: { include: { vehicle: true } } } });
  if (!route) throw new ApiError("Route not found", 404);
  const riders = await prisma.student.findMany({ where: { schoolId: user.schoolId, transportRouteId: route.id }, select: { id: true, fullName: true, rollNo: true, archivedAt: true, class: { select: { name: true, section: true } } }, orderBy: { fullName: "asc" } });
  const stops = await prisma.transportRiderStop.findMany({ where: { schoolId: user.schoolId, studentId: { in: riders.map(r => r.id) } }, select: { studentId: true, stopId: true } });
  return {
    id: route.id, title: route.title, active: route.active, campusId: route.campusId, seats: await routeSeats(prisma, route.id),
    stops: route.stops.map(s => ({ id: s.id, name: s.name, sequence: s.sequence, active: s.active })),
    vehicles: route.vehicles.map(v => ({ id: v.vehicle.id, number: v.vehicle.number, capacity: v.vehicle.capacity, active: v.vehicle.active, driverName: v.vehicle.driverName })),
    riders: riders.map(r => ({ id: r.id, fullName: r.fullName, rollNo: r.rollNo, archived: !!r.archivedAt, className: r.class ? `${r.class.name}${r.class.section ? ` ${r.class.section}` : ""}` : "", stopId: stops.find(s => s.studentId === r.id)?.stopId ?? null })),
  };
}

async function ownRoute(user: AuthUser, tx: TxClient | typeof prisma, routeId: string) {
  const route = await tx.transportRoute.findFirst({ where: { id: routeId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
  if (!route) throw new ApiError("Route not found", 404);
  return route;
}

export async function saveStop(user: AuthUser, body: Record<string, unknown>) {
  coordinator(user);
  const route = await ownRoute(user, prisma, String(body.routeId ?? ""));
  const name = required(body.name, 120, "Name the stop.");
  const sequence = Number(body.sequence ?? 0);
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 999) throw new ApiError("Give the stop's order as a whole number.", 400);
  try {
    if (body.id) {
      const done = await prisma.transportStop.updateMany({ where: { id: String(body.id), routeId: route.id }, data: { name, sequence, active: body.active !== false } });
      if (!done.count) throw new ApiError("Stop not found", 404);
      return { id: String(body.id) };
    }
    return await prisma.transportStop.create({ data: { schoolId: user.schoolId, routeId: route.id, name, sequence }, select: { id: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("This route already has a stop with that name.", 409);
    throw error;
  }
}

/** Vehicles on a route: same campus only, and the largest must seat the riders already assigned. */
export async function setRouteVehicles(user: AuthUser, routeId: string, vehicleIds: string[]) {
  coordinator(user);
  return schoolAiTransaction(user, async tx => {
    const route = await ownRoute(user, tx, routeId);
    const unique = [...new Set(vehicleIds)];
    const vehicles = await tx.vehicle.findMany({ where: { id: { in: unique }, schoolId: user.schoolId }, select: { id: true, campusId: true, capacity: true, active: true } });
    if (vehicles.length !== unique.length || vehicles.some(v => v.campusId !== route.campusId)) throw new ApiError("Choose vehicles from this route's campus.", 400);
    const riders = await tx.student.count({ where: { schoolId: user.schoolId, transportRouteId: route.id, archivedAt: null } });
    const seats = vehicles.filter(v => v.active).reduce((max, v) => Math.max(max, v.capacity ?? 0), 0);
    if (riders > 0 && seats < riders) throw new ApiError(`This route has ${riders} riders; the largest active vehicle chosen seats ${seats}. The route was not changed.`, 409);
    await tx.routeVehicle.deleteMany({ where: { routeId: route.id } });
    if (unique.length) await tx.routeVehicle.createMany({ data: unique.map(vehicleId => ({ schoolId: user.schoolId, routeId: route.id, vehicleId })) });
    return { id: route.id };
  });
}

/** A vehicle cannot shrink below, or be deactivated from under, a route that depends on its seats. */
export async function assertVehicleChange(user: AuthUser, vehicleId: string, next: { capacity?: number | null; active?: boolean }) {
  const links = await prisma.routeVehicle.findMany({ where: { vehicleId, schoolId: user.schoolId }, select: { routeId: true, route: { select: { title: true } } } });
  for (const link of links) {
    const riders = await prisma.student.count({ where: { schoolId: user.schoolId, transportRouteId: link.routeId, archivedAt: null } });
    if (!riders) continue;
    const others = await prisma.routeVehicle.findMany({ where: { routeId: link.routeId, vehicleId: { not: vehicleId }, vehicle: { active: true } }, select: { vehicle: { select: { capacity: true } } } });
    const current = await prisma.vehicle.findFirst({ where: { id: vehicleId }, select: { capacity: true, active: true } });
    const capacity = next.capacity !== undefined ? next.capacity : current?.capacity;
    const active = next.active !== undefined ? next.active : current?.active;
    const seats = Math.max(active ? capacity ?? 0 : 0, ...others.map(o => o.vehicle.capacity ?? 0));
    if (seats < riders) throw new ApiError(`Route ${link.route.title} has ${riders} riders and would have only ${seats} seats. The vehicle was not changed.`, 409);
  }
}

export async function assignRider(user: AuthUser, body: Record<string, unknown>) {
  coordinator(user);
  return schoolAiTransaction(user, async tx => {
    const route = await ownRoute(user, tx, String(body.routeId ?? ""));
    if (!route.active) throw new ApiError("This route is inactive. Reactivate it before assigning riders.", 409);
    // Serialise assignments to one route so two coordinators cannot both take the last seat.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`route:${route.id}`}))`;
    const student = await tx.student.findFirst({ where: { id: String(body.studentId ?? ""), schoolId: user.schoolId, archivedAt: null }, select: { id: true, campusId: true, transportRouteId: true } });
    if (!student) throw new ApiError("Student not found", 404);
    if (student.campusId !== route.campusId) throw new ApiError("This student is at another campus. Riders and routes must be on the same campus.", 400);
    const stopId = text(body.stopId, 64) || null;
    if (stopId && !(await tx.transportStop.findFirst({ where: { id: stopId, routeId: route.id, active: true } }))) throw new ApiError("Choose an active stop on this route.", 400);
    if (student.transportRouteId !== route.id) {
      const seats = await routeSeats(tx, route.id);
      if (!seats) throw new ApiError("Assign a vehicle with a capacity to this route first.", 409);
      const riders = await tx.student.count({ where: { schoolId: user.schoolId, transportRouteId: route.id, archivedAt: null } });
      if (riders + 1 > seats) throw new ApiError(`This route is full (${riders} of ${seats} seats). The rider was not assigned.`, 409);
      await tx.student.update({ where: { id: student.id }, data: { transportRouteId: route.id } });
    }
    if (stopId) await tx.transportRiderStop.upsert({ where: { studentId: student.id }, create: { schoolId: user.schoolId, studentId: student.id, stopId }, update: { stopId } });
    else await tx.transportRiderStop.deleteMany({ where: { studentId: student.id } });
    return { id: student.id, routeId: route.id };
  });
}

/** Removes the assignment for future trips only; a published trip keeps the rider on its manifest. */
export async function unassignRider(user: AuthUser, studentId: string) {
  coordinator(user);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true } });
  if (!student) throw new ApiError("Student not found", 404);
  await prisma.$transaction([
    prisma.student.update({ where: { id: student.id }, data: { transportRouteId: null } }),
    prisma.transportRiderStop.deleteMany({ where: { studentId: student.id } }),
  ]);
  return { id: student.id };
}

export async function findStudents(user: AuthUser, q: string) {
  coordinator(user);
  const query = q.trim();
  if (query.length < 2) return [];
  return prisma.student.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }), OR: [{ fullName: { contains: query, mode: "insensitive" } }, { rollNo: { contains: query } }] }, select: { id: true, fullName: true, rollNo: true, transportRouteId: true, class: { select: { name: true, section: true } } }, take: 15 });
}

// ─── Trips: publish, amend, coordinate ───────────────────────────────────

/** Inside a transaction, pass its client: a top-level query there waits for a second pooled connection, and with
 *  one connection per serverless instance (SKAI-1038) it never gets one (SKAI-1029, P2024). */
async function today(schoolId: string, campusId: string, db: TxClient | typeof prisma = prisma) {
  return calendarDateIn((await getLocalePackage(schoolId, campusId, new Date(), null, db)).timezone, new Date());
}

export async function publishTrip(user: AuthUser, body: Record<string, unknown>) {
  coordinator(user);
  const direction = String(body.direction ?? "");
  if (direction !== "AM" && direction !== "PM") throw new ApiError("Choose the morning or afternoon run.", 400);
  const serviceDate = String(body.serviceDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) throw new ApiError("Choose the day of the trip.", 400);
  try {
    return await schoolAiTransaction(user, async tx => {
      const route = await ownRoute(user, tx, String(body.routeId ?? ""));
      if (!route.active) throw new ApiError("This route is inactive.", 409);
      if (serviceDate < await today(user.schoolId, route.campusId, tx)) throw new ApiError("A trip cannot be published for a past day.", 400);
      const link = await tx.routeVehicle.findFirst({ where: { routeId: route.id, vehicleId: String(body.vehicleId ?? "") }, include: { vehicle: true } });
      if (!link || !link.vehicle.active || link.vehicle.campusId !== route.campusId) throw new ApiError("Choose an active vehicle assigned to this route.", 400);
      if (!link.vehicle.capacity) throw new ApiError("Record the vehicle's capacity before publishing a trip.", 400);
      const attendant = await tx.user.findFirst({ where: { id: String(body.attendantId ?? ""), schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] }, OR: [{ campusId: route.campusId }, { campusId: null }] }, select: { id: true } });
      if (!attendant) throw new ApiError("Choose an active staff member at this campus as the attendant.", 400);
      const riders = await tx.student.findMany({ where: { schoolId: user.schoolId, transportRouteId: route.id, archivedAt: null, campusId: route.campusId }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
      const stops = await tx.transportRiderStop.findMany({ where: { studentId: { in: riders.map(r => r.id) } }, include: { stop: { select: { name: true, sequence: true } } } });
      const label = text(body.label, 40) || `${route.title} · ${direction}`;
      const trip = await tx.transportTrip.create({ data: { schoolId: user.schoolId, campusId: route.campusId, routeId: route.id, vehicleId: link.vehicle.id, serviceDate, direction, label, routeTitle: route.title, vehicleNumber: link.vehicle.number, vehicleCapacity: link.vehicle.capacity, driverName: link.vehicle.driverName, attendantId: attendant.id, coordinatorId: user.userId } });
      if (riders.length) await tx.tripPassenger.createMany({ data: riders.map(r => ({ schoolId: user.schoolId, tripId: trip.id, studentId: r.id, studentName: r.fullName, stopName: stops.find(s => s.studentId === r.id)?.stop.name ?? null })) });
      await tx.tripEvent.create({ data: { schoolId: user.schoolId, tripId: trip.id, kind: "PUBLISHED", occurredAt: new Date(), actorId: user.userId, detail: { expected: riders.length, vehicle: link.vehicle.number, capacity: link.vehicle.capacity } } });
      const exceptions: string[] = [];
      if (riders.length > link.vehicle.capacity) exceptions.push((await tx.tripException.create({ data: { schoolId: user.schoolId, tripId: trip.id, kind: "CAPACITY_OVERFLOW", note: `${riders.length} expected riders for ${link.vehicle.capacity} seats.`, ownerId: user.userId, createdById: user.userId } })).id);
      return { id: trip.id, expected: riders.length, exceptions, ownerId: user.userId, campusId: route.campusId };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("This route already has a trip for that day and run.", 409);
    throw error;
  }
}

async function tripFor(user: AuthUser, tx: TxClient | typeof prisma, tripId: string, mode: "crew" | "coordinator" = "crew") {
  const trip = await tx.transportTrip.findFirst({ where: { id: tripId, schoolId: user.schoolId } });
  if (!trip) throw new ApiError("Trip not found", 404);
  const lead = isCoordinator(user) && (user.role === "SUPER_ADMIN" || user.campusId === trip.campusId);
  if (mode === "coordinator" && !lead) throw new ApiError("Only the transport coordinator can do this.", 403);
  if (!lead && trip.attendantId !== user.userId) throw new ApiError("This trip is not assigned to your crew.", 403);
  return { trip, lead };
}

const counts = (passengers: { status: string }[]) => ({
  expected: passengers.filter(p => ACTIVE_ON_TRIP.includes(p.status)).length,
  boarded: passengers.filter(p => p.status === "BOARDED" || p.status === "HANDED_OVER").length,
  handedOver: passengers.filter(p => p.status === "HANDED_OVER").length,
  absent: passengers.filter(p => p.status === "ABSENT").length,
  onBoard: passengers.filter(p => p.status === "BOARDED").length,
  unresolved: passengers.filter(p => UNRESOLVED.includes(p.status)).length,
});

/** Trip view. Crews get names, stops and statuses only; coordinators also see the event history. */
export async function tripDetail(user: AuthUser, tripId: string) {
  assertStaffRole(user);
  const { trip, lead } = await tripFor(user, prisma, tripId);
  const [passengers, exceptions, events] = await Promise.all([
    prisma.tripPassenger.findMany({ where: { tripId: trip.id }, orderBy: [{ stopName: "asc" }, { studentName: "asc" }] }),
    prisma.tripException.findMany({ where: { tripId: trip.id }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] }),
    lead ? prisma.tripEvent.findMany({ where: { tripId: trip.id }, orderBy: { occurredAt: "asc" } }) : Promise.resolve([]),
  ]);
  const ids = [trip.attendantId, trip.coordinatorId, trip.vehicleCheckById, ...exceptions.map(e => e.ownerId), ...events.map(e => e.actorId), ...passengers.flatMap(p => [p.boardedById, p.handedOverById])].filter(Boolean) as string[];
  const people = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName]));
  return {
    trip: { id: trip.id, label: trip.label, serviceDate: trip.serviceDate, direction: trip.direction, routeTitle: trip.routeTitle, vehicleNumber: trip.vehicleNumber, vehicleCapacity: trip.vehicleCapacity, driverName: trip.driverName, status: trip.status, version: trip.version, attendant: people.get(trip.attendantId) ?? "", coordinator: people.get(trip.coordinatorId) ?? "", departedAt: trip.departedAt, vehicleCheckAt: trip.vehicleCheckAt, vehicleCheckBy: trip.vehicleCheckById ? people.get(trip.vehicleCheckById) ?? "" : null, closedAt: trip.closedAt, emergencyReason: trip.emergencyReason },
    lead,
    counts: { ...counts(passengers), openExceptions: exceptions.filter(e => e.status === "OPEN").length },
    passengers: passengers.map(p => ({ id: p.id, studentId: p.studentId, name: p.studentName, stop: p.stopName, source: p.source, status: p.status, boardedAt: p.boardedAt, boardedBy: p.boardedById ? people.get(p.boardedById) ?? "" : null, handedOverAt: p.handedOverAt, receiverType: p.receiverType, receiverName: p.receiverName, note: lead ? p.note : null })),
    exceptions: exceptions.map(e => ({ id: e.id, kind: e.kind, studentId: e.studentId, note: e.note, owner: people.get(e.ownerId) ?? "", ownerId: e.ownerId, status: e.status, resolution: e.resolution, createdAt: e.createdAt })),
    events: events.map(e => ({ id: e.id, kind: e.kind, studentId: e.studentId, occurredAt: e.occurredAt, recordedAt: e.recordedAt, actor: people.get(e.actorId) ?? "", detail: e.detail })),
  };
}

/** Trips for a day: the coordinator's campus, or only the trips this person crews. */
export async function listTrips(user: AuthUser, date?: string | null) {
  assertStaffRole(user);
  const campusId = user.campusId ?? "";
  const serviceDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : campusId ? await today(user.schoolId, campusId) : calendarDateIn("UTC");
  const lead = isCoordinator(user);
  const trips = await prisma.transportTrip.findMany({ where: { schoolId: user.schoolId, serviceDate, ...(lead ? (user.role === "SUPER_ADMIN" ? {} : { campusId }) : { attendantId: user.userId }) }, orderBy: [{ direction: "asc" }, { label: "asc" }], include: { passengers: { select: { status: true } }, exceptions: { where: { status: "OPEN" }, select: { id: true } } } });
  return { serviceDate, lead, trips: trips.map(t => ({ id: t.id, label: t.label, direction: t.direction, vehicleNumber: t.vehicleNumber, status: t.status, ...counts(t.passengers), openExceptions: t.exceptions.length })) };
}

/** Coordinator-only amendments after publication: the original manifest rows are kept. */
export async function amend(user: AuthUser, body: Record<string, unknown>) {
  const reason = required(body.reason, 300, "Give the reason for the change.");
  return schoolAiTransaction(user, async tx => {
    const { trip } = await tripFor(user, tx, String(body.tripId ?? ""), "coordinator");
    if (!OPEN.includes(trip.status)) throw new ApiError("This trip is closed.", 409);
    const studentId = String(body.studentId ?? "");
    const existing = await tx.tripPassenger.findFirst({ where: { tripId: trip.id, studentId } });
    const late = trip.status === "DEPARTED";
    let overflow: string | null = null;
    if (body.change === "add") {
      if (existing && existing.status !== "REMOVED") throw new ApiError("This student is already on the trip.", 409);
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, archivedAt: null }, select: { id: true, fullName: true, campusId: true } });
      if (!student || student.campusId !== trip.campusId) throw new ApiError("Choose a student at this trip's campus.", 400);
      if (existing) await tx.tripPassenger.update({ where: { id: existing.id }, data: { status: "EXPECTED", source: "AMENDMENT", note: reason } });
      else await tx.tripPassenger.create({ data: { schoolId: user.schoolId, tripId: trip.id, studentId, studentName: student.fullName, stopName: text(body.stopName, 120) || null, source: "AMENDMENT", note: reason } });
      const active = await tx.tripPassenger.count({ where: { tripId: trip.id, status: { in: ACTIVE_ON_TRIP } } });
      if (active > trip.vehicleCapacity) overflow = (await tx.tripException.create({ data: { schoolId: user.schoolId, tripId: trip.id, studentId, kind: "CAPACITY_OVERFLOW", note: `${active} riders for ${trip.vehicleCapacity} seats after an amendment.`, ownerId: user.userId, createdById: user.userId } })).id;
    } else if (body.change === "remove") {
      if (!existing || existing.status === "REMOVED") throw new ApiError("This student is not on the trip.", 404);
      if (existing.status !== "EXPECTED" && existing.status !== "ABSENT") throw new ApiError("A student who has boarded cannot be removed; record their handover or resolve an exception.", 409);
      await tx.tripPassenger.update({ where: { id: existing.id }, data: { status: "REMOVED", note: reason } });
    } else throw new ApiError("Choose to add or remove a student.", 400);
    await tx.tripEvent.create({ data: { schoolId: user.schoolId, tripId: trip.id, studentId, kind: body.change === "add" ? "AMENDED_ADD" : "AMENDED_REMOVE", occurredAt: new Date(), actorId: user.userId, detail: { reason, late } } });
    await tx.transportTrip.update({ where: { id: trip.id }, data: { version: { increment: 1 } } });
    return { id: trip.id, overflow, ownerId: user.userId, campusId: trip.campusId };
  });
}

// ─── Crew events ─────────────────────────────────────────────────────────

class Repeated { constructor(public result: Record<string, unknown>) {} }
const occurred = (v: unknown, trip: { serviceDate: string }) => {
  const at = v ? new Date(String(v)) : new Date();
  if (Number.isNaN(at.getTime())) throw new ApiError("The event time is not valid.", 400);
  if (at.getTime() > Date.now() + 5 * 60_000) throw new ApiError("The event time cannot be in the future.", 400);
  if (at.getTime() < new Date(`${trip.serviceDate}T00:00:00Z`).getTime() - 86_400_000) throw new ApiError("The event time is before the trip's day.", 400);
  return at;
};

/** Runs one observed event: authorises, de-duplicates by the device's event id, then records it. */
async function crewEvent(user: AuthUser, body: Record<string, unknown>, kind: string, work: (tx: TxClient, trip: Prisma.TransportTripGetPayload<object>, at: Date, lead: boolean) => Promise<{ studentId?: string | null; detail?: Record<string, unknown>; result?: Record<string, unknown> }>) {
  assertStaffRole(user);
  const clientEventId = text(body.clientEventId, 80) || null;
  try {
    return await schoolAiTransaction(user, async tx => {
      const { trip, lead } = await tripFor(user, tx, String(body.tripId ?? ""));
      if (clientEventId && await tx.tripEvent.findFirst({ where: { tripId: trip.id, clientEventId }, select: { id: true } })) throw new Repeated({ repeated: true });
      if (!OPEN.includes(trip.status)) throw new ApiError("This trip is closed.", 409);
      const at = occurred(body.occurredAt, trip);
      const { studentId = null, detail = {}, result = {} } = await work(tx, trip, at, lead);
      await tx.tripEvent.create({ data: { schoolId: user.schoolId, tripId: trip.id, studentId, kind, occurredAt: at, actorId: user.userId, clientEventId, detail: detail as Prisma.InputJsonValue } });
      return { tripId: trip.id, campusId: trip.campusId, coordinatorId: trip.coordinatorId, repeated: false, ...result };
    });
  } catch (error) {
    if (error instanceof Repeated) return { ...error.result, repeated: true, tripId: String(body.tripId ?? ""), campusId: "", coordinatorId: "" };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && String(error.meta?.target ?? "").includes("client_event_id")) return { repeated: true, tripId: String(body.tripId ?? ""), campusId: "", coordinatorId: "" };
    throw error;
  }
}

async function passenger(tx: TxClient, tripId: string, studentId: string) {
  const p = await tx.tripPassenger.findFirst({ where: { tripId, studentId } });
  if (!p || p.status === "REMOVED" || p.status === "TRANSFERRED") throw new ApiError("This student is not on this trip's manifest. Report an unlisted passenger instead.", 409);
  return p;
}

export async function depart(user: AuthUser, body: Record<string, unknown>) {
  return crewEvent(user, body, "DEPARTED", async (tx, trip, at) => {
    if (trip.status === "DEPARTED") throw new Repeated({ repeated: true });
    await tx.transportTrip.update({ where: { id: trip.id }, data: { status: "DEPARTED", departedAt: at, version: { increment: 1 } } });
    return {};
  });
}

export class DoubleBoarding extends ApiError {
  constructor(public studentId: string, public otherTripId: string, public otherLabel: string) { super(`This student is already recorded on board ${otherLabel}. The coordinator has been asked to resolve it before boarding here.`, 409); }
}

export async function board(user: AuthUser, body: Record<string, unknown>) {
  const studentId = String(body.studentId ?? "");
  try {
    return await crewEvent(user, body, "BOARDED", async (tx, trip, at) => {
      const p = await passenger(tx, trip.id, studentId);
      if (p.status === "BOARDED") throw new Repeated({ repeated: true, status: "BOARDED" });
      if (p.status === "HANDED_OVER") throw new ApiError("This student was already handed over on this trip.", 409);
      const other = await tx.tripPassenger.findFirst({ where: { studentId, status: "BOARDED", tripId: { not: trip.id } }, include: { trip: { select: { id: true, label: true } } } });
      if (other) throw new DoubleBoarding(studentId, other.trip.id, other.trip.label);
      await tx.tripPassenger.update({ where: { id: p.id }, data: { status: "BOARDED", boardedAt: at, boardedById: user.userId } });
      return { studentId, result: { status: "BOARDED" } };
    });
  } catch (error) {
    // The partial unique index catches a race the read above could miss.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && String(error.meta?.target ?? "").includes("student_id")) {
      const other = await prisma.tripPassenger.findFirst({ where: { studentId, status: "BOARDED" }, include: { trip: { select: { id: true, label: true } } } });
      throw new DoubleBoarding(studentId, other?.trip.id ?? "", other?.trip.label ?? "another trip");
    }
    throw error;
  }
}

/** Opens the double-boarding exception (outside the refused transaction) for the trip's coordinator. */
export async function recordDoubleBoarding(user: AuthUser, tripId: string, e: DoubleBoarding) {
  const trip = await prisma.transportTrip.findFirst({ where: { id: tripId, schoolId: user.schoolId }, select: { id: true, coordinatorId: true, campusId: true } });
  if (!trip) return null;
  const open = await prisma.tripException.findFirst({ where: { tripId: trip.id, studentId: e.studentId, kind: "DOUBLE_BOARDING", status: "OPEN" } });
  if (open) return null;
  const row = await prisma.tripException.create({ data: { schoolId: user.schoolId, tripId: trip.id, studentId: e.studentId, kind: "DOUBLE_BOARDING", note: `Already on board ${e.otherLabel}.`, ownerId: trip.coordinatorId, createdById: user.userId } });
  return { id: row.id, ownerId: trip.coordinatorId, campusId: trip.campusId };
}

export async function markAbsent(user: AuthUser, body: Record<string, unknown>) {
  const studentId = String(body.studentId ?? "");
  const reason = required(body.reason, 200, "Say why the student did not travel.");
  return crewEvent(user, body, "ABSENT", async (tx, trip) => {
    const p = await passenger(tx, trip.id, studentId);
    if (p.status === "ABSENT") throw new Repeated({ repeated: true });
    if (p.status !== "EXPECTED") throw new ApiError("Only a student who has not boarded can be marked as not travelling.", 409);
    await tx.tripPassenger.update({ where: { id: p.id }, data: { status: "ABSENT", note: reason } });
    return { studentId, detail: { reason } };
  });
}

export async function stopArrived(user: AuthUser, body: Record<string, unknown>) {
  const stop = required(body.stop, 120, "Name the stop.");
  return crewEvent(user, body, "STOP_ARRIVED", async () => ({ detail: { stop } }));
}

/** Handover to a named recipient. Unverified or missing recipients are exceptions, not handovers. */
export async function handover(user: AuthUser, body: Record<string, unknown>) {
  const studentId = String(body.studentId ?? "");
  const receiverType = String(body.receiverType ?? "");
  if (!["STAFF", "GUARDIAN", "AUTHORIZED_ADULT"].includes(receiverType)) throw new ApiError("Choose who received the student.", 400);
  return crewEvent(user, body, "HANDED_OVER", async (tx, trip, at) => {
    const p = await passenger(tx, trip.id, studentId);
    if (p.status === "HANDED_OVER") throw new Repeated({ repeated: true, status: "HANDED_OVER" });
    if (p.status !== "BOARDED") throw new ApiError("Record boarding before the handover.", 409);
    let receiverName = "", receiverUserId: string | null = null;
    if (receiverType === "STAFF") {
      const staff = await tx.user.findFirst({ where: { id: String(body.receiverUserId ?? ""), schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] } }, select: { id: true, fullName: true } });
      if (!staff) throw new ApiError("Choose the staff member who received the student.", 400);
      receiverName = staff.fullName; receiverUserId = staff.id;
    } else {
      if (body.identityChecked !== true) throw new ApiError("Confirm you checked the recipient's identity. If you cannot, report a missing recipient instead.", 400);
      if (receiverType === "GUARDIAN") {
        const g = await tx.guardianRelationship.findFirst({ where: { ...guardianRelationshipAuthorityWhere(String(body.receiverUserId ?? ""), new Date(), user.schoolId), studentId }, select: { fullName: true, guardianUserId: true } });
        if (!g) throw new ApiError("Choose a current guardian of this student.", 400);
        receiverName = g.fullName; receiverUserId = g.guardianUserId;
      } else receiverName = required(body.receiverName, 120, "Name the adult who received the student.");
    }
    await tx.tripPassenger.update({ where: { id: p.id }, data: { status: "HANDED_OVER", handedOverAt: at, handedOverById: user.userId, receiverType, receiverName, receiverUserId } });
    return { studentId, detail: { receiverType, receiverName } };
  });
}

/** Guardians the attendant may hand to: names only, for this rider. */
export async function receivers(user: AuthUser, tripId: string, studentId: string) {
  const { trip } = await tripFor(user, prisma, tripId);
  await passenger(prisma as unknown as TxClient, trip.id, studentId);
  const guardians = await prisma.guardianRelationship.findMany({ where: { ...guardianRelationshipAuthorityWhere(null, new Date(), user.schoolId), studentId }, select: { guardianUserId: true, fullName: true, relationship: true } });
  const staff = await prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] }, OR: [{ campusId: trip.campusId }, { campusId: null }] }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 200 });
  return { guardians: guardians.filter(g => g.guardianUserId).map(g => ({ id: g.guardianUserId!, name: g.fullName, relationship: g.relationship })), staff: staff.map(s => ({ id: s.id, name: s.fullName })) };
}

/** Unlisted passenger, missing child or missing recipient: always an owned, visible exception. */
export async function reportException(user: AuthUser, body: Record<string, unknown>) {
  const kind = String(body.kind ?? "");
  if (!["UNLISTED_PASSENGER", "MISSING_CHILD", "MISSING_RECIPIENT"].includes(kind)) throw new ApiError("Choose what happened.", 400);
  const note = required(body.note, 500, "Describe what happened.");
  let exceptionId = "";
  const r = await crewEvent(user, body, "EXCEPTION", async (tx, trip) => {
    const studentId = kind === "UNLISTED_PASSENGER" ? null : (await passenger(tx, trip.id, String(body.studentId ?? ""))).studentId;
    if (kind === "MISSING_RECIPIENT") {
      const p = await passenger(tx, trip.id, studentId!);
      if (p.status !== "BOARDED") throw new ApiError("Only a student still on board can be waiting for a recipient.", 409);
    }
    exceptionId = (await tx.tripException.create({ data: { schoolId: user.schoolId, tripId: trip.id, studentId, kind, note, ownerId: trip.coordinatorId, createdById: user.userId } })).id;
    return { studentId, detail: { kind, exceptionId } };
  });
  return { ...r, exceptionId };
}

/** The attendant's signed check that nobody is left on the vehicle. */
export async function vehicleCheck(user: AuthUser, body: Record<string, unknown>) {
  if (body.empty !== true) throw new ApiError("Walk the vehicle and confirm it is empty.", 400);
  const signature = required(body.signature, 120, "Sign with your full name.");
  return crewEvent(user, body, "VEHICLE_CHECK", async (tx, trip, at) => {
    if (signature.toLowerCase() !== (await tx.user.findFirstOrThrow({ where: { id: user.userId }, select: { fullName: true } })).fullName.toLowerCase()) throw new ApiError("Sign with your full name as it appears on your account.", 400);
    const onBoard = await tx.tripPassenger.count({ where: { tripId: trip.id, status: "BOARDED" } });
    if (onBoard) throw new ApiError(`${onBoard} student(s) are still recorded on board. Record their handover or report an exception first.`, 409);
    await tx.transportTrip.update({ where: { id: trip.id }, data: { vehicleCheckAt: at, vehicleCheckById: user.userId, vehicleCheckSignature: signature, version: { increment: 1 } } });
    return { detail: { signature } };
  });
}

/** Normal close only when everyone is reconciled, no exception is open and the vehicle check is signed. */
export async function closeTrip(user: AuthUser, body: Record<string, unknown>) {
  assertStaffRole(user);
  return schoolAiTransaction(user, async tx => {
    const { trip } = await tripFor(user, tx, String(body.tripId ?? ""));
    if (trip.status === "CLOSED" || trip.status === "CLOSED_EMERGENCY") return { id: trip.id, repeated: true, status: trip.status };
    const passengers = await tx.tripPassenger.findMany({ where: { tripId: trip.id }, select: { status: true } });
    const c = counts(passengers), open = await tx.tripException.count({ where: { tripId: trip.id, status: "OPEN" } });
    if (c.unresolved || open || !trip.vehicleCheckAt) throw new ApiError(c.unresolved ? `${c.unresolved} student(s) still need a handover or an absence before closing.` : open ? `${open} exception(s) are still open.` : "Record the empty-vehicle check before closing.", 409);
    const done = await tx.transportTrip.updateMany({ where: { id: trip.id, status: { in: OPEN } }, data: { status: "CLOSED", closedAt: new Date(), closedById: user.userId, version: { increment: 1 } } });
    if (!done.count) return { id: trip.id, repeated: true, status: "CLOSED" };
    await tx.tripEvent.create({ data: { schoolId: user.schoolId, tripId: trip.id, kind: "CLOSED", occurredAt: new Date(), actorId: user.userId, detail: c } });
    return { id: trip.id, repeated: false, status: "CLOSED", counts: c };
  });
}

/** Coordinator emergency closure: a recorded reason, and an owned exception for every unresolved rider. */
export async function emergencyClose(user: AuthUser, body: Record<string, unknown>) {
  const reason = required(body.reason, 500, "Record the escalation and why the trip is being closed now.");
  return schoolAiTransaction(user, async tx => {
    const { trip } = await tripFor(user, tx, String(body.tripId ?? ""), "coordinator");
    if (!OPEN.includes(trip.status)) return { id: trip.id, repeated: true, created: 0, campusId: trip.campusId };
    const unresolved = await tx.tripPassenger.findMany({ where: { tripId: trip.id, status: { in: UNRESOLVED } }, select: { studentId: true, studentName: true, status: true } });
    for (const p of unresolved) await tx.tripException.create({ data: { schoolId: user.schoolId, tripId: trip.id, studentId: p.studentId, kind: p.status === "BOARDED" ? "MISSING_RECIPIENT" : "MISSING_CHILD", note: `Unresolved at emergency closure (${p.status === "BOARDED" ? "on board, no handover" : "not boarded, no absence"}).`, ownerId: user.userId, createdById: user.userId } });
    await tx.transportTrip.update({ where: { id: trip.id }, data: { status: "CLOSED_EMERGENCY", closedAt: new Date(), closedById: user.userId, emergencyReason: reason, version: { increment: 1 } } });
    await tx.tripEvent.create({ data: { schoolId: user.schoolId, tripId: trip.id, kind: "CLOSED_EMERGENCY", occurredAt: new Date(), actorId: user.userId, detail: { reason, unresolved: unresolved.length } } });
    return { id: trip.id, repeated: false, created: unresolved.length, campusId: trip.campusId };
  });
}

/** Coordinator resolves an exception, optionally settling the rider it concerns. */
export async function resolveException(user: AuthUser, body: Record<string, unknown>) {
  const resolution = required(body.resolution, 500, "Record how this was resolved.");
  return schoolAiTransaction(user, async tx => {
    const ex = await tx.tripException.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
    if (!ex) throw new ApiError("Exception not found", 404);
    const { trip } = await tripFor(user, tx, ex.tripId, "coordinator");
    const outcome = String(body.outcome ?? "");
    if (outcome && ex.studentId) {
      if (outcome === "RELEASE_OTHER_TRIP" && ex.kind === "DOUBLE_BOARDING") {
        // The child is confirmed here, not on the other vehicle: settle the other trip's record.
        const other = await tx.tripPassenger.findFirst({ where: { studentId: ex.studentId, status: "BOARDED", tripId: { not: trip.id } } });
        if (other) {
          await tx.tripPassenger.update({ where: { id: other.id }, data: { status: "TRANSFERRED", note: resolution } });
          await tx.tripEvent.create({ data: { schoolId: user.schoolId, tripId: other.tripId, studentId: ex.studentId, kind: "TRANSFERRED", occurredAt: new Date(), actorId: user.userId, detail: { toTripId: trip.id, resolution } } });
        }
      } else if (outcome === "ABSENT" || outcome === "HANDED_OVER_CONFIRMED") {
        const p = await tx.tripPassenger.findFirst({ where: { tripId: trip.id, studentId: ex.studentId } });
        if (!p) throw new ApiError("This student is not on the trip.", 404);
        if (outcome === "ABSENT") {
          if (p.status !== "EXPECTED") throw new ApiError("Only a student who has not boarded can be settled as not travelling.", 409);
          await tx.tripPassenger.update({ where: { id: p.id }, data: { status: "ABSENT", note: resolution } });
        } else {
          if (p.status !== "BOARDED") throw new ApiError("Only a student still on board can be settled with a confirmed handover.", 409);
          const receiverName = required(body.receiverName, 120, "Name who received the student.");
          await tx.tripPassenger.update({ where: { id: p.id }, data: { status: "HANDED_OVER", handedOverAt: new Date(), handedOverById: user.userId, receiverType: "AUTHORIZED_ADULT", receiverName, note: resolution } });
        }
        await tx.tripEvent.create({ data: { schoolId: user.schoolId, tripId: trip.id, studentId: ex.studentId, kind: outcome === "ABSENT" ? "ABSENT" : "HANDED_OVER", occurredAt: new Date(), actorId: user.userId, detail: { resolution, byCoordinator: true } } });
      } else throw new ApiError("Choose a valid outcome.", 400);
    }
    const done = await tx.tripException.updateMany({ where: { id: ex.id, status: "OPEN" }, data: { status: "RESOLVED", resolution, resolvedById: user.userId, resolvedAt: new Date() } });
    if (!done.count) throw new ApiError("This exception was already resolved.", 409);
    await tx.tripEvent.create({ data: { schoolId: user.schoolId, tripId: trip.id, studentId: ex.studentId, kind: "EXCEPTION_RESOLVED", occurredAt: new Date(), actorId: user.userId, detail: { exceptionId: ex.id, kind: ex.kind, resolution } } });
    return { id: ex.id };
  });
}

export async function assignExceptionOwner(user: AuthUser, body: Record<string, unknown>) {
  const ex = await prisma.tripException.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId, status: "OPEN" } });
  if (!ex) throw new ApiError("Exception not found", 404);
  const { trip } = await tripFor(user, prisma, ex.tripId, "coordinator");
  const owner = await prisma.user.findFirst({ where: { id: String(body.ownerId ?? ""), schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] }, OR: [{ campusId: trip.campusId }, { campusId: null }] }, select: { id: true } });
  if (!owner) throw new ApiError("Choose an active staff member at this campus.", 400);
  await prisma.tripException.update({ where: { id: ex.id }, data: { ownerId: owner.id } });
  return { id: ex.id, ownerId: owner.id, campusId: trip.campusId };
}

export async function coordinatorStaff(user: AuthUser) {
  coordinator(user);
  return prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] }, ...(user.role === "SUPER_ADMIN" ? {} : { OR: [{ campusId: user.campusId ?? "" }, { campusId: null }] }) }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" }, take: 300 });
}

// ─── Families ────────────────────────────────────────────────────────────

/** A guardian with attendance access sees only their child's current journey status — no crew contact. */
export async function familyJourneys(user: AuthUser, studentId: string) {
  if (user.role !== "PARENT") throw new ApiError("Only a guardian can view a child's journey.", 403);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId }, select: { id: true, campusId: true } });
  if (!student || !(await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "attendance" }))) throw new ApiError("Student not found", 404);
  const date = await today(user.schoolId, student.campusId);
  const rows = await prisma.tripPassenger.findMany({ where: { schoolId: user.schoolId, studentId, status: { in: ACTIVE_ON_TRIP }, trip: { serviceDate: date } }, include: { trip: { select: { label: true, direction: true, vehicleNumber: true, status: true } } }, orderBy: { trip: { direction: "asc" } } });
  return { serviceDate: date, journeys: rows.map(r => ({ id: r.id, label: r.trip.label, direction: r.trip.direction, vehicleNumber: r.trip.vehicleNumber, stop: r.stopName, status: r.status, boardedAt: r.boardedAt, handedOverAt: r.handedOverAt, receiverType: r.receiverType })) };
}
