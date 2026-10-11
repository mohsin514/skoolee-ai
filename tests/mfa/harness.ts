/**
 * Drives the real MFA route handlers against the in-memory Prisma fake.
 *
 * Callers must set `process.env.AUTH_SECRET` and `globalThis.prisma` BEFORE
 * calling `loadMfa()`, because both are read when the route modules load.
 */
import type { User } from "@prisma/client";
import type { FakePrisma } from "./fake-prisma";

export const ORIGIN = "http://localhost";
export const SCHOOL = { id: "school-1", name: "Test School", slug: "test-school", status: "ACTIVE" };

export interface CallResult {
  status: number;
  json: Record<string, unknown>;
  setCookies: string[];
}

export async function loadMfa() {
  const route = await import("@/app/api/auth/mfa/route");
  const ticket = await import("@/lib/auth/mfa-ticket");
  const crypto = await import("@/lib/auth/mfa-crypto");
  const { NextRequest } = await import("next/server");

  async function call(method: "GET" | "POST", cookie: string, body?: unknown): Promise<CallResult> {
    const req = new NextRequest(`${ORIGIN}/api/auth/mfa`, {
      method,
      headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = method === "GET" ? await route.GET(req) : await route.POST(req);
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { status: res.status, json, setCookies: res.headers.getSetCookie() };
  }

  /** A fresh password-authenticated sign-in: mints the MFA ticket cookie for the user as stored now. */
  async function signIn(fake: FakePrisma, userId: string) {
    const user = fake.state.users.find(row => row.id === userId);
    if (!user) throw new Error(`no user ${userId}`);
    const res = await ticket.startMfa(user as unknown as User, 7);
    const value = res.cookies.get(ticket.MFA_COOKIE)?.value;
    if (!value) throw new Error("startMfa did not set the ticket cookie");
    return `${ticket.MFA_COOKIE}=${value}`;
  }

  return { route, ticket, crypto, call, signIn };
}

export function newUser(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, schoolId: SCHOOL.id, campusId: null, email: `${id}@example.test`, fullName: `User ${id}`, role: "ADMIN",
    isActive: true, isInstitutionOwner: true, onboardingComplete: true, mustChangePassword: false, password: null,
    accessVersion: 0, mfaEnabled: false, mfaSecret: null, mfaLastStep: -1, recoveryCodeHashes: [] as string[],
    mfaPendingSecret: null, mfaPendingTicket: null, mfaPendingExpiresAt: null, mfaPendingVerified: false,
    mfaEnrolledAt: null,
    lastLogin: null,
    ...overrides,
  };
}

export const stepAt = (ms: number) => Math.floor(ms / 30_000);
