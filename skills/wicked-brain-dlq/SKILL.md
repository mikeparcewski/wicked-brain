---
name: wicked-brain:dlq
description: |
  Inspect, replay, or drop dead-lettered events from wicked-brain's bus
  subscriber. The auto-memorize subscriber consumes `wicked.fact.extracted`
  and dead-letters events that exhaust their retry budget. Without this
  skill, those events sit untouched forever — a fixable handler bug
  silently loses every fact.

  Use when: "show DLQ", "replay dead letters", "what events failed",
  "drop dead letter", "memory subscriber DLQ", "stuck fact events".
---

# wicked-brain:dlq

List, replay, and drop dead-lettered events held by wicked-bus on behalf of
the wicked-brain auto-memorize subscriber.

## Cross-Platform Notes

Uses `npx wicked-brain-call` for all server interaction. Cross-platform on
macOS, Linux, and Windows.

- Paths use forward slashes
- No Unix-only shell features

## Config

Brain discovery + server lifecycle are handled by `wicked-brain-call`. The
server bridges to the wicked-bus DB it opened at startup, so DLQ rows are
always scoped to `plugin: "wicked-brain"`.

If the bus is unavailable (not installed, or the DB is unreachable), `list`
returns an empty array and `replay` / `drop` return `{ ok: false, error: "bus unavailable" }`.

## Parameters

- **mode** (required): `list`, `replay`, or `drop`
- **cursor_id** (list: optional filter; replay/drop: required): subscriber cursor id
- **dl_id** (replay/drop: required): dead-letter row id, returned by `list`
- **limit** (list, optional, default 100): max rows to return

## List mode

```bash
npx wicked-brain-call dlq_list --param limit=50
```

Optional cursor scoping:
```bash
npx wicked-brain-call dlq_list --param cursor_id={cursor_id}
```

Returns `{ dead_letters: [...] }`. Each row has `dl_id`, `cursor_id`,
`event_type`, `domain`, `subdomain`, `payload`, `dead_lettered_at`,
`attempts`, `last_error`.

The `payload` field is denormalized at DLQ time — the originating row in
`events` may have been swept by the 24h `dedup_expires_at`, so it reflects
the event as it failed, not current state.

## Replay mode

```bash
npx wicked-brain-call dlq_replay \
  --param cursor_id={cursor_id} \
  --param dl_id={dl_id}
```

Marks the row for replay. The managed subscriber drains pending replays
before each poll cycle (5s by default), so a successful return means
*queued*, not *delivered*. If the handler still rejects the event, it
will dead-letter again with an incremented attempt count.

Replay is for recovery — not transparent retry. The original
`idempotency_key` may already have been swept (24h TTL), so a re-emission
inside the handler will not be deduped against the original event.

## Drop mode

```bash
npx wicked-brain-call dlq_drop \
  --param cursor_id={cursor_id} \
  --param dl_id={dl_id}
```

Permanently deletes the DLQ row. Use when replay would just dead-letter
again — for example, when the source event was malformed and there's no
fix path.

## Workflow

A typical recovery loop:

1. `list` to see what's pending and inspect `last_error`.
2. Fix the handler (`server/lib/memory-promoter.mjs` or `memory-subscriber.mjs`).
3. Restart the server so the fix takes effect.
4. `replay` each row.
5. `list` again to confirm the queue is empty.
6. `drop` any rows that can't be fixed.

## Reporting

Always surface `dl_id`, `cursor_id`, `event_type`, `attempts`, and
`last_error` for each row so the operator has enough context to choose
between replay and drop.
