/**
 * Signing secret for the isolated school-AI browser suites. CI keeps the fixed test value; a QA lane whose app runs
 * with its own generated test AUTH_SECRET sets QA_AUTH_SECRET to it (same variable as scripts/qa/app.sh).
 */
export const SCHOOL_AI_TEST_SECRET = process.env.QA_AUTH_SECRET || "school-ai-isolated-browser-test-secret-only";
