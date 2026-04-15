#!/usr/bin/env node
import { createServer } from "node:http";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv, pid, exit } from "node:process";
import { FileWatcher } from "../lib/file-watcher.mjs";
import { SqliteSearch } from "../lib/sqlite-search.mjs";
import { LspClient } from "../lib/lsp-client.mjs";
import { emitEvent, waitForBus } from "../lib/bus.mjs";
import { startMemorySubscriber } from "../lib/memory-subscriber.mjs";

// Parse args
const args = argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const brainPath = resolve(getArg("brain") || ".");
const preferredPort = parseInt(getArg("port") || "4242", 10);
const configPath = join(brainPath, "brain.json");
// Source path for LSP workspace root — prefer --source flag, fall back to config, then brainPath
const sourceArgRaw = getArg("source");
const sourceArg = sourceArgRaw ? resolve(sourceArgRaw) : null;

/** Find a free TCP port starting from `start`. */
function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      const probe = createServer();
      probe.once("error", (err) => {
        if (err.code === "EADDRINUSE") tryPort(p + 1);
        else reject(err);
      });
      probe.once("listening", () => {
        probe.close(() => resolve(p));
      });
      probe.listen(p, "127.0.0.1");
    };
    tryPort(start);
  });
}

// Read brain config
let brainId = "unknown";
try {
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  brainId = config.id || "unknown";
} catch {
  console.error(`Warning: Could not read brain.json at ${configPath}`);
}

// Ensure required directories exist
mkdirSync(join(brainPath, "_meta"), { recursive: true });
mkdirSync(join(brainPath, "memory"), { recursive: true });

// Initialize SQLite
const dbPath = join(brainPath, ".brain.db");
const db = new SqliteSearch(dbPath, brainId);

// PID file
const pidPath = join(brainPath, "_meta", "server.pid");
writeFileSync(pidPath, String(pid));

// Read project directories and source path from config (must happen before LspClient)
const metaConfigPath = join(brainPath, "_meta", "config.json");
let projects = [];
let sourcePath = sourceArg;
try {
  const metaConfig = JSON.parse(readFileSync(metaConfigPath, "utf-8"));
  projects = metaConfig.projects || [];
  if (!sourcePath && metaConfig.source_path) sourcePath = resolve(metaConfig.source_path);
} catch {}

// LSP client — pass source path so language servers are rooted at the project, not the brain dir
const lsp = new LspClient(brainPath, db, sourcePath);

// Auto-memorize subscriber handle (set after bus init in server.listen callback)
let memorySubscriber = null;

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down...");
  try { unlinkSync(pidPath); } catch {}
  watcher.stop();
  if (memorySubscriber) {
    try { await memorySubscriber.stop(); } catch {}
  }
  await lsp.shutdown();
  db.close();
  exit(0);
}
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());

