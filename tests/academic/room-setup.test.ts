import assert from "node:assert/strict";
import test from "node:test";
import { cleanRoomName, parseBulkRooms, roomNameKey } from "../../src/lib/academic/room-setup";

// SKAI-147: room names are unique per campus regardless of case and spacing.
test("room name keys ignore case and spacing", () => {
  assert.equal(cleanRoomName("  R   101 "), "R 101");
  assert.equal(roomNameKey("Lab-1"), roomNameKey(" LAB-1"));
  assert.notEqual(roomNameKey("Lab-1"), roomNameKey("Lab-2"));
});

test("bulk rooms parse comma and tab rows, skipping a header", () => {
  const { rows, errors } = parseBulkRooms("Room, Capacity, Type\nR-101, 30\nChem Lab\t24\tLaboratory\tScience Wing\t1\n\nHall A,120,hall");
  assert.deepEqual(errors, []);
  assert.deepEqual(rows.map(r => [r.roomNumber, r.capacity, r.roomType, r.building, r.floor]), [
    ["R-101", 30, "CLASSROOM", null, 0],
    ["Chem Lab", 24, "LAB", "Science Wing", 1],
    ["Hall A", 120, "HALL", null, 0],
  ]);
});

test("bulk rooms report every bad line with its number and keep the good ones", () => {
  const { rows, errors } = parseBulkRooms("R-1, 30\nr-1, 20\nR-2, -4\nR-3, 10, pool\n, 5\nR-4, 10, lab, Main, 99");
  assert.deepEqual(rows.map(r => r.roomNumber), ["R-1"]);
  assert.deepEqual(errors.map(e => [e.line, e.code]), [
    [2, "DUPLICATE_IN_LIST"], [3, "BAD_CAPACITY"], [4, "BAD_TYPE"], [5, "NAME_REQUIRED"], [6, "BAD_FLOOR"],
  ]);
});
