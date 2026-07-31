import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import {
  AICreditError,
  consumeAICreditAndLog,
  ensureAICreditsAvailable,
  generateAIDraft,
} from "@/lib/ai/openai";
import { transliterateToUrdu } from "@/lib/urdu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canTranslate(role: string) {
  return role === "TEACHER" || role === "PRINCIPAL" || role === "SUPER_ADMIN" || isCampusAdminRole(role);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;
  if (!canTranslate(user.role)) {
    return Response.json({ error: "Translation is not available for your role" }, { status: 403 });
  }

  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text.trim() : "";
  } catch {}

  if (text.length < 2) {
    return Response.json({ error: "Text is too short to translate" }, { status: 400 });
  }

  try {
    await ensureAICreditsAvailable(user.schoolId);
    const draft = await generateAIDraft({
      system:
        "You are a professional English-to-Urdu translator for school report card remarks. " +
        "Translate the given remark into natural, fluent, respectful Urdu (اردو). " +
        "Keep the meaning and tone accurate for a student's report card. " +
        "Return ONLY the Urdu translation — no quotes, labels, or explanation.",
      prompt: `Translate the following English report card remark into Urdu:\n${text}`,
      temperature: 0.3,
      maxTokens: 250,
    });

    const translation = draft.text
      .replace(/^["'“”]+/, "")
      .replace(/["'“”]+$/, "")
      .trim();

    if (!translation) {
      return Response.json({ translation: transliterateToUrdu(text) });
    }

    await consumeAICreditAndLog({
      schoolId: user.schoolId,
      campusId: user.campusId || null,
      userId: user.userId,
      feature: "translate_remarks",
      action: "translate",
      promptVersion: draft.promptVersion,
      model: draft.model,
      tokensUsed: draft.tokensUsed,
      approvalStatus: "DRAFT",
      output: jsonValue({ en: text, ur: translation }),
    }).catch(() => {});

    return Response.json({ translation, model: draft.model });
  } catch (error) {
    if (error instanceof AICreditError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ translation: transliterateToUrdu(text) });
  }
}
