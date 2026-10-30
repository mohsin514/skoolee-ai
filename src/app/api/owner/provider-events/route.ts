import { z } from "zod";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { runUnscoped } from "@/lib/db/tenant-context";
import { listProviderEventsForReview, resolveProviderEvent } from "@/lib/billing/provider-events";
import { readJsonBody } from "@/lib/api/validate";

export const dynamic = "force-dynamic";

// SKO-373: platform operator queue for verified provider events that failed or
// could not be applied safely. Resolving records a note; it never applies the event.
export async function GET() {
  try {
    await requirePlatformOwner();
    return Response.json({ events: await runUnscoped("owner provider-event review: cross-tenant receipts", () => listProviderEventsForReview()) });
  } catch (error) {
    return errorResponse(error, "[owner/provider-events] GET failed");
  }
}

const Resolve = z.object({ eventId: z.string().min(1).max(300), note: z.string().trim().min(8).max(2000) });

export async function POST(request: Request) {
  try {
    const reviewer = await requirePlatformOwner();
    const parsed = Resolve.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new ApiError("Explain how this event was handled", 400);
    const result = await runUnscoped("owner provider-event review: resolve receipt", () => resolveProviderEvent(parsed.data.eventId, reviewer.userId, parsed.data.note))
      .catch((error: Error & { status?: number }) => { throw error.status ? new ApiError(error.message, error.status) : error; });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "[owner/provider-events] POST failed");
  }
}
