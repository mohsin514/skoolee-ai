-- Spotlight tour progress per console variant (additive only; no data rewrite).
-- Shape: { "<tourId>": { "v": <version>, "s": "done" | "dismissed", "at": "<ISO time>" } }
ALTER TABLE "users" ADD COLUMN "tour_progress" JSONB NOT NULL DEFAULT '{}'::jsonb;
