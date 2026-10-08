import { z } from "zod";

/** Explicit supported location choices. OTHER includes an unknown location. */
export const COUNTRIES = ["PK", "SA", "AE", "KW", "OTHER"] as const;
export const countrySchema = z.enum(COUNTRIES);
export type Country = z.infer<typeof countrySchema>;
const currencies = { PK: "PKR", SA: "SAR", AE: "AED", KW: "KWD", OTHER: "USD" } as const;
export function currencyForCountry(country: Country) { return currencies[countrySchema.parse(country)]; }
/** Import boundary only: never infer a country from an arbitrary city name. */
export function normalizeCountry(value: string | null | undefined): Country {
 const normalized = value?.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
 const aliases: Record<string, Country> = { pk: "PK", pakistan: "PK", sa: "SA", "saudi arabia": "SA", ae: "AE", uae: "AE", "united arab emirates": "AE", dubai: "AE", kw: "KW", kuwait: "KW" };
 return aliases[normalized || ""] || "OTHER";
}
