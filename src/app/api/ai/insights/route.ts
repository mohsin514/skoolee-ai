import { NextRequest } from "next/server";
import { InvoiceStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, type AuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { aiFeatureRequestSchema } from "@/lib/validators/schemas";
import {
  AI_FEATURE_LABELS,
  type AIFeature,
  buildAIFeaturePrompt,
  canUseAIFeature,
  featureNeedsHumanApproval,
  featuresForRole,
} from "@/lib/ai/prompts";
import {
  AICreditError,
  consumeAICreditAndLog,
  ensureAICreditsAvailable,
  generateAIDraft,
} from "@/lib/ai/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function firstLine(text: string) {
  return (
    text
      .split("\n")
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find(Boolean) || "AI draft"
  ).slice(0, 180);
}

function matchApprovedFaq(
  question: string,
  faqs: Array<{ question: string; answer: string }>
) {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);

  let best: { question: string; answer: string } | null = null;
  let bestScore = 0;

  for (const faq of faqs) {
    const haystack = `${faq.question} ${faq.answer}`.toLowerCase();
    const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      best = faq;
      bestScore = score;
    }
  }

  return bestScore >= Math.min(2, Math.max(words.length, 1)) ? best : null;
}

function errorResponse(error: unknown, fallback = "AI request failed") {
  if (error instanceof AICreditError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const status = (error as Error & { status?: number }).status || 500;
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

function scopedCampusWhere(schoolId: string, campusId: string | null) {
  return campusId
    ? { campusId, campus: { schoolId } }
    : { campus: { schoolId } };
}

async function resolveScopedCampusId(user: AuthUser, requestedCampusId?: string | null) {
  if (user.role !== "SUPER_ADMIN") {
    if (!user.campusId) return null;
    if (requestedCampusId && requestedCampusId !== user.campusId) {
      const error = new Error("Campus is outside your account");
      (error as Error & { status?: number }).status = 403;
      throw error;
    }
    return user.campusId;
  }

  if (!requestedCampusId) return null;

  const campus = await prisma.campus.findFirst({
    where: { id: requestedCampusId, schoolId: user.schoolId },
    select: { id: true },
  });

  if (!campus) {
    const error = new Error("Campus is outside your school");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }

  return campus.id;
}

async function getStudentContext(user: AuthUser, studentId?: string) {
  const account = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { fullName: true },
  });
  const ownershipFilter = {
    OR: [
      { parentUserId: user.userId },
      ...(account?.fullName ? [{ fullName: account.fullName }] : []),
    ],
  };

  const student = await prisma.student.findFirst({
    where: {
      campus: { schoolId: user.schoolId },
      ...(user.campusId ? { campusId: user.campusId } : {}),
      ...(studentId ? { id: studentId } : {}),
      ...ownershipFilter,
    },
    include: {
      class: { select: { name: true, section: true, academicYear: true } },
      marks: {
        include: {
          subject: { select: { name: true, totalMarks: true } },
          exam: { select: { title: true, term: true, academicYear: true } },
        },
        take: 40,
      },
      reportCards: {
        include: { exam: { select: { title: true, term: true, academicYear: true } } },
        orderBy: { generatedAt: "desc" },
        take: 3,
      },
    },
  });

  if (studentId && !student) {
    const error = new Error("Student is outside your account");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }

  return student;
}

function approvedFaqsFromTemplates(templates: Array<{ content: unknown; userPrompt: string }>) {
  const faqs: Array<{ question: string; answer: string }> = [];

  for (const template of templates) {
    const content = template.content as
      | { faqs?: Array<{ question?: unknown; answer?: unknown }> }
      | Array<{ question?: unknown; answer?: unknown }>
      | null;
    const items = Array.isArray(content) ? content : content?.faqs;

    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item.question === "string" && typeof item.answer === "string") {
          faqs.push({ question: item.question, answer: item.answer });
        }
      }
    } else if (template.userPrompt.trim()) {
      faqs.push({ question: "Approved school FAQ knowledge base", answer: template.userPrompt.trim() });
    }
  }

  return faqs;
}

