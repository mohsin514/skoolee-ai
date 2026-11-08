import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AvatarImage } from "@/components/ui/avatar-image";

// SKAI-1003 live axe run (lane e, 2026-11-08): findings in shared components.

test("initials avatar meets AA contrast and exposes its label as an image (color-contrast)", () => {
  const html = renderToStaticMarkup(<AvatarImage name="Ayesha Khan" alt="Student photo" />);
  assert.doesNotMatch(html, /text-primary\/70/, "primary at 70% on brand-50 is 3.47:1");
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="Student photo"/);
});

test("accounts-by-role chart rows never carry a `role` field that Recharts copies onto <path> (aria-roles)", () => {
  const src = readFileSync("src/components/insights/PlatformOverview.tsx", "utf8");
  assert.doesNotMatch(src, /\(\{ role: roleLabel\(/);
  assert.doesNotMatch(src, /dataKey="role"/);
});

test("guide scroll panes are keyboard focusable (scrollable-region-focusable)", () => {
  for (const file of ["src/components/onboarding/LaunchGuide.tsx", "src/components/onboarding/GuideShowcase.tsx"]) {
    const line = readFileSync(file, "utf8").split("\n").find((l) => l.includes("data-guide-scroll")) ?? "";
    assert.match(line, /tabIndex=\{0\}/, file);
  }
});

test("chat conversation list landmark is named so it differs from the sidebar (landmark-unique)", () => {
  const src = readFileSync("src/components/chat/chat-workspace.tsx", "utf8");
  assert.match(src, /<aside aria-label=\{ui\("Conversations"\)\}/);
});
