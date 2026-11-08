import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-577: the stock and stock-movement CSV reports live behind InventoryPanel's "export" command. The campus
// admin's Inventory & purchasing view must offer that action in its header and forward header commands to the panel.
test("the campus admin inventory view offers Export and Receive goods and forwards them to the inventory panel", () => {
  const admin = readFileSync("src/app/admin/page.tsx", "utf8");
  const view = admin.slice(admin.indexOf('case "inventory":'), admin.indexOf('case "library":'));
  assert.match(view, /sendCommand\("inventory", "export"\)/);
  assert.match(view, /sendCommand\("inventory", "receive-goods"\)/);
  assert.match(view, /<InventoryPanel command=\{commandFor\("inventory"\)\} \/>/);
});
