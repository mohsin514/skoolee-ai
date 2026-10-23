import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { requireChatUser } from "@/lib/chat/service";
import { canManageChatSettings, getChatSettings } from "@/lib/chat/policy";
import { assertChatSettingsManager, updateChatSettings } from "@/lib/chat/settings-command";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readable by anyone signed in — the client uses it to explain why a person
 *  is not in their directory. Only the flags, never anything identifying. */
export async function GET() {
  try {
    const user = await requireChatUser();
    const settings = await getChatSettings(user.schoolId);
    return Response.json({
      success: true,
      settings,
      canManage: canManageChatSettings(user),
    });
  } catch (error) {
    return errorResponse(error, "[chat] get settings failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireChatUser();
    assertChatSettingsManager(user);
    const saved = await updateChatSettings(user, await req.json());

    return Response.json({ success: true, settings: saved });
  } catch (error) {
    return errorResponse(error, "[chat] update settings failed");
  }
}
