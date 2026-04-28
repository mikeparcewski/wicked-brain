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
const PLUGIN = "wicked-brain";

let busEmit = null;
let busListDeadLetters = null;
let busReplayDeadLetter = null;
let busDropDeadLetter = null;
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
    busListDeadLetters = bus.listDeadLetters;
    busReplayDeadLetter = bus.replayDeadLetter;
    busDropDeadLetter = bus.dropDeadLetter;
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

/**
 * List dead-lettered events scoped to wicked-brain's plugin.
 * Returns [] when the bus is unavailable so callers don't have to branch.
 *
 * @param {object} [opts]
 * @param {string} [opts.cursor_id] filter to one cursor
 * @param {number} [opts.limit=100]
 * @returns {Array}
 */
export function listBusDeadLetters(opts = {}) {
  if (!available || !busListDeadLetters) return [];
  try {
    return busListDeadLetters(busDb, { plugin: PLUGIN, ...opts });
  } catch {
    return [];
  }
}

/**
 * Mark a dead letter for replay. The managed subscriber drains pending
 * replays before each poll cycle, so a successful return means the request
 * is queued, not that the event has re-delivered yet.
 *
 * @param {object} args
 * @param {string} args.cursor_id
 * @param {string} args.dl_id
 * @returns {{ ok: boolean, error?: string }}
 */
export function replayBusDeadLetter({ cursor_id, dl_id } = {}) {
  if (!available || !busReplayDeadLetter) {
    return { ok: false, error: "bus unavailable" };
  }
  if (!cursor_id || !dl_id) {
    return { ok: false, error: "cursor_id and dl_id required" };
  }
  try {
    busReplayDeadLetter(busDb, { cursor_id, dl_id });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Drop (delete) a dead letter row. Use when an event is no longer relevant
 * — replay would just dead-letter again.
 *
 * @param {object} args
 * @param {string} args.cursor_id
 * @param {string} args.dl_id
 * @returns {{ ok: boolean, error?: string }}
 */
export function dropBusDeadLetter({ cursor_id, dl_id } = {}) {
  if (!available || !busDropDeadLetter) {
    return { ok: false, error: "bus unavailable" };
  }
  if (!cursor_id || !dl_id) {
    return { ok: false, error: "cursor_id and dl_id required" };
  }
  try {
    busDropDeadLetter(busDb, { cursor_id, dl_id });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
