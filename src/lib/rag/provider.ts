import OpenAI from "openai";
import { approvedOpenAIEndpoint } from "@/lib/ai/openai-settings";
import { assertNoPII, Pseudonymizer, scanForPII } from "@/lib/ai/pseudonymize";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 512;
export function embeddingsConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && approvedOpenAIEndpoint() && (!process.env.AI_PROVIDER || ["auto", "openai"].includes(process.env.AI_PROVIDER)) && process.env.RAG_EMBEDDINGS_ENABLED !== "false");
}
export type Embed = (texts: string[]) => Promise<number[][] | null>;
/** Bounded batches, fixed approved destination, no public-provider fallback or raw identifiers. */
export const embedTexts: Embed = async texts => {
  if (!embeddingsConfigured()) return null;
  const masker = new Pseudonymizer();
  const input = texts.map(text => { for (const hit of scanForPII(text)) masker.token(hit, "ID"); const clean = masker.mask(text); assertNoPII(clean, "knowledge embedding"); return clean; });
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", timeout: 12000, maxRetries: 0 });
  const vectors: number[][] = [];
  for (let at = 0; at < input.length; at += 32) {
    const response = await client.embeddings.create({ input: input.slice(at, at + 32), model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, encoding_format: "float" });
    const rows = [...response.data].sort((a, b) => a.index - b.index);
    if (rows.length !== input.slice(at, at + 32).length || rows.some((row, index) => row.index !== index || row.embedding.length !== EMBEDDING_DIMENSIONS || row.embedding.some(n => !Number.isFinite(n)))) throw new Error("Invalid embedding response");
    vectors.push(...rows.map(row => row.embedding));
  }
  return vectors;
};
