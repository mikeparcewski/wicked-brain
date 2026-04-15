/**
 * wicked-bus integration for wicked-brain-server.
 *
 * Emits events to the bus when the bus is available.
 * Degrades gracefully — if wicked-bus is not installed or the DB
 * is unreachable, events are silently dropped.
 *
 * @module lib/bus
 */

const DOMAIN = "wicked-brain";

let busEmit = null;
let busDb = null;
let busConfig = null;
let available = false;

/**
 * Try to load wicked-bus at startup. If unavailable, all emit calls are no-ops.
 */
async function init() {
  try {
    const bus = await import("wicked-bus");
    busConfig = bus.loadConfig();
    const dbPath = bus.resolveDbPath();
    busDb = bus.openDb(dbPath);
    busEmit = bus.emit;
    available = true;
  } catch {
    // wicked-bus not installed or not initialized — degrade silently
    available = false;
  }
}

// Initialize on module load (non-blocking)
const ready = init();

/**
 * Emit an event to the bus.
 * Fire-and-forget — never throws, never blocks the caller.
 *
 * @param {string} eventType - e.g. "wicked.chunk.indexed"
 * @param {string} subdomain - e.g. "brain.chunk"
 * @param {object} payload - event-specific data
 */
export function emitEvent(eventType, subdomain, payload) {
  if (!available) return;
  try {
    busEmit(busDb, busConfig, {
      event_type: eventType,
      domain: DOMAIN,
      subdomain,
      payload,
    });
  } catch {
    // Bus emit failed — degrade silently
  }
}

/**
 * Whether the bus is available.
 * @returns {boolean}
 */
export function busAvailable() {
  return available;
}

/** Alias for busAvailable() — preferred name going forward. */
export function isBusAvailable() {
  return available;
}

/** Returns the open bus DB handle, or null if unavailable. Reuses the connection opened at init. */
export function getBusDb() {
  return available ? busDb : null;
}

/**
 * Wait for bus initialization to complete.
 * Only needed if you must know availability before the first emit.
 */
export async function waitForBus() {
  await ready;
  return available;
}
