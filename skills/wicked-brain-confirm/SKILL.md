---
name: wicked-brain:confirm
description: |
  Confirm or contradict a brain link, adjusting its confidence score.
  Increases confidence when a link is confirmed by evidence, decreases it
  when contradicted. Tracks evidence_count for audit purposes.

  Use when: "confirm this link", "contradict this connection", "adjust link
  confidence", "mark link as confirmed", "this link is wrong".
---

# wicked-brain:confirm

You adjust the confidence score of a brain link based on user feedback.

## Cross-Platform Notes

Commands in this skill work on macOS, Linux, and Windows. `curl` is available
on Windows 10+ and macOS/Linux — it is used here for API calls.

For the brain path default:
- macOS/Linux: ~/.wicked-brain
- Windows: %USERPROFILE%\.wicked-brain

## Config

Read `_meta/config.json` for brain path and server port.
If it doesn't exist, trigger wicked-brain:init.

## Parameters

- **source_id** (required): the ID of the source document that contains the link
- **target_path** (required): the target path the link points to
- **verdict** (required): `confirm` or `contradict`

## Process

### Step 1: Validate parameters

Ensure `source_id`, `target_path`, and `verdict` are provided.
`verdict` must be exactly `"confirm"` or `"contradict"`.

### Step 2: Submit the verdict to the server

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"confirm_link","params":{"source_id":"{source_id}","target_path":"{target_path}","verdict":"{verdict}"}}'
```

### Step 3: Report the result

If the response contains a `confidence` value, report back to the user:

- What the verdict was (`confirmed` or `contradicted`)
- The updated confidence score (e.g., `0.6`)
- The evidence_count (how many times this link has been evaluated)

Example success response:
```
Link {source_id} → {target_path} {verdict}ed.
Updated confidence: {confidence} (based on {evidence_count} evaluations)
```

If the API returns `null` (link not found), report:
```
No link found from {source_id} to {target_path}.
Use wicked-brain:search to verify the source document ID and target path.
```

If the API returns an error, report the error message.

### Step 4: Log the action

Append an event to `{brain_path}/_meta/log.jsonl`:

```json
{"ts":"{ISO}","op":"link_{verdict}","source_id":"{source_id}","target_path":"{target_path}","confidence":{new_confidence},"evidence_count":{evidence_count},"author":"agent:confirm"}
```

Use your Write tool or append via shell:
- macOS/Linux: `echo '...' >> {brain_path}/_meta/log.jsonl`
- Windows PowerShell: `Add-Content -Path "{brain_path}\_meta\log.jsonl" -Value '...'`
