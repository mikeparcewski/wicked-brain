#!/usr/bin/env node
import { createServer } from "node:http";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv, pid, exit } from "node:process";
import { FileWatcher } from "../lib/file-watcher.mjs";
import { SqliteSearch } from "../lib/sqlite-search.mjs";
import { LspClient } from "../lib/lsp-client.mjs";

// Parse args
const args = argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const brainPath = resolve(getArg("brain") || ".");
const port = parseInt(getArg("port") || "4242", 10);
const configPath = join(brainPath, "brain.json");

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

// LSP client
const lsp = new LspClient(brainPath, db);

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down...");
  try { unlinkSync(pidPath); } catch {}
  watcher.stop();
  await lsp.shutdown();
  db.close();
  exit(0);
}
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());

// Action dispatch
const actions = {
  health: () => db.health(),
  search: (p) => db.search(p),
  federated_search: (p) => db.federatedSearch(p),
  index: (p) => db.index(p),
  remove: (p) => db.remove(p.id),
  reindex: (p) => db.reindex(p.docs),
  backlinks: (p) => ({ links: db.backlinks(p.id) }),
  forward_links: (p) => ({ links: db.forwardLinks(p.id) }),
  stats: () => db.stats(),
  candidates: (p) => ({ candidates: db.candidates(p) }),
  access_log: (p) => db.accessLog(p.id),
  recent_memories: (p) => ({ memories: db.recentMemories(p) }),
  contradictions: () => ({ links: db.contradictions() }),
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

// Read project directories from config
let projects = [];
try {
  const metaConfig = JSON.parse(readFileSync(join(brainPath, "_meta", "config.json"), "utf-8"));
  projects = metaConfig.projects || [];
} catch {}

const watcher = new FileWatcher(brainPath, db, brainId, projects);

// Wire file changes to LSP client for didOpen/didChange/didClose
watcher.onFileChange((relPath, absPath, content, eventType) => {
  lsp.handleFileChange(relPath, absPath, content, eventType);
});

server.listen(port, () => {
  console.log(`wicked-brain-server running on port ${port} (brain: ${brainId}, pid: ${pid})`);
  watcher.start();
});
