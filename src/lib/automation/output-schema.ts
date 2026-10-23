import { aiOutputSchema } from "@/lib/ai/output-schema";
import { automaticDecisionSchema } from "./schema";
/** Send one schema with only tools the caller can execute; do not duplicate every proposal in the prompt. */
export function automaticOutputSchema(tools: string[], operations: string[]) {
 const allowedTools = new Set(tools), allowedOperations = new Set(operations);
 function trim(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter(item => {
   const props = item?.properties;
   return (!props?.tool?.const || allowedTools.has(props.tool.const)) && (!props?.operation?.const || allowedOperations.has(props.operation.const));
  }).map(trim).filter(item => item !== undefined);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trim(item)]));
  if (["oneOf", "anyOf"].some(key => Array.isArray(result[key]) && (result[key] as unknown[]).length === 0)) return undefined;
  const object = result as { properties?: { tool?: { const?: string }; data?: { properties?: Record<string, unknown> } } };
  if (object.properties?.tool?.const === "work.save" && object.properties.data?.properties) delete object.properties.data.properties.proposal;
  return result;
 }
 return trim(aiOutputSchema(automaticDecisionSchema));
}
