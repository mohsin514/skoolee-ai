import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync("test-results/school-ai/exam-fixture.json", "utf8")) as { examId: string; paperId: string; curriculumId: string };
const tokens = JSON.parse(readFileSync("test-results/school-ai/local-tokens.json", "utf8")) as Record<string, string>;
const authenticate = (context: BrowserContext, role = "a-STUDENT") => context.addCookies([{ name: "skoolee_token", value: tokens[role], url: "http://localhost:3106", httpOnly: true, sameSite: "Lax" }]);
const readiness = async (page: Page) => {
  await page.getByRole("button", { name: "Check readiness", exact: true }).click();
  await expect(page.getByText("Connected to the exam server", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "I understand the timer, availability end, and saving requirements, and I am ready to start." }).check();
};
const endpoint = `/api/school-ai/exams/${fixture.examId}`;

test("student saves, reloads and submits a real attempt without receiving marking keys", async ({ page, context }) => {
  await authenticate(context);
  const metadata = await page.request.get(endpoint); expect(metadata.ok()).toBeTruthy();
  expect(JSON.stringify(await metadata.json())).not.toMatch(/correctOptionId|modelAnswer|rubric|paperSnapshot/);
  await page.goto(`/ai/exams/${fixture.examId}`);
  await expect(page.getByRole("heading", { name: "Browser QA mathematics exam" })).toBeVisible();
  await expect(page.getByText(/Standard browser mode cannot block other tabs or applications/)).toBeVisible();
  await expect(page.getByText(/Camera or screen clips are optional, require your separate consent/)).toBeVisible();
  await readiness(page);
  await page.getByRole("button", { name: "Start exam", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What is 2 + 2?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to student dashboard" })).toHaveCount(0);
  const first = page.locator("fieldset#exam-answer-q1"); await first.getByRole("button", { name: "4", exact: true }).click();
  await expect(page.locator("fieldset#exam-answer-q2").getByRole("button", { name: "4", exact: true })).toBeDisabled();
  await page.getByLabel("Your answer", { exact: true }).fill("I combine the two quantities and count the total.");
  await expect(page.getByText("Saved to server", { exact: true })).toBeVisible();
  const saved = await page.request.get(`${endpoint}/attempt`); const payload = await saved.json();
  expect(payload.attempt.responses).toEqual({ q1: "a1", q3: "I combine the two quantities and count the total." });
  expect(payload.attempt.sequence).toBeGreaterThan(0);
  expect(JSON.stringify(payload)).not.toMatch(/correctOptionId|modelAnswer|rubric|sourceRefs|scoreProposal/);
  const deadline = payload.attempt.deadlineAt;
  await page.reload();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue("I combine the two quantities and count the total.");
  expect((await (await page.request.get(`${endpoint}/attempt`)).json()).attempt.deadlineAt).toBe(deadline);
  await page.getByRole("button", { name: "Submit final answers", exact: true }).click();
  await page.getByRole("dialog", { name: "Submit final answers" }).getByRole("button", { name: "Submit final answers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Submission received" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to student dashboard" })).toHaveAttribute("href", "/student");
  const receipt = (await (await page.request.get(`${endpoint}/attempt`)).json()).attempt;
  expect(receipt.status).toBe("SUBMITTED");
  const repeat = await page.request.patch(`${endpoint}/attempt`, { data: { sequence: receipt.sequence + 1, responses: { q1: "a2" }, submit: true } });
  expect(repeat.ok()).toBeTruthy(); expect((await repeat.json()).attempt.responses.q1).toBe("a1");
});

test("student exam list includes a visible dashboard return link", async ({ page, context }) => {
  await authenticate(context);
  await page.goto("/ai/exams");
  await expect(page.getByRole("link", { name: "Back to student dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to student dashboard", exact: true })).toHaveAttribute("href", "/student");
});

test("family authoring and cross-school exam access fail closed at the API", async ({ page, context }) => {
  await authenticate(context);
  expect((await page.request.get(`/api/school-ai/workspace/${fixture.paperId}`)).status()).toBe(403);
  expect((await page.request.get(`${endpoint}/attempts`)).status()).toBe(403);
  await context.clearCookies(); await authenticate(context, "b-STUDENT");
  expect((await page.request.get(endpoint)).status()).toBe(404);
  expect((await page.request.post(`${endpoint}/attempt`)).status()).toBe(404);
});

test("staff review saves moderated marks and shows real student evidence", async ({ page, context }) => {
  await authenticate(context, "a-ADMIN");
  await page.goto(`/ai/exams/${fixture.examId}`);
  await expect(page.getByRole("heading", { name: "Open marking desk" })).toBeVisible();
  await page.getByLabel("Students with an active login").selectOption({ index: 1 });
  await expect(page.getByText("I combine the two quantities and count the total.", { exact: true })).toBeVisible();
  const inputs = page.getByRole("spinbutton"); await expect(inputs).toHaveCount(2);
  await expect(inputs.nth(0)).toHaveValue("2"); await expect(inputs.nth(1)).toHaveValue("");
  await inputs.nth(1).fill("2");
  const feedback = page.getByLabel("Reviewer feedback"); await feedback.nth(0).fill("Correct choice checked against the approved key."); await feedback.nth(1).fill("Combining is explained; one mark held for missing detail.");
  await page.getByLabel("Moderation note").fill("Synthetic browser moderation completed against the rubric.");
  await page.getByRole("button", { name: "Save moderated marks" }).click();
  await expect(page.getByRole("status").filter({ hasText: "An administrator must separately send them to the gradebook" })).toBeVisible();
  const results = await page.request.get(`${endpoint}/attempts`); const data = await results.json();
  expect(data.attempts[0].status).toBe("REVIEWED"); expect(data.attempts[0].review.total).toBe(4);
});

test("standalone staff exam workspace loads approved papers and assigns the real class roster", async ({ page, context }) => {
  await authenticate(context, "a-ADMIN");
  await page.goto("/ai/exams");
  await page.getByLabel("Approved paper", { exact: true }).selectOption(fixture.paperId);
  const title = `Browser assigned exam ${Date.now()}`;
  await page.getByLabel("Exam title", { exact: true }).fill(title);
  const times = await page.evaluate(() => {
    const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return { start: format(new Date(Date.now() - 60000)), end: format(new Date(Date.now() + 3600000)) };
  });
  await page.getByLabel("Available from", { exact: true }).fill(times.start);
  await page.getByLabel("Available until", { exact: true }).fill(times.end);
  await page.getByRole("button", { name: "Load class students", exact: true }).click();
  await page.getByLabel("Synthetic Learner · QA-1", { exact: true }).check();
  await page.getByRole("button", { name: "Assign standard browser exam", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const list = await page.request.get("/api/school-ai/exams"); const rows = (await list.json()).exams;
  expect(rows.filter((exam: { title: string }) => exam.title === title)).toHaveLength(1);
});

test("an uncertain autosave retries its original payload before saving newer edits", async ({ page, context }) => {
  await authenticate(context, "a-ADMIN");
  const creation = await page.request.post("/api/school-ai/exams", { data: { idempotencyKey: crypto.randomUUID(), paperId: fixture.paperId, title: "Connection recovery browser exam", startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), studentIds: ["school-ai-browser-a-student"], mode: "STANDARD" } });
  expect(creation.ok()).toBeTruthy(); const examId = (await creation.json()).exam.id;
  await context.clearCookies(); await authenticate(context);
  await page.goto(`/ai/exams/${examId}`);
  await readiness(page);
  await page.getByRole("button", { name: "Start exam", exact: true }).click();
  let intercepted = false;
  await page.route(`**/api/school-ai/exams/${examId}/attempt`, async (route) => {
    if (route.request().method() === "PATCH" && !intercepted) {
      intercepted = true;
      const upstream = await route.fetch(); expect(upstream.ok()).toBeTruthy();
      await route.abort("failed"); // Server committed; only its response is lost.
    } else await route.continue();
  });
  await page.locator("fieldset#exam-answer-q1").getByRole("button", { name: "4", exact: true }).click();
  const saveError = page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Retry", exact: true }) });
  await expect(saveError).toContainText(/Failed to fetch|NetworkError|request/i);
  await page.getByLabel("Your answer", { exact: true }).fill("Newer edit retained while the previous save response was lost.");
  await saveError.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Saved to server", { exact: true })).toBeVisible();
  const saved = (await (await page.request.get(`/api/school-ai/exams/${examId}/attempt`)).json()).attempt;
  expect(saved.responses).toEqual({ q1: "a1", q3: "Newer edit retained while the previous save response was lost." });
  expect(saved.sequence).toBe(2);
});


test("manager approves extra time and preflight checks the connection before an immutable start", async ({ page, context }) => {
  await authenticate(context, "a-ADMIN");
  const creation = await page.request.post("/api/school-ai/exams", { data: { idempotencyKey: crypto.randomUUID(), paperId: fixture.paperId, title: "Accommodation readiness exam", startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString(), studentIds: ["school-ai-browser-a-student"], mode: "STANDARD" } });
  expect(creation.ok()).toBeTruthy(); const examId = (await creation.json()).exam.id;
  const api = `/api/school-ai/exams/${examId}`;
  await page.goto(`/ai/exams/${examId}`);
  await page.getByLabel("Assigned student", { exact: true }).selectOption("school-ai-browser-a-student");
  await page.getByLabel("Extra minutes", { exact: true }).fill("15");
  await page.getByLabel("Approval reason", { exact: true }).fill("Approved assessment arrangement without medical details.");
  await page.getByRole("button", { name: "Approve extra time", exact: true }).click();
  await expect(page.getByText("Extra time approval saved", { exact: true })).toBeVisible();
  await context.clearCookies(); await authenticate(context);
  const metadata = (await (await page.request.get(api)).json()).exam;
  expect(metadata.extraMinutes).toBe(15); expect(metadata.durationMinutes).toBe(45);
  expect(JSON.stringify(metadata)).not.toMatch(/approvedById|medical|reason/);
  expect((await page.request.post(`${api}/attempt`, { data: { version: 1 } })).status()).toBe(409);
  expect((await (await page.request.get(`${api}/attempt`)).json()).attempt).toBeNull();
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) { if (key.startsWith("school-ai-readiness-")) throw new DOMException("Storage disabled", "SecurityError"); return original.call(this, key, value); };
  });
  await page.goto(`/ai/exams/${examId}`);
  const start = page.getByRole("button", { name: "Start exam", exact: true }); await expect(start).toBeDisabled();
  await page.route(`**${api}`, (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Check readiness", exact: true }).click();
  await expect(page.getByText("The exam server could not be reached. Check your connection and run the check again.", { exact: true })).toBeVisible();
  await expect(start).toBeDisabled();
  await page.unroute(`**${api}`);
  await page.getByLabel("Try typing before you start", { exact: true }).fill("Practice must never reach the answer service.");
  await readiness(page);
  await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible();
  await start.click();
  await expect(page.getByRole("heading", { name: "What is 2 + 2?", exact: true })).toBeVisible();
  const attempt = (await (await page.request.get(`${api}/attempt`)).json()).attempt;
  expect(new Date(attempt.deadlineAt).getTime() - new Date(attempt.startedAt).getTime()).toBe(45 * 60000);
  expect(attempt.responses).toEqual({});
  await page.reload();
  await expect(page.getByRole("heading", { name: "What is 2 + 2?", exact: true })).toBeVisible();
  expect((await (await page.request.get(`${api}/attempt`)).json()).attempt.deadlineAt).toBe(attempt.deadlineAt);
  await context.clearCookies(); await authenticate(context, "a-ADMIN");
  await page.goto(`/ai/exams/${examId}`);
  await page.getByLabel("Assigned student", { exact: true }).selectOption("school-ai-browser-a-student");
  await expect(page.getByText("This student has already started. The deadline is fixed.", { exact: true })).toBeVisible();
  expect((await page.request.patch(`${api}/accommodations`, { data: { version: metadata.version, studentId: "school-ai-browser-a-student", extraMinutes: 0, reason: "Cannot shorten active attempt" } })).status()).toBe(409);
});
