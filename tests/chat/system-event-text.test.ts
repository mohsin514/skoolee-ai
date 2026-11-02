import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { systemEventText } from "@/lib/chat/system-event-text";

// SKAI-1579: stored English membership events are re-templated for the viewer's language with isolated names.
const AR: Record<string, string> = {
  "{0} created this conversation": "أنشأ {0} هذه المحادثة",
  "{0} added {1}": "أضاف {0} {1}",
  "{0} left the conversation": "غادر {0} المحادثة",
  "{0} removed {1}": "أزال {0} {1}",
  "A moderator": "أحد المشرفين",
  "a member": "أحد الأعضاء",
};
const ui = (text: string, args: Array<string | number> = []) => (AR[text] ?? text).replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]));
const iso = (s: string) => `⁨${s}⁩`;

test("each membership event is localized with names isolated", () => {
  assert.equal(systemEventText("Sara Test created this conversation", ui), `أنشأ ${iso("Sara Test")} هذه المحادثة`);
  assert.equal(systemEventText("Sara Test added Omar QA, Lina QA", ui), `أضاف ${iso("Sara Test")} ${iso("Omar QA, Lina QA")}`);
  assert.equal(systemEventText("Omar QA left", ui), `غادر ${iso("Omar QA")} المحادثة`);
  assert.equal(systemEventText("A moderator removed a member", ui), `أزال ${iso("أحد المشرفين")} ${iso("أحد الأعضاء")}`);
});

test("unknown bodies pass through unchanged", () => {
  assert.equal(systemEventText("Conversation locked", ui), "Conversation locked");
});

test("thread and system previews use the localizer; user previews do not", () => {
  const thread = readFileSync("src/components/chat/message-thread.tsx", "utf8");
  const list = readFileSync("src/components/chat/conversation-list.tsx", "utf8");
  assert.match(thread, /\{systemEventText\(message\.body, ui\)\}/);
  assert.match(list, /c\.lastMessageSenderId === null \? <bdi>\{systemEventText\(c\.lastMessagePreview, ui\)\}<\/bdi>/);
});

test("catalog has every template in AR and UR", () => {
  const messages = readFileSync("src/lib/locale/workflow-ui-messages.ts", "utf8");
  for (const en of ["{0} created this conversation", "{0} added {1}", "{0} left the conversation", "{0} removed {1}", "A moderator"]) {
    assert.match(messages, new RegExp(`\\["${en.replace(/[{}]/g, "\\$&")}", "[^"]+", "[^"]+"\\]`), en);
  }
});
