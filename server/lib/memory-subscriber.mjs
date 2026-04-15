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
import { subscribe } from "wicked-bus";
import { getBusDb, isBusAvailable, emitEvent } from "./bus.mjs";
import { promoteFact } from "./memory-promoter.mjs";

/**
 * Start the auto-memorize subscriber.
 * Returns the subscription handle (with .stop()) or null if the bus is unavailable.
 *
 * @param {object} opts
 * @param {string} opts.brainPath  absolute brain directory
 * @param {string} opts.brainId
 * @param {object} opts.db         brain SqliteSearch instance (for findByContentHash)
 */
export function startMemorySubscriber({ brainPath, brainId, db }) {
  if (!isBusAvailable()) return null;
  const busDb = getBusDb();
  if (!busDb) return null;

  const memoryDir = join(brainPath, "memory");

  const sub = subscribe({
    db: busDb,
    plugin: "wicked-brain",
    filter: "wicked.fact.extracted",
    cursor_init: "latest",
    pollIntervalMs: 15000,
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
