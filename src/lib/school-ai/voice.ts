/** Bounded turn detection shared by the voice UI and deterministic tests. */
export interface VoiceActivity { startedAt: number; lastSpeechAt: number; voicedMs: number }
export function advanceVoiceActivity(previous: VoiceActivity, rms: number, now: number, sampleMs = 100) {
  const voiced = rms >= 0.025;
  const next = { ...previous, lastSpeechAt: voiced ? now : previous.lastSpeechAt, voicedMs: previous.voicedMs + (voiced ? sampleMs : 0) };
  return { next, finish: next.voicedMs >= 350 && now - next.lastSpeechAt >= 1200 || now - next.startedAt >= 25000, empty: next.voicedMs < 350 };
}
export const voiceLanguage = { en: "en-US", ar: "ar", ur: "ur-PK" } as const;

/** SKO-460: what the transcriber itself was unsure of, so the reviewer checks those words first. */
export interface TranscriptCheck { confidence: "low" | "ok" | "unknown"; uncertain: string[] }
type Segment = { text: string; avg_logprob?: number; no_speech_prob?: number };
type TokenLogprob = { token?: string; logprob?: number };
const LOW_TOKEN = Math.log(0.5);
export function transcriptConfidence(input: { segments?: Segment[] | null; logprobs?: TokenLogprob[] | null }): TranscriptCheck {
  const found: string[] = [];
  const add = (text: string) => { const clean = text.trim().replace(/\s+/g, " ").slice(0, 60); if (/[\p{L}\p{N}]/u.test(clean) && !found.includes(clean)) found.push(clean); };
  if (input.segments?.length) {
    for (const segment of input.segments) if ((segment.avg_logprob ?? 0) < -1 || (segment.no_speech_prob ?? 0) > 0.6) add(segment.text);
  } else if (input.logprobs?.length) {
    // Tokens are joined into words (a leading space starts a new word); a word is as unsure as its least likely token.
    let word = "", lowest = 0;
    const flush = () => { if (word && lowest < LOW_TOKEN) add(word.replace(/[.,!?؟،۔;:"']+$/u, "")); word = ""; lowest = 0; };
    for (const { token = "", logprob = 0 } of input.logprobs) { if (/^\s/.test(token)) flush(); word += token; lowest = Math.min(lowest, logprob); }
    flush();
  } else return { confidence: "unknown", uncertain: [] };
  return { confidence: found.length ? "low" : "ok", uncertain: found.slice(0, 8) };
}
