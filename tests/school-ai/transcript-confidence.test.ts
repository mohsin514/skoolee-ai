import assert from "node:assert/strict";
import { test } from "node:test";
import { transcriptConfidence } from "../../src/lib/school-ai/voice";

// SKO-460: the review step points at words the transcriber itself was unsure of.
test("whisper segments below the confidence floor are flagged; confident ones are not", () => {
  assert.deepEqual(transcriptConfidence({ segments: [{ text: " Plan Friday", avg_logprob: -0.2, no_speech_prob: 0.01 }, { text: " for Grade 7B ", avg_logprob: -1.4, no_speech_prob: 0.02 }] }), { confidence: "low", uncertain: ["for Grade 7B"] });
  assert.deepEqual(transcriptConfidence({ segments: [{ text: "All clear", avg_logprob: -0.1, no_speech_prob: 0.1 }] }), { confidence: "ok", uncertain: [] });
});
test("token logprobs are joined into words and a word is as unsure as its least likely token", () => {
  const lp = (token: string, p: number) => ({ token, logprob: Math.log(p) });
  const result = transcriptConfidence({ logprobs: [lp("Call", 0.99), lp(" Ay", 0.3), lp("esha", 0.9), lp(" about", 0.95), lp(" 4", 0.4), lp("5.", 0.9), lp(" marks", 0.97)] });
  assert.deepEqual(result, { confidence: "low", uncertain: ["Ayesha", "45"] });
});
test("Urdu and Arabic words are kept, punctuation-only tokens are ignored, and the list is capped", () => {
  const lp = (token: string, p: number) => ({ token, logprob: Math.log(p) });
  assert.deepEqual(transcriptConfidence({ logprobs: [lp("کل", 0.2), lp(" ۔", 0.1), lp(" غداً", 0.3)] }).uncertain, ["کل", "غداً"]);
  assert.equal(transcriptConfidence({ logprobs: Array.from({ length: 20 }, (_, i) => lp(` w${i}`, 0.1)) }).uncertain.length, 8);
});
test("no confidence data is reported as unknown rather than confident", () => {
  assert.deepEqual(transcriptConfidence({}), { confidence: "unknown", uncertain: [] });
});
test("each transcription failure status has its own explanation", async () => {
  const { voiceFailureFor } = await import("../../src/lib/school-ai/voice");
  assert.deepEqual([429, 400, 413, 422, 402, 503, 500].map(voiceFailureFor), ["voiceRateLimited", "voiceUnsupported", "voiceTooLarge", "voiceNotUnderstood", "voiceNoCredits", "serviceUnavailable", "failed"]);
});