// Action dispatch
const actions = {
  health: () => db.health(),
  search: (p) => {
    const result = db.search(p);
    emitEvent("wicked.search.executed", "brain.search", {
      query: p.query, result_count: result.total_matches, brain_id: brainId,
    });
    return result;
  },
  federated_search: (p) => {
    const result = db.federatedSearch(p);
    emitEvent("wicked.search.executed", "brain.search", {
      query: p.query, federated: true, brain_id: brainId,
    });
    return result;
  },
  index: (p) => {
    db.index(p);
    emitEvent("wicked.chunk.indexed", "brain.chunk", {
      id: p.id, path: p.path, brain_id: brainId,
    });
  },
  remove: (p) => {
    db.remove(p.id);
    emitEvent("wicked.chunk.removed", "brain.chunk", {
      id: p.id, brain_id: brainId,
    });
  },
  reindex: (p) => {
    db.reindex(p.docs);
    emitEvent("wicked.brain.reindexed", "brain", {
      doc_count: p.docs.length, brain_id: brainId,
    });
  },
  backlinks: (p) => ({ links: db.backlinks(p.id) }),
  forward_links: (p) => ({ links: db.forwardLinks(p.id) }),
  stats: () => db.stats(),
  memory_stats: () => db.memoryStats(),
  candidates: (p) => ({ candidates: db.candidates(p) }),
  symbols: async (p) => {
    // Prefer LSP workspace symbols (structured, language-aware)
    try {
      const lspResult = await lsp.workspaceSymbols({ query: p.name || p.query || "" });
      if (lspResult.symbols && lspResult.symbols.length > 0) {
        return {
          results: lspResult.symbols.map(s => ({
            id: `${s.file}::${s.name}`,
            name: s.name,
            type: s.kind,
            file_path: s.file,
            line_start: s.line,
          })),
          source: "lsp",
        };
      }
    } catch {
      // LSP unavailable or errored (e.g. no tsconfig.json) — fall through to FTS
    }
    // Fall back to FTS-based symbol search
    return { ...db.symbols(p), source: "fts" };
  },
  dependents: (p) => db.dependents(p),
  refs: async (p) => lsp.references(p),
  access_log: (p) => db.accessLog(p.id),
  recent_memories: (p) => ({ memories: db.recentMemories(p) }),
  contradictions: () => ({ links: db.contradictions() }),
  confirm_link: (p) => {
    const result = db.confirmLink(p.source_id, p.target_path, p.verdict);
    emitEvent("wicked.link.confirmed", "brain.link", {
      source_id: p.source_id, target_path: p.target_path, verdict: p.verdict, brain_id: brainId,
    });
    return result;
  },
  link_health: () => db.linkHealth(),
  tag_frequency: () => ({ tags: db.tagFrequency() }),
  search_misses: (p) => ({ misses: db.searchMisses(p) }),
  // LSP actions
  "lsp-health": () => lsp.health(),
  "lsp-symbols": (p) => lsp.symbols(p),
  "lsp-definition": (p) => lsp.definition(p),
  "lsp-references": (p) => lsp.references(p),
  "lsp-hover": (p) => lsp.hover(p),
  "lsp-implementation": (p) => lsp.implementation(p),
  "lsp-workspace-symbols": (p) => lsp.workspaceSymbols(p),
  "lsp-call-hierarchy-in": (p) => lsp.callHierarchyIn(p),
  "lsp-call-hierarchy-out": (p) => lsp.callHierarchyOut(p),
  "lsp-diagnostics": (p) => lsp.diagnostics(p),
};

// HTTP server
const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found. Use POST /api" }));
    return;
  }
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    try {
      const { action, params = {} } = JSON.parse(body);
      const handler = actions[action];
      if (!handler) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
        return;
      }
      // Handle both sync and async results
      const result = handler(params);
      Promise.resolve(result)
        .then(r => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(r ?? { ok: true }));
        })
        .catch(err => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: err.message,
            language: err.language,
            install: err.install,
          }));
        });
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

const watcher = new FileWatcher(brainPath, db, brainId, projects);

// Wire file changes to LSP client for didOpen/didChange/didClose
watcher.onFileChange((relPath, absPath, content, eventType) => {
  lsp.handleFileChange(relPath, absPath, content, eventType);
});

const port = await findFreePort(preferredPort);

// Write actual port back to config so skills can always find the server
try {
  let metaConfig = {};
  try { metaConfig = JSON.parse(readFileSync(metaConfigPath, "utf-8")); } catch {}
  metaConfig.server_port = port;
  writeFileSync(metaConfigPath, JSON.stringify(metaConfig, null, 2) + "\n");
} catch (err) {
  console.error(`Warning: could not write port to config: ${err.message}`);
}

server.listen(port, async () => {
  console.log(`wicked-brain-server running on port ${port} (brain: ${brainId}, pid: ${pid})`);
  watcher.start();
  const busReady = await waitForBus();
  emitEvent("wicked.server.started", "brain.system", {
    brain_id: brainId, port, pid,
  });
  if (busReady) {
    try {
      memorySubscriber = await startMemorySubscriber({ brainPath, brainId, db });
    } catch (err) {
      console.error(`[memory-subscriber] failed to start: ${err.message}`);
    }
  }
});
