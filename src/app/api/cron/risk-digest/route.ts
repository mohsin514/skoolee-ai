import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateAIDraft, ensureAICreditsAvailable, consumeAICreditAndLog } from "@/lib/ai/openai";
import { AI_PROMPT_VERSION } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const schools = await prisma.school.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, plan: true },
    });

    const results = [];

    for (const school of schools) {
      try {
        await ensureAICreditsAvailable(school.id, 1);
      } catch {
        results.push({ schoolId: school.id, skipped: "no AI credits" });
        continue;
      }

      const campuses = await prisma.campus.findMany({
        where: { schoolId: school.id },
        select: { id: true, name: true },
      });

      for (const campus of campuses) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [lowPerformers, lowAttendance, overdueStudents] = await Promise.all([
          prisma.reportCard.findMany({
            where: {
              campusId: campus.id,
              percentage: { lt: 50 },
              generatedAt: { gte: thirtyDaysAgo },
            },
            include: {
              student: { select: { id: true, fullName: true, rollNo: true, classId: true } },
              exam: { select: { title: true } },
            },
            orderBy: { percentage: "asc" },
            take: 20,
          }),

          prisma.$queryRaw<{ student_id: string; full_name: string; roll_no: string; rate: number }[]>`
            SELECT s.id as student_id, s.full_name, s.roll_no,
              ROUND(
                COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END)::numeric /
                NULLIF(COUNT(*)::numeric, 0) * 100
              ) as rate
            FROM students s
            JOIN attendance a ON a.student_id = s.id
            WHERE s.campus_id = ${campus.id}
              AND a.date >= ${thirtyDaysAgo}
            GROUP BY s.id, s.full_name, s.roll_no
            HAVING ROUND(
              COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END)::numeric /
              NULLIF(COUNT(*)::numeric, 0) * 100
            ) < 75
            ORDER BY rate ASC
            LIMIT 15
          `,

          prisma.invoice.findMany({
            where: {
              campusId: campus.id,
              status: { in: ["PENDING", "OVERDUE"] },
              balanceDue: { gt: 0 },
              dueDate: { lt: new Date() },
            },
            include: {
              student: { select: { id: true, fullName: true } },
            },
            take: 10,
          }),
        ]);

        if (lowPerformers.length === 0 && lowAttendance.length === 0 && overdueStudents.length === 0) {
          results.push({ campusId: campus.id, campusName: campus.name, skipped: "no at-risk students" });
          continue;
        }

        const context = [
          `Campus: ${campus.name}`,
          "",
          lowPerformers.length > 0
            ? `Students with below-50% scores (last 30 days):\n${lowPerformers
                .map((r) => `- ${r.student.fullName} (${r.student.rollNo}): ${r.percentage}% in ${r.exam.title}`)
                .join("\n")}`
            : "",
          lowAttendance.length > 0
            ? `Students with below-75% attendance (last 30 days):\n${lowAttendance
                .map((a) => `- ${a.full_name} (${a.roll_no}): ${a.rate}% attendance`)
                .join("\n")}`
            : "",
          overdueStudents.length > 0
            ? `Students with overdue fees:\n${overdueStudents
                .map((inv) => `- ${inv.student.fullName}: Rs ${(inv.balanceDue / 100).toLocaleString()} overdue`)
                .join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        const result = await generateAIDraft({
          system:
            "You are SkooleeAI, a school management assistant generating a weekly risk digest. " +
            "Summarize the at-risk students for this campus in a clear, actionable format. " +
            "Group findings by category (academic, attendance, financial). " +
            "For each category, list top 5 students needing immediate attention with specific recommendations. " +
            "End with 2-3 overall action items for the campus leadership. " +
            "Be concise and professional. Use bullet points.",
          prompt: context,
          temperature: 0.3,
          maxTokens: 600,
        });

        const { usageLog, extra: insight } = await consumeAICreditAndLog(
          {
            schoolId: school.id,
            campusId: campus.id,
            userId: "SYSTEM_CRON",
            feature: "weekly_risk_digest",
            action: "generate",
            model: result.model,
            tokensUsed: result.tokensUsed,
            promptVersion: AI_PROMPT_VERSION,
            credits: 1,
          },
          async (tx) => {
            return tx.aIInsight.create({
              data: {
                schoolId: school.id,
                campusId: campus.id,
                userId: "SYSTEM_CRON",
                role: "SYSTEM",
                feature: "weekly_risk_digest",
                action: "generate",
                title: `Weekly Risk Digest - ${campus.name}`,
                summary: result.text,
                promptVersion: AI_PROMPT_VERSION,
                model: result.model,
                tokensUsed: result.tokensUsed,
              },
            });
          }
        );

        results.push({
          campusId: campus.id,
          campusName: campus.name,
          insightId: insight?.id,
          usageLogId: usageLog.id,
          atRisk: lowPerformers.length + lowAttendance.length,
        });
      }
    }

    return Response.json({ success: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Risk digest failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
