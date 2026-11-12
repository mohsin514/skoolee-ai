import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { privateDownloadResponse } from "@/lib/storage/private-download";
import { discardDropItem, dropItemForCreator } from "@/lib/drop/service";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string; itemId: string }> };

// SKAI-1847: only the session's creator can take (GET) or discard (DELETE) a file the phone sent.
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireAuthUser();
    const { id, itemId } = await params;
    const item = await dropItemForCreator(user, id, itemId);
    return privateDownloadResponse(item.storageKey, item.fileName, { contentType: item.contentType, inlineImage: true });
  } catch (error) { return errorResponse(error, "[drop/items] GET failed"); }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const { id, itemId } = await params;
    await discardDropItem(user, id, itemId);
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[drop/items] DELETE failed"); }
}
