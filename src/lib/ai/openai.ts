// ===========================================
// SkooleeAI - OpenAI Client & Remark Generation
// ===========================================

import OpenAI from "openai";
import { AIRemarkRequest, AIRemarkResponse } from "@/types";
import { buildRemarkPrompt } from "./prompts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/**
 * Generate AI-powered report card remarks for a student.
 */
export async function generateRemark(
  request: AIRemarkRequest
): Promise<AIRemarkResponse> {
  const prompt = buildRemarkPrompt(request);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an experienced school teacher writing report card remarks. " +
          "Write professional, personalized remarks based on a student's performance. " +
          "Be encouraging yet honest. Address specific strengths and areas for improvement.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  const text = response.choices[0]?.message?.content || "";
  const tokensUsed = response.usage?.total_tokens || 0;

  if (request.language === "both") {
    // Parse the response which contains both languages separated by ---
    const parts = text.split("---").map((s) => s.trim());
    return {
      remarkEn: parts[0] || text,
      remarkUr: parts[1] || "",
      tokensUsed,
    };
  }

  return {
    remarkEn: request.language === "en" ? text : undefined,
    remarkUr: request.language === "ur" ? text : undefined,
    tokensUsed,
  };
}

/**
 * Generate remarks in batch for multiple students.
 */
export async function generateBatchRemarks(
  requests: AIRemarkRequest[]
): Promise<AIRemarkResponse[]> {
  const results: AIRemarkResponse[] = [];
  for (const req of requests) {
    const result = await generateRemark(req);
    results.push(result);
    // Small delay to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return results;
}
