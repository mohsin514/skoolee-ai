import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1606: retrying a sample create returns the same sample instead of drawing another.
const svc = readFileSync("src/lib/school-ai/exam-moderation-service.ts", "utf8");
const panel = readFileSync("src/components/school-ai/exam-moderation-panel.tsx", "utf8");
const body = svc.slice(svc.indexOf("export async function createModerationSample"), svc.indexOf("function sampleView"));

test("creates are serialized per lead and exam, then a recent identical sample is replayed", () => {
  const lock = body.indexOf("pg_advisory_xact_lock(hashtext(${`moderation-sample:${user.schoolId}:${assignmentId}:${user.userId}`}))");
  const replay = body.indexOf("tx.schoolAiModerationSample.findFirst");
  const draw = body.indexOf("randomInt(");
  const create = body.indexOf("tx.schoolAiModerationSample.create");
  assert.ok(lock > 0 && lock < replay && replay < draw && draw < create, "lock, replay check, draw, create");
  assert.match(body, /createdById: user\.userId, method: input\.method, threshold: input\.threshold, blind: input\.blind, reviewerId: input\.reviewerId, createdAt: \{ gte: new Date\(Date\.now\(\) - SAMPLE_REPLAY_WINDOW_MS\) \}/);
  assert.match(body, /if \(replay\) return replay;/);
  assert.match(svc, /export const SAMPLE_REPLAY_WINDOW_MS = 2 \* 60 \* 1000;/);
});

test("the panel reconciles after a network failure before the next attempt", () => {
  assert.match(panel, /if \(!\(e as \{ status\?: number \}\)\.status\) await load\(\);/);
});
