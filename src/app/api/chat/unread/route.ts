import { errorResponse } from "@/lib/api/scope";
import { requireChatUser, totalUnread } from "@/lib/chat/service";
import { canCreateGroup, canManageChatSettings } from "@/lib/chat/policy";
import { roleLabel } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The badge count, and who the viewer is.
 *
 * Identity rides along because the chat UI is mounted inside client-side role
 * shells that have no session of their own: it needs the caller's own id to
 * tell their messages from everyone else's, and their capabilities to decide
 * which controls to render. Sending it here avoids a second round trip on
 * every dashboard load.
 */
export async function GET() {
  try {
    const user = await requireChatUser();

    return Response.json({
      success: true,
      unreadCount: await totalUnread(user),
      viewer: {
        id: user.userId,
        fullName: user.fullName ?? "",
        role: user.role,
        roleLabel: roleLabel(user.role),
        canCreateGroup: canCreateGroup(user.role),
        canManageSettings: canManageChatSettings(user.role),
      },
    });
  } catch (error) {
    return errorResponse(error, "[chat] unread failed");
  }
}
