# Upstream patch: re-export wicked-bus 2.0.0 v2 surface

**Target**: [wicked-bus](https://github.com/mikeparcewski/wicked-bus) at v2.0.0
**Filed by**: wicked-brain (downstream consumer)
**Status**: draft — not yet filed

## Problem

wicked-bus 2.0.0 ships substantial v2 internals — push delivery daemon,
content-addressable store for large payloads, JSON Schema registry,
AsyncLocalStorage causality propagation, and a tiered-storage sweep with
monthly archive buckets. None of these modules are reachable from a
library consumer because:

1. `lib/index.js` exports are byte-for-byte identical to 1.1.0 (verified
   2026-04-28 via `npm pack` diff). The new modules are not re-exported.
2. `package.json` `exports` map only allows the package root (`wicked-bus`)
   and `wicked-bus/cli`. Deep imports such as `wicked-bus/lib/causality.js`
   are blocked by Node's strict ESM resolution.

The CJS shim at `lib/index.cjs` is a thin proxy over `./index.js`, so it
inherits the same surface.

Net effect: consumers who upgrade from 1.1.0 to 2.0.0 get bug fixes only.
The headline 2.0.0 features can be exercised through the `wicked-bus` CLI
binary (which has internal access) but not from embedder code such as
wicked-brain's `server/lib/bus.mjs`.

## Proposed change

Extend `lib/index.js` to re-export the v2 surface that downstream embedders
need. Keep the existing exports unchanged so 1.x consumers see no break.

```diff
--- a/lib/index.js
+++ b/lib/index.js
@@ -12,4 +12,17 @@ export { startSweep, runSweep } from './sweep.js';
 export { listDeadLetters, replayDeadLetter, dropDeadLetter } from './dlq.js';
 export { subscribe } from './subscribe.js';
 export { WBError, ERROR_CODES, EXIT_CODES } from './errors.js';
+
+// v2 surface — opt-in features that require the daemon, schema registry,
+// or tiered storage to be running. Each re-export is safe to call when
+// the underlying feature is disabled (functions either no-op or surface
+// a clear WBError).
+export { subscribePushOrPoll } from './subscribe-push-or-poll.js';
+export { probeDaemon, connectAsSubscriber } from './daemon-client.js';
+export { notifyEmit } from './daemon-notify.js';
+export { withContext, currentContext } from './causality.js';
+export { getSchema, applyRegistryPolicy } from './schema-registry.js';
+export { runSweepV2 } from './sweep-v2.js';
+export { pollResolve } from './query.js';
+export { casDir, casPathFor, casRead, casWrite, gcCas } from './cas.js';
```

The `package.json` `exports` map does **not** need to change — these are
all re-exports from the package root.

## Why this matters for wicked-brain (representative consumer)

| 2.0.0 feature | Use case in wicked-brain | Blocked today |
|---|---|---|
| `subscribePushOrPoll` | Replace 5s poll in `memory-subscriber.mjs` with push delivery — sub-second fact-to-memory latency | Yes |
| `withContext` | Propagate `correlation_id` from a search request through chunk-indexed → memory-stored events | Yes |
| `getSchema` / registry | Validate `wicked.fact.extracted` payloads at the producer instead of failing inside the handler | Yes |
| `runSweepV2` | Operationally cleaner — keeps `bus.db` small, archives old events to monthly buckets | Yes |
| `notifyEmit` | Lower-level integration where `subscribe()` is too high-level | Yes |
| `casDir` / CAS helpers | Future: emit large chunk content as events without bloating `bus.db` | Yes |

## Backwards compatibility

- No existing exports are changed or removed.
- New exports are additive; consumers on 1.x stay on the same surface.
- The daemon/schema features remain opt-in — re-exporting them does not
  start a daemon or enforce a schema. Enablement is still via config or
  CLI invocation.

## Suggested PR title

> feat(exports): re-export v2 surface (push subscriber, causality, schema registry, CAS, sweep-v2)

## Suggested labels

`enhancement`, `api`, `v2`

## Verification steps for reviewer

```bash
# In wicked-bus repo:
npm pack
# In a fresh consumer:
npm install /path/to/wicked-bus-2.x.y.tgz
node -e "
  import { subscribePushOrPoll, withContext, runSweepV2 } from 'wicked-bus';
  console.log('exports OK', { subscribePushOrPoll, withContext, runSweepV2 });
"
```

Should print three function references with no `undefined` and no
ESM-resolution error.
