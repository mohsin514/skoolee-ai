import { z } from "zod";

/**
 * Zod adds JavaScript's 16-digit safe-integer limits to every unbounded integer.
 * Those implementation constants resemble national IDs to the egress scanner.
 * Omit only these redundant bounds in the provider's schema; preserve integer
 * types, business limits and all text. The original Zod schema still validates
 * the response, and the complete outgoing prompt still passes the PII scanner.
 * The model writes what the schema parses, so describe the input side: output
 * mode cannot represent transforms (e.g. exam term normalisation) and throws.
 */
export function aiOutputSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    io: "input",
    override: ({ jsonSchema }) => {
      if (jsonSchema.type !== "integer") return;
      if (jsonSchema.maximum === Number.MAX_SAFE_INTEGER) delete jsonSchema.maximum;
      if (jsonSchema.minimum === Number.MIN_SAFE_INTEGER) delete jsonSchema.minimum;
    },
  });
}
