// P9 acceptance (§11 P9 items 2 and 3; §10.9, F17, R3). Pure: no DOM library, no server.
// - toast string messages read in the document language, through the role-ux catalogs (§10.10);
// - the toast helpers say the same words for the same outcome;
// - ConfirmAction with `requireReason` blocks Confirm until the trimmed reason meets `minLength`, then passes it on.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { toast as sonner } from "sonner";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { DEFAULT_REASON_MIN_LENGTH, confirmOutcome, reasonMeetsRule } from "@/components/ui/confirm-action";
import { translateUi } from "@/lib/locale/ui-messages";

const realDocument = (globalThis as { document?: unknown }).document;
function speak(lang: string) {
  (globalThis as { document?: unknown }).document = { documentElement: { lang } };
}
after(() => { (globalThis as { document?: unknown }).document = realDocument; });

/** The title of the toast the last call created (Sonner keeps an in-memory history). */
function lastTitle(): unknown {
  const history = sonner.getHistory();
  const last = history[history.length - 1] as { title?: unknown } | undefined;
  return last?.title;
}

beforeEach(() => speak("en"));

test('toast.success("Saved") renders the Arabic and Urdu translation when the document language is ar/ur', () => {
  speak("ar");
  toast.success("Saved");
  assert.equal(lastTitle(), translateUi("Saved", "ar"));
  assert.notEqual(lastTitle(), "Saved");
  speak("ur");
  toast.success("Saved");
  assert.equal(lastTitle(), translateUi("Saved", "ur"));
  assert.notEqual(lastTitle(), "Saved");
  speak("en");
  toast.success("Saved");
  assert.equal(lastTitle(), "Saved");
});

test("warning, info and the plain toast translate string messages too; descriptions follow", () => {
  speak("ar");
  toast.warning("Saved");
  assert.equal(lastTitle(), translateUi("Saved", "ar"));
  toast.info("Copied to clipboard", { description: "Saved" });
  const last = sonner.getHistory().at(-1) as { title?: unknown; description?: unknown };
  assert.equal(last.title, translateUi("Copied to clipboard", "ar"));
  assert.equal(last.description, translateUi("Saved", "ar"));
  toast("Deleted");
  assert.equal(lastTitle(), translateUi("Deleted", "ar"));
});

test("helpers exist and say the same words for the same outcome", () => {
  for (const name of ["saved", "deleted", "sent", "copied", "actionFailed"] as const) assert.equal(typeof toast[name], "function", `toast.${name}`);
  toast.saved();
  assert.equal(lastTitle(), "Saved");
  toast.deleted();
  assert.equal(lastTitle(), "Deleted");
  toast.sent();
  assert.equal(lastTitle(), "Sent");
  toast.copied();
  assert.equal(lastTitle(), "Copied to clipboard");
  toast.sent("Weekly update", "Ali");
  assert.equal(lastTitle(), "Weekly update sent to ⁨Ali⁩", "the recipient is isolated for RTL");
  speak("ur");
  toast.saved();
  assert.equal(lastTitle(), translateUi("Saved", "ur"));
  toast.copied();
  assert.equal(lastTitle(), translateUi("Copied to clipboard", "ur"));
});

test("actionFailed names the action and keeps only a human server message", () => {
  toast.actionFailed("save the timetable", new Error("This class already has a lesson at that time."));
  const readable = sonner.getHistory().at(-1) as { title?: unknown; description?: unknown };
  assert.equal(readable.title, "Could not save the timetable. Try again.");
  assert.equal(readable.description, "This class already has a lesson at that time.");
  toast.actionFailed("save the timetable", new Error("Unexpected token < in JSON at position 0"));
  const technical = sonner.getHistory().at(-1) as { description?: unknown };
  assert.equal(technical.description, undefined, "a technical message is never shown");
});

test("error copy: network and technical failures become plain words in the reader's language", () => {
  speak("ar");
  assert.equal(friendlyErrorMessage(new Error("Failed to fetch")), translateUi("We couldn't reach Skoolee. Check your connection and try again.", "ar"));
  assert.equal(friendlyErrorMessage(new Error("P2002 unique constraint")), translateUi("Something went wrong. Please try again.", "ar"));
});

test("requireReason: Confirm is blocked until the trimmed reason meets minLength, then the reason is passed on", () => {
  const rule = { label: "Reason", minLength: 10 };
  assert.equal(DEFAULT_REASON_MIN_LENGTH, 10, "matches the server's audit minimum");
  assert.deepEqual(confirmOutcome({ reason: "", rule }), { confirm: false, blockedBy: "reason" });
  assert.deepEqual(confirmOutcome({ reason: "too short", rule }), { confirm: false, blockedBy: "reason" });
  assert.deepEqual(confirmOutcome({ reason: "    padded    ", rule }), { confirm: false, blockedBy: "reason" }, "whitespace does not count");
  assert.deepEqual(confirmOutcome({ reason: "  Sole admin on campus  ", rule }), { confirm: true, reason: "Sole admin on campus" });
  assert.deepEqual(confirmOutcome({ reason: "Sole admin on campus", rule, busy: true }), { confirm: false, blockedBy: "busy" });
  // Default minimum, custom minimum, and no rule at all.
  assert.equal(reasonMeetsRule("123456789", {}), false);
  assert.equal(reasonMeetsRule("1234567890", {}), true);
  assert.equal(reasonMeetsRule("abc", { minLength: 3 }), true);
  assert.equal(reasonMeetsRule("", { minLength: 0 }), false, "a required reason is never empty");
  assert.deepEqual(confirmOutcome({ reason: "ignored" }), { confirm: true }, "without requireReason no reason is passed");
});
