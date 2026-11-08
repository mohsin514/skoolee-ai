import { NextRequest } from "next/server";
import {
  requireAuthUser,
  assertPermission,
  errorResponse,
} from "@/lib/api/scope";
import { reportRemarkSchema } from "@/lib/validators/schemas";
import { updateReportCardCommand } from "@/lib/reports/edit-remarks-command";
import { readJsonBody } from "@/lib/api/validate";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthUser();
    await assertPermission(user, "reports", "edit");
    const { id } = await params;
    const parsed = reportRemarkSchema.safeParse(await readJsonBody(req));
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    // Assignment, version and approval rules live in the command (shared with AI Workflows).
    const reportCard = await updateReportCardCommand(user, id, parsed.data);
    return Response.json({ success: true, reportCard });
  } catch (error) {
    return errorResponse(error, "Report update failed");
  }
}
