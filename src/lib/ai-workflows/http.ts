import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { sha256 } from "./executor/canonical";
import { z } from "zod";
import { WorkflowError, toWorkflowError } from "./errors";

const PRIVATE = { "Cache-Control": "private, no-store" };

/** Errors leave as a code plus ids/counts; the client renders localised copy (control P11). */
export function workflowErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ code: "INVALID_INPUT", params: { issues: error.issues.length } }, { status: 422, headers: PRIVATE });
  const known = toWorkflowError(error);
  if (known.code === "INTERNAL" && !(error instanceof WorkflowError)) console.warn("[ai-workflows] request failed", { kind: error instanceof Error ? error.name : "Unknown" });
  return Response.json({ code: known.code, params: known.params }, { status: known.status, headers: PRIVATE });
}

export const workflowJson = (body: unknown, init: ResponseInit = {}) => Response.json(body, { ...init, headers: { ...PRIVATE, ...init.headers } });

/** Confirmations are bound to the signed-in session that made them (control P4); only a hash is stored. */
export async function sessionTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? sha256(token) : null;
}
