import { z } from "zod";

const plan = z.enum(["FREE", "BASIC", "PRO", "ENTERPRISE"]);
const price = z.number().finite().nonnegative();
export const defaultPricingSchema = z.partialRecord(plan, z.object({ price: price.nullable().optional() }).strict());
export const schoolPricingSchema = z.partialRecord(plan, z.object({ price: price.optional() }).strict());
