// ===========================================
// POST /api/reports/bulk-pdf
// ===========================================
// Accepts { classId, examId }, creates a BullMQ
// job to generate PDFs for all students in the
// class, and returns the jobId.

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getTenantForUser } from "@/lib/db/tenant";
import { pdfQueue } from "@/lib/queue/queues";

const requestSchema = z.object({
  classId: z.string().min(1, "classId is required"),
  examId: z.string().min(1, "examId is required"),
});

export async function POST(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────
    const { userId } = await auth();
    if (!userId) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json(
        { success: false, error: "No tenant found" },
        { status: 403 }
      );
    }

    // ── Validate ────────────────────────────────────────
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { classId, examId } = parsed.data;

    // ── Enqueue bulk PDF job ────────────────────────────
    const job = await pdfQueue.add(
      "bulk-pdf-generation",
      {
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        classId,
        examId,
      },
      {
        jobId: `bulk-pdf-${tenant.id}-${classId}-${examId}-${Date.now()}`,
      }
    );

    return Response.json({
      success: true,
      data: {
        jobId: job.id,
        message:
          "PDF generation has been queued. You will be notified when complete.",
      },
    });
  } catch (error) {
    console.error("[reports/bulk-pdf] Error:", error);
    return Response.json(
      { success: false, error: "Failed to queue PDF generation" },
      { status: 500 }
    );
  }
}
