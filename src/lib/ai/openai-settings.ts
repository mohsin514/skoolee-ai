/** Shared provider rules for readiness checks and requests. Never expose credentials. */
export function approvedOpenAIEndpoint(value = process.env.OPENAI_BASE_URL) {
  try {
    const url = new URL(value || "https://api.openai.com/v1");
    return url.protocol === "https:" && url.hostname === "api.openai.com" &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      ["/v1", "/v1/"].includes(url.pathname);
  } catch { return false; }
}

/** Reasoning models reject temperature and the retired max_tokens parameter. */
export function openAICompletionSettings(model: string, temperature: number, maxTokens: number) {
  const reasoningModel = /^(?:o[134](?:-|$)|gpt-5(?:[.-]|$))/i.test(model);
  return reasoningModel
    ? { max_completion_tokens: Math.max(2048, maxTokens * 4) }
    : { max_completion_tokens: maxTokens, temperature };
}
