import assert from "node:assert/strict";
import test from "node:test";
import { buildProcessingInventory, databaseRegion, planPlacement } from "@/lib/data-lifecycle/inventory";

const now = new Date("2026-10-17T00:00:00Z");
const deployed = {
  DATABASE_URL: "postgresql://user:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
  S3_BUCKET_NAME: "school-files", S3_REGION: "ap-south-1", SMTP_HOST: "smtp.example.com",
};
const byService = (env: Record<string, string>, verifications = []) => Object.fromEntries(buildProcessingInventory(env, verifications, now).map(item => [item.service, item]));

test("database region is read from the real connection host, never guessed", () => {
  assert.equal(databaseRegion(deployed.DATABASE_URL), "ap-south-1");
  assert.equal(databaseRegion("postgresql://u@127.0.0.1:55438/postgres"), "local");
  assert.equal(databaseRegion("postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres"), null);
  assert.equal(databaseRegion("not a url"), null);
});

test("detected locations are only configured until unexpired evidence for that service and region exists", () => {
  const plain = byService(deployed);
  assert.equal(plain.database.state, "configured");
  assert.equal(plain.files.location, "ap-south-1");
  const verified = byService(deployed, [
    { service: "database", region: "ap-south-1", verifiedAt: new Date("2026-10-01Z"), expiresAt: new Date("2027-01-01Z") },
    { service: "files", region: "eu-central-1", verifiedAt: new Date("2026-10-01Z"), expiresAt: new Date("2027-01-01Z") },
    { service: "backups", region: "ap-south-1", verifiedAt: new Date("2026-01-01Z"), expiresAt: new Date("2026-06-01Z") },
  ] as never);
  assert.equal(verified.database.state, "verified");
  assert.equal(verified.files.state, "configured", "evidence for another region does not count");
  assert.equal(verified.backups.state, "configured", "expired evidence does not count");
});

test("provider-decided services are unsupported for regional placement; a loopback Ollama is local", () => {
  const services = byService(deployed);
  for (const name of ["ai", "email", "whatsapp", "sms", "support"]) assert.equal(services[name].state, "unsupported", name);
  assert.equal(byService({ ...deployed, AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "http://127.0.0.1:11434" }).ai.location, "local");
  assert.equal(byService({ ...deployed, AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "https://ollama.example.com" }).ai.state, "unsupported");
});

test("automatic R2 placement and an unidentifiable database are not presented as a region", () => {
  const services = byService({ DATABASE_URL: "postgresql://u:p@db.ref.supabase.co/postgres", S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com", S3_REGION: "auto" });
  assert.equal(services.database.location, null);
  assert.equal(services.database.state, "not_configured");
  assert.equal(services.files.location, null);
});

test("a migration plan lists every service and blocks targets the core services cannot reach", () => {
  const inventory = buildProcessingInventory(deployed, [], now);
  const uae = planPlacement(inventory, "me-central-1");
  assert.equal(uae.items.length, inventory.length);
  assert.equal(uae.blocked, true);
  assert.ok(uae.blockers.some(item => item.startsWith("database")));
  const frankfurt = planPlacement(inventory, "eu-central-1");
  assert.equal(frankfurt.blocked, false);
  assert.equal(frankfurt.items.find(item => item.service === "database")!.outcome, "moves");
  assert.equal(frankfurt.items.find(item => item.service === "ai")!.outcome, "outside_region");
  assert.equal(planPlacement(inventory, "ap-south-1").items.find(item => item.service === "files")!.outcome, "stays");
});
