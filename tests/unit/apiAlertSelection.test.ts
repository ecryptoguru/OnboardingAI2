import assert from "node:assert/strict";
import { test } from "node:test";
import { selectVisibleAlert } from "../../components/apiAlertSelection";

interface Alert {
  _id: string;
  acknowledged_at?: number;
}

const alerts: Alert[] = [
  { _id: "a1" },
  { _id: "a2" },
  { _id: "a3", acknowledged_at: 123 },
];

test("shows the first unacknowledged alert by default", () => {
  assert.equal(selectVisibleAlert(alerts, new Set())?._id, "a1");
});

test("a NEW alert surfaces after an older one is session-dismissed", () => {
  assert.equal(selectVisibleAlert(alerts, new Set(["a1"]))?._id, "a2");
});

test("dismissed alerts stay hidden while still unacknowledged", () => {
  assert.equal(selectVisibleAlert(alerts, new Set(["a1", "a2"])), null);
});

test("acknowledged alerts are never shown even when not dismissed", () => {
  assert.equal(selectVisibleAlert(alerts, new Set(["a1", "a2", "a3"])), null);
});

test("a newly arriving alert surfaces when all prior ones are dismissed", () => {
  const withNew = [...alerts, { _id: "a4" }];
  assert.equal(selectVisibleAlert(withNew, new Set(["a1", "a2"]))?._id, "a4");
});

test("returns null for undefined or empty alert lists", () => {
  assert.equal(selectVisibleAlert(undefined, new Set()), null);
  assert.equal(selectVisibleAlert([], new Set()), null);
});
