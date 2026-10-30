import { z } from "zod";
import { atLeast, floorFor, CLASS_A_ALLOWLIST } from "./floors";
import type { CapabilityEntry, Exclusion, ExecEntry, HandoffEntry } from "./types";

/**
 * Entries are validated when they are defined, so a mis-classed or malformed capability fails at
 * import (and therefore in every test and build), not when a user first asks for it.
 */
export class RegistryDefinitionError extends Error { name = "RegistryDefinitionError"; }

const KEY = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function assertEntry(entry: CapabilityEntry) {
  const fail = (message: string) => { throw new RegistryDefinitionError(`${entry.key}: ${message}`); };
  if (!KEY.test(entry.key)) fail("key must be dotted lower_snake (domain.verb)");
  if (entry.key.replaceAll(".", "__").length > 64) fail("key exceeds the 64-character tool-name limit");
  if (!entry.roles.length) fail("no roles");
  if (!entry.inventoryKeys.length) fail("no inventory keys");
  if (!entry.gates.length) fail("at least one gate is required");
  if (entry.literalEvidence?.some(pointer => entry.class !== "C" || !/^\/[^/]+$/.test(pointer) || !entry.evidence.includes(pointer))) fail("literal evidence is limited to declared top-level class-C form fields");
  if (entry.dialogueFields && (entry.class !== "C" || entry.dialogueFields.some(field => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field.key) || /password|token|secret|(^id$)|Id$/.test(field.key) || !field.labels.length))) fail("dialogue forms require safe top-level class-C fields");
  if (entry.dialogueFields) {
    if (!(entry.input instanceof z.ZodObject)) fail("dialogue input must be an object schema");
    else {
      const shape = entry.input.shape;
      const keys = new Set(entry.dialogueFields.map(field => field.key));
      if (entry.dialogueFields.some(field => !shape[field.key])) fail("dialogue field is not in the input schema");
      for (const [key, schema] of Object.entries(shape)) if (!(schema as z.ZodType).safeParse(undefined).success && !keys.has(key)) fail(`required dialogue field ${key} is missing`);
    }
  }
  const floor = floorFor(entry.key, entry.risk);
  if (!atLeast(entry.class, floor)) fail(`class ${entry.class} is below its ${entry.risk} floor ${floor}`);
  if (entry.class === "A" && entry.risk !== "READ" && !CLASS_A_ALLOWLIST[entry.key]) fail("class A write is not in CLASS_A_ALLOWLIST");
  if (entry.class === "C") {
    if ("execute" in entry && entry.execute !== undefined) fail("class C entries hand off and must not execute");
    if (!entry.handoff) fail("class C entry has no hand-off");
  } else {
    if (typeof entry.execute !== "function") fail("class A/B entry has no execute");
    if (entry.class === "B" && typeof entry.preview !== "function") fail("class B entry needs a preview to confirm against");
  }
  for (const locale of ["en", "ar", "ur"] as const) {
    if (!entry.copy.title[locale]?.trim() || !entry.copy.whenToUse[locale]?.trim()) fail(`missing ${locale} title or when-to-use copy`);
    if (!entry.copy.examples[locale]?.length) fail(`missing ${locale} examples`);
  }
}

export function defineCapability<I>(entry: ExecEntry<I>): ExecEntry<I>;
export function defineCapability<I>(entry: HandoffEntry<I>): HandoffEntry<I>;
export function defineCapability(entry: CapabilityEntry): CapabilityEntry {
  assertEntry(entry);
  return Object.freeze(entry);
}

export function defineExclusion(exclusion: Exclusion): Exclusion {
  if (!exclusion.reason.trim()) throw new RegistryDefinitionError(`${exclusion.key}: an exclusion needs a reason`);
  return Object.freeze(exclusion);
}
