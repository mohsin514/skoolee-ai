/** Bounded turn detection shared by the voice UI and deterministic tests. */
export interface VoiceActivity { startedAt: number; lastSpeechAt: number; voicedMs: number }
export function advanceVoiceActivity(previous: VoiceActivity, rms: number, now: number, sampleMs = 100) {
  const voiced = rms >= 0.025;
  const next = { ...previous, lastSpeechAt: voiced ? now : previous.lastSpeechAt, voicedMs: previous.voicedMs + (voiced ? sampleMs : 0) };
  return { next, finish: next.voicedMs >= 350 && now - next.lastSpeechAt >= 1200 || now - next.startedAt >= 25000, empty: next.voicedMs < 350 };
}
export const voiceLanguage = { en: "en-US", ar: "ar", ur: "ur-PK" } as const;
