/** QR contents are untrusted. Only pass a bounded JWT-shaped code to the server;
 * this does not verify its signature, student, school, expiry or paper version. */
export function scriptCodeFromQr(values: readonly string[]): string {
  const candidates = [...new Set(values.map(value => value.trim()).filter(value => value.length <= 3000 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)))];
  if (candidates.length !== 1 || values.some(value => !candidates.includes(value.trim()))) throw new Error("UNRECOGNIZED_OR_AMBIGUOUS_SCRIPT_QR");
  return candidates[0];
}
