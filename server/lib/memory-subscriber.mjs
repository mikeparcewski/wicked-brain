/**
 * Auto-memorize subscriber: bridges wicked-bus fact events into brain memories.
 *
 * Subscribes to `wicked.fact.extracted` via wicked-bus durable cursors,
 * runs each event through the promoter policy, dedups by content hash,
 * and writes a memory file. The brain file watcher picks it up and indexes it.
 *
 * @module lib/memory-subscriber
 */

import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getBusDb, isBusAvailable, emitEvent } from "./bus.mjs";
import { promoteFact } from "./memory-promoter.mjs";

// Subscriber identity on the bus. Used both to register the subscription and to
// locate its cursor for the TTL self-heal — keep them in one place so the two
// can't drift.
const PLUGIN = "wicked-brain";
const FACT_FILTER = "wicked.fact.extracted";

/**
 * Start the auto-memorize subscriber.
 * Returns the subscription handle (with .stop()) or null if the bus is unavailable.
 * Dynamic-imports wicked-bus so the server still loads when the package is absent
 * (matches the graceful-degradation pattern used by bus.mjs).
 *
 * @param {object} opts
 * @param {string} opts.brainPath  absolute brain directory
 * @param {string} opts.brainId
 * @param {object} opts.db         brain SqliteSearch instance (for findByContentHash)
 */
export async function startMemorySubscriber({ brainPath, brainId, db }) {
  if (!isBusAvailable()) return null;
  const busDb = getBusDb();
  if (!busDb) return null;

  let subscribe;
  try {
    ({ subscribe } = await import("wicked-bus"));
  } catch {
    return null;
  }

  const memoryDir = join(brainPath, "memory");

  // Self-heal a cursor stranded behind the bus TTL window (e.g. after a long
  // server outage). The subscriber RESUMES its existing cursor, so cursor_init
  // "latest" does not recover a stale one — poll() would throw WB-003 every
  // cycle and auto-memorize would stall until manually reset. Advance it to the
  // latest event before subscribing.
  const healed = fastForwardStaleCursor(busDb, PLUGIN, FACT_FILTER);
  if (healed) {
    console.error(
      `[memory-subscriber] cursor was behind the TTL window; repositioned ${healed.from} -> ${healed.to} to replay survivors`,
    );
  }

  const sub = subscribe({
    db: busDb,
    plugin: PLUGIN,
    filter: FACT_FILTER,
    cursor_init: "latest",
    pollIntervalMs: 5000,
    maxRetries: 3,
    backoffMs: [1000, 5000, 30000],
    handler: async (event) => {
      const result = promoteFact(event);
      if (result.skip) return;

      // Dedup by stable content_hash
      const existing = db.findByContentHash(result.memory.contentHash);
      if (existing) return;

      const filePath = join(memoryDir, result.memory.safeName);
      if (existsSync(filePath)) return; // filename collision — skip

      const fileContent = renderMemoryFile(result.memory);
      writeFileSync(filePath, fileContent, "utf-8");

      emitEvent("wicked.memory.stored", "brain.memory", {
        path: `memory/${result.memory.safeName}`,
        type: result.memory.frontmatter.type,
        tier: result.memory.frontmatter.tier,
        source: result.memory.frontmatter.source,
        brain_id: brainId,
      });
    },
    onError: (err, event) => {
      console.error(`[memory-subscriber] handler error on event ${event?.event_id}: ${err.message}`);
    },
    onDeadLetter: (event, reason) => {
      console.error(`[memory-subscriber] dead-lettered event ${event?.event_id}: ${reason}`);
      emitEvent("wicked.memory.dead_lettered", "brain.memory", {
        event_id: event?.event_id,
        reason,
        brain_id: brainId,
      });
    },
  });

  return sub;
}

/**
 * Fast-forward a subscriber cursor that has fallen behind the bus TTL window.
 *
 * After a long server outage the durable cursor can sit below the oldest
 * surviving event; wicked-bus poll() then throws WB-003 ("cursor behind the TTL
 * window") every cycle. The subscriber resumes its existing cursor (cursor_init
 * only applies on first registration), so it never recovers on its own. This
 * mirrors poll()'s WB-003 check and, when behind, repositions the cursor to just
 * before the oldest surviving event so the subscriber still replays everything
 * left in the bus (at-least-once) instead of discarding the survivors.
 *
 * No-op when the cursor is current, when there are no events, or when no cursor
 * exists yet (a fresh subscriber initializes at "latest" anyway). Never throws —
 * a self-heal failure must not block server startup.
 *
 * @param {import('better-sqlite3').Database} busDb
 * @param {string} plugin
 * @param {string} filter  event_type_filter the subscriber registered with
 * @returns {{from:number,to:number}|null} the adjustment made, or null for no-op
 */
export function fastForwardStaleCursor(busDb, plugin, filter) {
  try {
    const bounds = busDb
      .prepare("SELECT MIN(event_id) AS min_id FROM events")
      .get();
    if (!bounds || bounds.min_id == null) return null; // no events to be behind of

    const row = busDb
      .prepare(
        `SELECT c.cursor_id AS cursor_id, c.last_event_id AS last_event_id
           FROM subscriptions s
           INNER JOIN cursors c ON c.subscription_id = s.subscription_id
          WHERE s.plugin = ? AND s.role = 'subscriber'
            AND s.event_type_filter = ?
            AND s.deregistered_at IS NULL AND c.deregistered_at IS NULL
          ORDER BY s.registered_at DESC
          LIMIT 1`,
      )
      .get(plugin, filter);
    if (!row) return null; // no existing cursor — fresh subscribe inits at "latest"

    // Mirror wicked-bus poll(): WB-003 fires when last_event_id < oldest - 1.
    // Reposition to oldest-1 (not latest) so the subscriber replays every event
    // that survived the sweep instead of discarding the backlog.
    const target = bounds.min_id - 1;
    if (row.last_event_id < target) {
      busDb
        .prepare("UPDATE cursors SET last_event_id = ? WHERE cursor_id = ?")
        .run(target, row.cursor_id);
      return { from: row.last_event_id, to: target };
    }
    return null;
  } catch {
    return null; // never block startup on the self-heal
  }
}

/**
 * Render a memory descriptor as a markdown file with YAML-ish frontmatter.
 * Minimal serializer — no YAML lib. Matches the format used by wicked-brain:memory.
 */
export function renderMemoryFile(memory) {
  const fm = memory.frontmatter;
  const lines = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (value === null) { lines.push(`${key}: null`); continue; }
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${item}`);
      continue;
    }
    if (typeof value === "object") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        if (Array.isArray(v)) {
          lines.push(`  ${k}: [${v.map(x => JSON.stringify(x)).join(", ")}]`);
        } else {
          lines.push(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
      continue;
    }
    if (typeof value === "string") { lines.push(`${key}: ${JSON.stringify(value)}`); continue; }
    lines.push(`${key}: ${value}`);
  }
  lines.push("---", "", memory.content, "");
  return lines.join("\n");
}
