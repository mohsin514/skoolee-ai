import { ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { MAX_AUDIO_BYTES, languageSchema, validateAudio } from "@/lib/school-ai/intake";
import { readBoundedForm, schoolAiError } from "@/lib/school-ai/http";
import { transcribeRecording } from "@/lib/school-ai/providers";
import { consumeAICreditAndLog, ensureAICreditsAvailable } from "@/lib/ai/openai";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    const rate = await authRateLimit(`school-ai:voice:${user.schoolId}:${user.userId}`, { limit: 12, windowMs: 300000 });
    if (!rate.ok) throw new ApiError("Please wait before sending another recording.", 429);
    const form = await readBoundedForm(request, MAX_AUDIO_BYTES + 100000);
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("A recording is required.", 400);
    const language = languageSchema.parse(form.get("language") || "en");
    const bytes = Buffer.from(await file.arrayBuffer());
    let mime: string;
    try { mime = validateAudio(file.type, bytes); } catch (error) { throw new ApiError((error as Error).message, 400); }
    // SKO-460: a resend of the same recording (same client key and size) is not charged twice. The
    // transcript is never stored, so a retry transcribes again; only the charge is de-duplicated.
    const rawKey = form.get("idempotencyKey");
    const idempotencyKey = typeof rawKey === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(rawKey) ? rawKey : null;
    const charged = idempotencyKey ? await prisma.aIUsageLog.findFirst({ where: { schoolId: user.schoolId, userId: user.userId, feature: "SCHOOL_AI_VOICE", AND: [{ metadata: { path: ["idempotencyKey"], equals: idempotencyKey } }, { metadata: { path: ["bytes"], equals: bytes.length } }] }, select: { id: true } }) : null;
    if (!charged) await ensureAICreditsAvailable(user.schoolId);
    const result = await transcribeRecording(bytes, mime, language);
    if (!charged) await consumeAICreditAndLog({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, feature: "SCHOOL_AI_VOICE", action: "TRANSCRIBE", model: result.model, tokensUsed: 0, metadata: { bytes: bytes.length, language, ...(idempotencyKey ? { idempotencyKey } : {}) } });
    // Audio and transcript are deliberately not retained in usage logs. The user reviews text before saving it.
    return Response.json({ text: result.text }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
