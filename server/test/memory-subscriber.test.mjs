import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { fastForwardStaleCursor } from "../lib/memory-subscriber.mjs";

// Build a minimal in-memory bus DB with just the columns fastForwardStaleCursor
// touches. Column/table names mirror wicked-bus's schema (poll.js / subscribe.js):
// events.event_id, subscriptions.{subscription_id,plugin,role,event_type_filter,
// registered_at,deregistered_at}, cursors.{cursor_id,subscription_id,
// last_event_id,deregistered_at}.
function makeBusDb({ events = [], cursorAt = null, plugin = "wicked-brain" } = {}) {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE events (event_id INTEGER PRIMARY KEY);
    CREATE TABLE subscriptions (
      subscription_id TEXT, plugin TEXT, role TEXT,
      event_type_filter TEXT, registered_at INTEGER, deregistered_at INTEGER
    );
    CREATE TABLE cursors (
      cursor_id TEXT, subscription_id TEXT, last_event_id INTEGER, deregistered_at INTEGER
    );
  `);
  const insE = db.prepare("INSERT INTO events (event_id) VALUES (?)");
  for (const id of events) insE.run(id);
  if (cursorAt !== null) {
    db.prepare("INSERT INTO subscriptions VALUES (?,?,?,?,?,?)").run(
      "sub1", plugin, "subscriber", "wicked.fact.extracted", 1, null,
    );
    db.prepare("INSERT INTO cursors VALUES (?,?,?,?)").run("cur1", "sub1", cursorAt, null);
  }
  return db;
}

const cursorOf = (db) =>
  db.prepare("SELECT last_event_id FROM cursors WHERE cursor_id='cur1'").get().last_event_id;

test("repositions a cursor behind the TTL window to just before the oldest survivor", () => {
  const db = makeBusDb({ events: [100, 150, 200], cursorAt: 5 });
  try {
    // oldest = 100 → reposition to 99 so the surviving events (100,150,200) are
    // still replayed rather than skipped.
    const r = fastForwardStaleCursor(db, "wicked-brain", "wicked.fact.extracted");
    assert.deepEqual(r, { from: 5, to: 99 });
    assert.equal(cursorOf(db), 99);
  } finally {
    db.close();
  }
});

test("no-op when the cursor is within the window", () => {
  const db = makeBusDb({ events: [100, 150, 200], cursorAt: 150 });
  try {
    assert.equal(fastForwardStaleCursor(db, "wicked-brain", "wicked.fact.extracted"), null);
    assert.equal(cursorOf(db), 150);
  } finally {
    db.close();
  }
});

test("treats exactly oldest-1 as caught up (matches poll WB-003 boundary)", () => {
  // oldest = 100, so WB-003 fires only when last_event_id < 99.
  const db = makeBusDb({ events: [100, 200], cursorAt: 99 });
  try {
    assert.equal(fastForwardStaleCursor(db, "wicked-brain", "wicked.fact.extracted"), null);
    assert.equal(cursorOf(db), 99);
  } finally {
    db.close();
  }
});

test("no-op when there are no events", () => {
  const db = makeBusDb({ events: [], cursorAt: 5 });
  try {
    assert.equal(fastForwardStaleCursor(db, "wicked-brain", "wicked.fact.extracted"), null);
  } finally {
    db.close();
  }
});

test("no-op when no cursor exists yet (fresh subscriber)", () => {
  const db = makeBusDb({ events: [100, 200] });
  try {
    assert.equal(fastForwardStaleCursor(db, "wicked-brain", "wicked.fact.extracted"), null);
  } finally {
    db.close();
  }
});

test("ignores cursors for a different plugin", () => {
  const db = makeBusDb({ events: [100, 200], cursorAt: 5, plugin: "other-plugin" });
  try {
    assert.equal(fastForwardStaleCursor(db, "wicked-brain", "wicked.fact.extracted"), null);
    assert.equal(cursorOf(db), 5); // untouched
  } finally {
    db.close();
  }
});

test("never throws when the bus schema is missing", () => {
  const db = new Database(":memory:");
  try {
    assert.equal(fastForwardStaleCursor(db, "wicked-brain", "wicked.fact.extracted"), null);
  } finally {
    db.close();
  }
});
