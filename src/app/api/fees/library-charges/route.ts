import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { handedLibraryCharges } from "@/lib/library/desk";

// SKAI-1665: library charges the lending desk handed to the fees office, for the campus finance desk.
export async function GET() {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await handedLibraryCharges(user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[fees/library-charges] GET failed"); }
}
