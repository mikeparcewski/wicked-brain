#!/usr/bin/env node
// Fake wicked-estate-mcp for tests: speaks just enough newline-delimited
// JSON-RPC 2.0 to stand in for the real stdio binary.
//
// Behavior mirrors the real server's contract (estate PR #95):
//   - initialize / notifications/initialized handshake
//   - memory.capture   → {"memory_id": "mem::<n>"}          (fresh id per call)
//   - knowledge.write  → {"node_id": "<kclass>::<n>"}       (fresh id per call)
//   - knowledge.relate → verifies both endpoints were previously minted, else
//                        an isError:true tool result (dangling endpoint);
//                        upserts on (src, tgt, rel) — re-relating the same
//                        triple returns the same edge and does not duplicate.
//   - content with "FAIL_ME" → isError:true (lets tests exercise the
//     content-failure path)
//
// Every tools/call is appended as JSON to the file named by $FAKE_MCP_LOG so
// tests can assert exact arguments (e.g. that confidence 0.5 was sent
// EXPLICITLY rather than left to estate's 0.8 default).

import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

// A bare `node --test` run globs EVERYTHING under test/ — including this
// fixture — and executing the stdin loop there would hang the suite forever.
// Only serve when explicitly asked to (the tests spawn `node <this> --serve`).
if (!process.argv.includes("--serve")) {
  process.exit(0);
}

const logFile = process.env.FAKE_MCP_LOG || null;
let seq = 0;
const mintedIds = new Set();
const edges = new Set();

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function mcpResult(id, payload) {
  out({
    jsonrpc: "2.0",
    id,
    result: { content: [{ type: "text", text: JSON.stringify(payload) }], isError: false },
  });
}

function mcpToolError(id, message) {
  out({
    jsonrpc: "2.0",
    id,
    result: { content: [{ type: "text", text: message }], isError: true },
  });
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    out({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    return;
  }
  const { id, method, params } = req;

  if (method === "initialize") {
    out({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fake-estate", version: "0" },
      },
    });
    return;
  }
  if (method === "notifications/initialized") return; // notification — no output

  if (method !== "tools/call") {
    if (id !== undefined && id !== null) {
      out({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
    return;
  }

  const tool = params?.name ?? "";
  const args = params?.arguments ?? {};
  if (logFile) appendFileSync(logFile, JSON.stringify({ tool, args }) + "\n", "utf-8");

  switch (tool) {
    case "memory.capture": {
      if (!args.content) {
        out({ jsonrpc: "2.0", id, error: { code: -32602, message: "content required" } });
        return;
      }
      if (String(args.content).includes("FAIL_ME")) {
        mcpToolError(id, "capture rejected by fake server");
        return;
      }
      const mid = `mem::${++seq}`;
      mintedIds.add(mid);
      mcpResult(id, { memory_id: mid });
      return;
    }
    case "knowledge.write": {
      if (!args.content) {
        out({ jsonrpc: "2.0", id, error: { code: -32602, message: "content required" } });
        return;
      }
      if (String(args.content).includes("FAIL_ME")) {
        mcpToolError(id, "write rejected by fake server");
        return;
      }
      const cls = args.class === "concept" ? "kconcept" : "kchunk";
      const nid = `${cls}::${++seq}`;
      mintedIds.add(nid);
      mcpResult(id, { node_id: nid });
      return;
    }
    case "knowledge.relate": {
      const { src, tgt, rel } = args;
      if (!src || !tgt || !rel) {
        out({ jsonrpc: "2.0", id, error: { code: -32602, message: "src, tgt, rel all required" } });
        return;
      }
      // Mirror the real contract: memory-store ids are NOT live knowledge
      // nodes — relate fails dangling on them, as do never-minted ids.
      if (!mintedIds.has(src) || src.startsWith("mem::")) {
        mcpToolError(id, `relate: source ${src} has no live node`);
        return;
      }
      if (!mintedIds.has(tgt) || tgt.startsWith("mem::")) {
        mcpToolError(id, `relate: target ${tgt} has no live node`);
        return;
      }
      edges.add(JSON.stringify([src, tgt, rel])); // upsert semantics
      mcpResult(id, { edge_id: `${src}--${rel}-->${tgt}` });
      return;
    }
    default:
      out({ jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool: ${tool}` } });
  }
});
