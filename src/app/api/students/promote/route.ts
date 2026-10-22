import { ApiError, canManageCampusOps, errorResponse, requireAuthUser } from "@/lib/api/scope";

// POST /api/students/promote — retired (SKO-404).
//
// One-step promotion let a learner with no results default to a pass and moved
// pupils without an approved plan. Promotion now runs only through the
// versioned, approved year-end plan at /api/academic/rollover, which records
// every learner's outcome, revalidates at execution and reconciles balances.
export async function POST() {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("You don't have permission to promote students", 403);
    throw new ApiError("Promotion now runs through the reviewed year-end plan in Promote Students, where every learner's outcome is approved before anything moves.", 409);
  } catch (error) {
    return errorResponse(error, "[students/promote] POST failed");
  }
}
