/**
 * Boundary schemas for routes that still do their own field handling.
 *
 * Many write routes read `await req.json()` and then coerce each field by hand
 * (`String(body.name).trim()`, `Number(body.amount)`). Replacing all of that
 * with full schemas at once would change what they accept, so these schemas
 * only enforce the shape the handler already assumes: a JSON object, plus the
 * identifier it looks up. Unknown keys pass through untouched, and the field
 * coercion stays in the handler.
 *
 * Run through `parseBody`, this turns a malformed body, an array, `null`, or a
 * missing id into a 400 with a field map instead of a 500 or a Prisma error.
 */

import { z } from "zod";

/** A non-empty identifier, labelled for the field map. */
export const routeId = (field = "id") =>
  z.string({ error: `${field} required` }).trim().min(1, `${field} required`);

/** Any JSON object; the handler reads the fields it needs. */
export const jsonObjectBody = z.record(z.string(), z.any());

/** A JSON object that must carry the record id the handler updates. */
export const idBody = z.object({ id: routeId() }).catchall(z.any());

/** A JSON object that must carry the named id field (`studentId`, `invoiceId`…). */
export function requiredIdBody<K extends string>(field: K) {
  return z.object({ [field]: routeId(field) } as Record<K, ReturnType<typeof routeId>>).catchall(z.any());
}
