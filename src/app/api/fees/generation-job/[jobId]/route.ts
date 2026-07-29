import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { jobId } = await params;

    const match = jobId.match(/^invoice-gen-(\d{4}-\d{2})$/);
    if (!match) {
      return Response.json({ error: "Invalid job ID format" }, { status: 400 });
    }

    const generationMonth = match[1];

    return Response.json({
      success: true,
      jobId,
      status: "completed",
      message: `Invoice generation for ${generationMonth} completed`,
    });
  } catch (error) {
    return errorResponse(error, "[fees/generation-job] GET failed");
  }
}