async function buildContext({
  user,
  campusId,
  data,
}: {
  user: AuthUser;
  campusId: string | null;
  data: ReturnType<typeof aiFeatureRequestSchema.parse>;
}) {
  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { id: true, name: true, plan: true, aiCreditsUsed: true, aiCreditsLimit: true },
  });
  const campus = campusId
    ? await prisma.campus.findFirst({
        where: { id: campusId, schoolId: user.schoolId },
        select: { id: true, name: true, city: true, board: true },
      })
    : null;

  const base = {
    school,
    campus,
    requestedIds: {
      campusId,
      studentId: data.studentId,
      examId: data.examId,
      classId: data.classId,
      subjectId: data.subjectId,
      reportCardId: data.reportCardId,
    },
  };

  if (user.role === "STUDENT" || user.role === "PARENT") {
    const student = await getStudentContext(user, data.studentId);
    const faqTemplates = data.feature === "school_faq"
      ? await prisma.promptTemplate.findMany({
          where: {
            feature: "school_faq",
            isActive: true,
            status: "APPROVED",
            AND: [
              { OR: [{ schoolId: null }, { schoolId: user.schoolId }] },
              ...(student?.campusId ? [{ OR: [{ campusId: null }, { campusId: student.campusId }] }] : []),
            ],
          },
          select: { content: true, userPrompt: true },
          take: 10,
        })
      : [];

    return {
      ...base,
      student,
      approvedFaqs: approvedFaqsFromTemplates(faqTemplates),
      faqPolicy: "Answer only from approvedFaqs. If empty or missing the answer, refuse politely.",
    };
  }

  if (data.feature === "campus_comparison" || data.feature === "weak_campuses") {
    const [campuses, reportStats, invoiceStats] = await Promise.all([
      prisma.campus.findMany({
        where: { schoolId: user.schoolId },
        include: { _count: { select: { students: true, classes: true, users: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.reportCard.groupBy({
        by: ["campusId"],
        where: scopedCampusWhere(user.schoolId, null),
        _avg: { percentage: true },
        _count: { _all: true },
      }),
      prisma.invoice.groupBy({
        by: ["campusId", "status"],
        where: scopedCampusWhere(user.schoolId, null),
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
    ]);
    return { ...base, campuses, reportStats, invoiceStats };
  }

  if (data.feature === "ai_usage_by_campus") {
    const usage = await prisma.aIUsageLog.groupBy({
      by: ["campusId", "feature"],
      where: { schoolId: user.schoolId },
      _sum: { tokensUsed: true },
      _count: { _all: true },
    });
    return { ...base, usage };
  }

  if (data.feature === "fee_recovery_insights") {
    const invoices = await prisma.invoice.findMany({
      where: {
        ...scopedCampusWhere(user.schoolId, campusId),
        status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
      },
      include: {
        student: { select: { fullName: true, rollNo: true, class: { select: { name: true, section: true } } } },
        payments: { select: { amount: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    });
    return { ...base, invoices };
  }

  if (data.feature === "pending_review_queue") {
    const reviewItems = await prisma.aIReviewItem.findMany({
      where: {
        schoolId: user.schoolId,
        ...(campusId ? { campusId } : {}),
        status: "PENDING",
      },
      orderBy: { createdAt: "asc" },
      take: 30,
    });
    return { ...base, reviewItems };
  }

  if (data.feature === "academic_trend_summary") {
    const reportCards = await prisma.reportCard.findMany({
      where: scopedCampusWhere(user.schoolId, campusId),
      include: {
        exam: { select: { title: true, term: true, academicYear: true } },
        student: { select: { class: { select: { name: true, section: true } } } },
      },
      orderBy: { generatedAt: "desc" },
      take: 100,
    });
    return { ...base, reportCards };
  }

  const [marks, reportCards, classes, subjects, reviewItems] = await Promise.all([
    prisma.mark.findMany({
      where: {
        ...scopedCampusWhere(user.schoolId, campusId),
        ...(data.studentId ? { studentId: data.studentId } : {}),
        ...(data.examId ? { examId: data.examId } : {}),
        ...(data.subjectId ? { subjectId: data.subjectId } : {}),
        ...(user.role === "TEACHER" ? { subject: { teacherId: user.userId } } : {}),
      },
      include: {
        student: { select: { fullName: true, rollNo: true, class: { select: { name: true, section: true } } } },
        subject: { select: { name: true, totalMarks: true } },
        exam: { select: { title: true, term: true, academicYear: true } },
      },
      take: 100,
    }),
    prisma.reportCard.findMany({
      where: {
        ...scopedCampusWhere(user.schoolId, campusId),
        ...(data.studentId ? { studentId: data.studentId } : {}),
        ...(data.examId ? { examId: data.examId } : {}),
        ...(data.reportCardId ? { id: data.reportCardId } : {}),
      },
      include: {
        student: { select: { fullName: true, rollNo: true, class: { select: { name: true, section: true } } } },
        exam: { select: { title: true, term: true, academicYear: true } },
      },
      orderBy: { generatedAt: "desc" },
      take: 50,
    }),
    prisma.class.findMany({
      where: scopedCampusWhere(user.schoolId, campusId),
      include: { _count: { select: { students: true, subjects: true } }, classTeacher: { select: { fullName: true } } },
      take: 40,
    }),
    prisma.subject.findMany({
      where: {
        ...scopedCampusWhere(user.schoolId, campusId),
        ...(data.classId ? { classId: data.classId } : {}),
        ...(user.role === "TEACHER" ? { teacherId: user.userId } : {}),
      },
      include: { teacher: { select: { fullName: true } }, class: { select: { name: true, section: true } } },
      take: 50,
    }),
    prisma.aIReviewItem.findMany({
      where: { schoolId: user.schoolId, ...(campusId ? { campusId } : {}), status: "PENDING" },
      take: 15,
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    ...base,
    marks,
    reportCards,
    classes,
    subjects,
    pendingReviewItems: reviewItems,
  };
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;

  try {
    const { searchParams } = new URL(req.url);
    const campusId = await resolveScopedCampusId(user, searchParams.get("campusId"));
    const ownOnly = user.role === "TEACHER" || user.role === "STUDENT" || user.role === "PARENT";
    const where = {
      schoolId: user.schoolId,
      ...(campusId ? { campusId } : {}),
      ...(ownOnly ? { userId: user.userId } : {}),
    };

    const [insights, reviewItems] = await Promise.all([
      prisma.aIInsight.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      user.role === "SUPER_ADMIN" || user.role === "PRINCIPAL" || isCampusAdminRole(user.role)
        ? prisma.aIReviewItem.findMany({
            where: {
              schoolId: user.schoolId,
              ...(campusId ? { campusId } : {}),
              status: "PENDING",
            },
            orderBy: { createdAt: "asc" },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

    return Response.json({
      success: true,
      features: featuresForRole(user.role).map((feature) => ({
        feature,
        label: AI_FEATURE_LABELS[feature],
      })),
      insights,
      reviewItems,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;

  try {
    const body = await req.json();
    const parsed = aiFeatureRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const data = parsed.data;
    const feature = data.feature as AIFeature;

    if (!canUseAIFeature(user.role, feature)) {
      return Response.json({ error: "AI feature is not available for your role" }, { status: 403 });
    }

    const campusId = await resolveScopedCampusId(user, data.campusId);
    const context = await buildContext({ user, campusId, data });

    if (feature === "school_faq") {
      const faqs = ((context as { approvedFaqs?: Array<{ question: string; answer: string }> }).approvedFaqs || []);
      const question = data.question || data.text || "";
      const match = matchApprovedFaq(question, faqs);
      const answer = match?.answer || "I can only answer approved school FAQs, and this school has not approved an answer for that question yet.";
      const saved = await prisma.$transaction(async (tx) => {
        const insight = await tx.aIInsight.create({
          data: {
            schoolId: user.schoolId,
            campusId,
            userId: user.userId,
            role: user.role,
            feature,
            action: feature,
            title: AI_FEATURE_LABELS[feature],
            summary: answer,
            output: jsonValue({ text: answer, matchedQuestion: match?.question || null }),
            promptVersion: "approved-faq-v1",
            model: "approved-faq",
            tokensUsed: 0,
            approvalStatus: "DRAFT",
          },
        });
        await tx.parentConversation.create({
          data: {
            schoolId: user.schoolId,
            campusId,
            userId: user.userId,
            studentId: data.studentId || null,
            question,
            answer,
            status: "DRAFT",
          },
        });
        await tx.aIUsageLog.create({
          data: {
            schoolId: user.schoolId,
            campusId,
            userId: user.userId,
            feature,
            action: feature,
            promptVersion: "approved-faq-v1",
            model: "approved-faq",
            tokensUsed: 0,
            approvalStatus: "DRAFT",
            output: jsonValue({ text: answer }),
            metadata: jsonValue({ question, matchedQuestion: match?.question || null }),
          },
        });
        return insight;
      });

      return Response.json({ success: true, data: { output: answer, insightId: saved.id, tokensUsed: 0, model: "approved-faq" } });
    }

    await ensureAICreditsAvailable(user.schoolId);

    const prompt = buildAIFeaturePrompt({
      role: user.role,
      feature,
      context,
      input: {
        tone: data.tone,
        targetLanguage: data.targetLanguage,
        topic: data.topic,
        text: data.text,
        question: data.question,
        ...(data.input || {}),
      },
    });
    const result = await generateAIDraft({ system: prompt.system, prompt: prompt.user });
    const approvalStatus = featureNeedsHumanApproval(feature) ? "PENDING_REVIEW" : "DRAFT";
    const title = AI_FEATURE_LABELS[feature];
    const summary = firstLine(result.text);

    const saved = await consumeAICreditAndLog(
      {
        schoolId: user.schoolId,
        campusId,
        userId: user.userId,
        feature,
        action: feature,
        promptVersion: result.promptVersion,
        model: result.model,
        tokensUsed: result.tokensUsed,
        approvalStatus,
        output: jsonValue({ text: result.text }),
        metadata: jsonValue({ request: data, title }),
      },
      async (tx) => {
        const insight = await tx.aIInsight.create({
          data: {
            schoolId: user.schoolId,
            campusId,
            userId: user.userId,
            role: user.role,
            feature,
            action: feature,
            title,
            summary,
            output: jsonValue({ text: result.text, context: { campusId, feature } }),
            promptVersion: result.promptVersion,
            model: result.model,
            tokensUsed: result.tokensUsed,
            approvalStatus,
          },
        });

        if (feature === "intervention_suggestions" && campusId) {
          const plan = await tx.interventionPlan.create({
            data: {
              schoolId: user.schoolId,
              campusId,
              studentId: data.studentId || null,
              createdBy: user.userId,
              title,
              summary,
              recommendations: jsonValue({ text: result.text }),
              status: "DRAFT",
            },
          });
          await tx.aIReviewItem.create({
            data: {
              schoolId: user.schoolId,
              campusId,
              userId: user.userId,
              feature,
              relatedType: "INTERVENTION_PLAN",
              relatedId: plan.id,
              title,
              draft: jsonValue({ text: result.text }),
              status: "PENDING",
              promptVersion: result.promptVersion,
              model: result.model,
              tokensUsed: result.tokensUsed,
            },
          });
        }

        if (featureNeedsHumanApproval(feature) && campusId && feature !== "intervention_suggestions") {
          await tx.aIReviewItem.create({
            data: {
              schoolId: user.schoolId,
              campusId,
              userId: user.userId,
              feature,
              relatedType: "AI_INSIGHT",
              relatedId: insight.id,
              title,
              draft: jsonValue({ text: result.text }),
              status: "PENDING",
              promptVersion: result.promptVersion,
              model: result.model,
              tokensUsed: result.tokensUsed,
            },
          });
        }

        return insight;
      }
    );

    return Response.json({
      success: true,
      data: {
        output: result.text,
        insightId: saved.extra?.id,
        approvalStatus,
        tokensUsed: result.tokensUsed,
        model: result.model,
        promptVersion: result.promptVersion,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
