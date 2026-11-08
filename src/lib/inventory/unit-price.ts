import { ApiError } from "@/lib/api/scope";

// Unit prices are stored in minor units in a PostgreSQL Int32 column.
const MAX_UNIT_PRICE = 2_147_483_647;

/** A unit price is a whole, non-negative amount in minor units that fits the persisted column. */
export function parseUnitPrice(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_UNIT_PRICE) {
    throw new ApiError("unitPrice must be a non-negative whole amount in minor units within the supported range", 400);
  }
  return value;
}
