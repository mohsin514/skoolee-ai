import type { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { manageMutation, manageStatus } from "@/lib/auth/mfa-manage-http";

// ─────────────────────────────────────────────────────────────────
// GET  /api/account/mfa — two-factor status for Settings → Security
// POST /api/account/mfa — begin | confirm | cancel | regenerate | disable
//
// Deliberately outside the public /api/auth/mfa prefix, so the proxy requires
// a session and applies its mustChangePassword gate. The authoritative check
// is still requireAuthUser() here (design §B.2.6). Every response is no-store.
// ─────────────────────────────────────────────────────────────────
const deps = { requireUser: () => requireAuthUser() };

export async function GET(req: NextRequest) {
  return manageStatus(req, deps);
}

export async function POST(req: NextRequest) {
  return manageMutation(req, deps);
}
