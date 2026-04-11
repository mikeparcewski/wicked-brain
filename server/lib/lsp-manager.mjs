/**
 * Manages language server processes — spawn, health check, crash recovery, shutdown.
 */

import { spawn, execFileSync } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { RpcClient } from "./lsp-protocol.mjs";

const MAX_RETRIES = 3;
const RETRY_RESET_MS = 300000; // 5 minutes

export class LspManager {
  #brainPath;
  #sourcePath;
  #servers = new Map(); // key → { process, client, state, retries, startedAt, openFiles }

  /**
   * @param {string} brainPath - Brain storage directory (used as fallback workspace root)
   * @param {string} [sourcePath] - Actual source project root with tsconfig.json, go.mod, etc.
   *   When provided, LSP servers are initialized with this as rootUri so they can find
   *   project configuration files. Falls back to brainPath if not provided.
   */
  constructor(brainPath, sourcePath) {
    this.#brainPath = brainPath;
    this.#sourcePath = sourcePath || brainPath;
  }

  /**
   * Check if a command exists in PATH.
   * Returns the resolved path or null.
   */
  findCommand(command) {
    try {
      const cmd = platform() === "win32" ? "where" : "which";
      const result = execFileSync(cmd, [command], {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.trim().split("\n")[0];
    } catch {
      return null;
    }
  }

  /**
   * Get or spawn a language server for the given key and config.
   * Returns { client, state } or throws.
   */
  async ensureServer(key, serverConfig) {
    const existing = this.#servers.get(key);
    if (existing && existing.state === "ready") return existing;
    if (existing && existing.state === "starting") return existing;

    // Check retries
    if (existing && existing.state === "crashed") {
      if (existing.retries >= MAX_RETRIES) {
        throw new Error("language_server_crashed");
      }
      // Reset retries after RETRY_RESET_MS
      if (Date.now() - existing.startedAt > RETRY_RESET_MS) {
        existing.retries = 0;
      }
    }

    return this.#spawn(key, serverConfig);
  }

  async #spawn(key, config) {
    const commandPath = this.findCommand(config.command);
    if (!commandPath) {
      throw Object.assign(new Error("language_server_not_found"), {
        language: key,
        install: config.install,
      });
    }

    const proc = spawn(config.command, config.args || [], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.#sourcePath,
    });

    const client = new RpcClient(proc.stdin, proc.stdout);
    const prevEntry = this.#servers.get(key);
    const entry = {
      process: proc,
      client,
      state: "starting",
      retries: (prevEntry?.retries || 0) + (prevEntry?.state === "crashed" ? 1 : 0),
      startedAt: Date.now(),
      openFiles: new Set(),
    };
    this.#servers.set(key, entry);

    // Handle crash
    proc.on("exit", (code) => {
      if (entry.state !== "stopped") {
        console.error(`[lsp] ${key} server exited unexpectedly (code ${code})`);
        entry.state = "crashed";
        client.dispose();
      }
    });

    // Swallow stderr to prevent unhandled pipe errors
    proc.stderr.on("data", () => {});

    // Initialize
    try {
      const rootUri = pathToFileURL(resolve(this.#sourcePath)).href;
      await client.request("initialize", {
        processId: process.pid,
        capabilities: {},
        rootUri,
        workspaceFolders: [{ uri: rootUri, name: "project" }],
      });
      client.notify("initialized", {});
      entry.state = "ready";
      console.log(`[lsp] ${key} server ready (pid ${proc.pid})`);
      return entry;
    } catch (err) {
      entry.state = "crashed";
      proc.kill();
      throw err;
    }
  }

  /** Get server entry for a key (may be null or any state). */
  getServer(key) {
    return this.#servers.get(key) || null;
  }

  /** Get health status for all servers. */
  health() {
    const status = {};
    for (const [key, entry] of this.#servers) {
      status[key] = {
        status: entry.state,
        pid: entry.process.pid,
        uptime: Date.now() - entry.startedAt,
        openFiles: entry.openFiles.size,
      };
    }
    return { servers: status };
  }

  /** Gracefully shut down all language servers. */
  async shutdown() {
    const promises = [];
    for (const [key, entry] of this.#servers) {
      if (entry.state === "ready" || entry.state === "starting") {
        entry.state = "stopped";
        promises.push(
          entry.client
            .request("shutdown", {}, 5000)
            .then(() => entry.client.notify("exit", {}))
            .catch(() => {})
            .finally(() => {
              entry.client.dispose();
              setTimeout(() => {
                try { entry.process.kill(); } catch {}
              }, 2000);
            })
        );
      }
    }
    await Promise.allSettled(promises);
    this.#servers.clear();
  }
}
