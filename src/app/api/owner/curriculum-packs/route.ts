import { errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { platformCatalogue } from "@/lib/school-ai/curriculum-pack-service";

export const dynamic = "force-dynamic";

// SKAI-1008: the platform curriculum catalogue (contract content, unverified items, usage counts). Owner-only.
export async function GET() {
  try {
    await requirePlatformOwner();
    return Response.json({ success: true, data: await platformCatalogue() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "[owner/curriculum-packs] GET failed");
  }
}
