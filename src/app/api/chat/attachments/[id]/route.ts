import { requireAuthUser, errorResponse } from "@/lib/api/scope";
import { downloadChatAttachment } from "@/lib/chat/attachment-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    return await downloadChatAttachment(user, (await context.params).id);
  } catch (error) { return errorResponse(error, "File unavailable"); }
}
