/** Explicit conversation state: a short answer only makes sense alongside its question.
 * Never send receipts, credentials, database IDs, or server-owned execution fields to the model. */
export function plannerInput(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  const handles = new Map([...ids].map(([handle, id]) => [id, handle]));
  const walk = (item: unknown, key = ""): unknown => {
    if (/password|secret|token|credential|^expected$|^id$|hash$/i.test(key)) return undefined;
    if (typeof item === "string") {
      if (handles.has(item)) return handles.get(item);
      if (/(Id|Ids)$/.test(key) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(item)) return undefined;
      return item;
    }
    if (Array.isArray(item)) return item.map(child => walk(child, key)).filter(child => child !== undefined);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).flatMap(([name, child]) => {
      const safe = walk(child, name);
      return safe === undefined ? [] : [[name, safe]];
    }));
    return item;
  };
  return walk(value);
}

/** Conservative fast-path guard. Compound requests belong to the full planner, not a single form. */
export function hasMultipleActions(text: string): boolean {
  return /(?:\band\b|\bthen\b|\balso\b|[;\n])\s*(?:please\s+|kindly\s+)?(?:create|add|register|update|change|set|delete|remove|show|list|find|send|generate|prepare|check|open|cancel|onboard|provision|make|log)\b/i.test(text);
}

export function isGuidanceQuestion(text: string): boolean {
  return /^(?:please\s+)?(?:how (?:do|can|should|would|to)\b|what (?:can you|does|is|are)\b|explain\b|tell me how\b)/i.test(text.trim());
}

export function isAppGuidanceRequest(text: string): boolean {
  return /^(?:please\s+)?(?:how (?:do|can|should|would|to)\b|what can you\b|explain (?:how|skoolee|the app|app features|workflows)\b|tell me how\b)/i.test(text.trim());
}
