/** SKAI-1619: the configured pass mark, or null when the rule is missing or malformed. */
export function passingPercentageFrom(cfg: unknown): number | null {
  const value = (cfg as { config?: { passingPercentage?: unknown } } | null)?.config?.passingPercentage;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}
