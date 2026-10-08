import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";

/** Legacy direct-write entry point is closed so uploads cannot bypass staging. */
export async function POST(_request: NextRequest) {
  try {
    await requireAuthUser();
    throw new ApiError("Use the staged import preview before committing a bank statement", 410);
  } catch (error) {
    return errorResponse(error, "[fees/bank-import] POST failed");
  }
}
