/**
 * LSP Client — orchestrates language server actions, file sync, and caching.
 * Uses LspManager for server lifecycle and RpcClient for protocol.
 */

import { extname } from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { LspManager } from "./lsp-manager.mjs";
import { resolveServer, loadUserConfig } from "./lsp-servers.mjs";
import {
  normalizeLocations, normalizeSymbols, symbolKindName,
  severityName, buildSymbolChunk, buildDiagnosticsChunk,
} from "./lsp-helpers.mjs";

export class LspClient {
  #brainPath;
  #db;
  #manager;
  #userConfig;
  #diagnostics = new Map(); // filePath → Diagnostic[]
  #diagnosticsSetup = new Set(); // server keys with diagnostics wired

  constructor(brainPath, db, sourcePath) {
    this.#brainPath = brainPath;
    this.#db = db;
    this.#manager = new LspManager(brainPath, sourcePath);
    this.#userConfig = loadUserConfig(brainPath);
  }

  /** Resolve file extension to server config, or throw. */
  #resolveFile(file) {
    const ext = extname(file);
    const server = resolveServer(ext, this.#userConfig);
    if (!server) {
      throw Object.assign(new Error("unsupported_language"), { extension: ext });
    }
    return server;
  }

  /** Ensure server is running and file is opened. */
  async #ensureReady(file) {
    const server = this.#resolveFile(file);
    const entry = await this.#manager.ensureServer(server.key, server);

    // Wire diagnostics once per server
    if (!this.#diagnosticsSetup.has(server.key)) {
      this.#setupDiagnostics(server.key, entry);
      this.#diagnosticsSetup.add(server.key);
    }

    // Open file if not already opened
    if (!entry.openFiles.has(file)) {
      const content = readFileSync(file, "utf-8");
      const uri = pathToFileURL(file).href;
      entry.client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: server.key, version: 1, text: content }
      });
      entry.openFiles.add(file);
    }
    return { entry, server };
  }

  /** Handle file change from FileWatcher. */
  handleFileChange(relPath, absPath, content, eventType) {
    const ext = extname(absPath);
    const serverConfig = resolveServer(ext, this.#userConfig);
    if (!serverConfig) return;

    const entry = this.#manager.getServer(serverConfig.key);
    if (!entry || entry.state !== "ready") return;

    const uri = pathToFileURL(absPath).href;
    if (eventType === "delete") {
      if (entry.openFiles.has(absPath)) {
        entry.client.notify("textDocument/didClose", { textDocument: { uri } });
        entry.openFiles.delete(absPath);
      }
    } else {
      if (entry.openFiles.has(absPath)) {
        entry.client.notify("textDocument/didChange", {
          textDocument: { uri, version: Date.now() },
          contentChanges: [{ text: content }]
        });
      } else {
        entry.client.notify("textDocument/didOpen", {
          textDocument: { uri, languageId: serverConfig.key, version: 1, text: content }
        });
        entry.openFiles.add(absPath);
      }
      entry.client.notify("textDocument/didSave", { textDocument: { uri } });

      // Invalidate cached symbol chunk
      if (this.#db) {
        const safePath = relPath.replace(/[/\\]/g, "_").replace(/\./g, "_");
        this.#db.remove(`lsp/symbols/${safePath}`);
      }
    }
  }

  // --- Diagnostics Setup ---

  #setupDiagnostics(key, entry) {
    entry.client.onNotification("textDocument/publishDiagnostics", ({ uri, diagnostics }) => {
      const filePath = decodeURIComponent(uri.replace("file://", ""));
      this.#diagnostics.set(filePath, diagnostics.map(d => ({
        line: d.range?.start?.line ?? 0,
        col: d.range?.start?.character ?? 0,
        endLine: d.range?.end?.line ?? 0,
        endCol: d.range?.end?.character ?? 0,
        severity: severityName(d.severity),
        message: d.message,
        source: d.source || key,
      })));

      if (this.#db) {
        const diags = this.#diagnostics.get(filePath);
        const safePath = filePath.replace(/[/\\]/g, "_").replace(/\./g, "_");
        const cacheId = `lsp/diagnostics/${safePath}`;
        if (diags.length === 0) {
          this.#db.remove(cacheId);
        } else {
          const content = buildDiagnosticsChunk(filePath, key, diags);
          this.#db.index({ id: cacheId, path: cacheId, content, brain_id: "lsp" });
        }
      }
    });
  }

  // --- Actions ---

  health() {
    return this.#manager.health();
  }

  async symbols({ file }) {
    const safePath = file.replace(/[/\\]/g, "_").replace(/\./g, "_");
    const cacheId = `lsp/symbols/${safePath}`;

    const { entry, server } = await this.#ensureReady(file);
    const uri = pathToFileURL(file).href;
    const result = await entry.client.request("textDocument/documentSymbol", {
      textDocument: { uri }
    });

    const symbols = normalizeSymbols(result || []);

    if (this.#db && symbols.length > 0) {
      const content = buildSymbolChunk(file, server.key, symbols);
      this.#db.index({ id: cacheId, path: cacheId, content, brain_id: "lsp" });
    }

    return { symbols, cached: true };
  }

  async definition({ file, line, col }) {
    const { entry } = await this.#ensureReady(file);
    const result = await entry.client.request("textDocument/definition", {
      textDocument: { uri: pathToFileURL(file).href },
      position: { line, character: col }
    });
    return { locations: normalizeLocations(result) };
  }

  async references({ file, line, col }) {
    const { entry } = await this.#ensureReady(file);
    const result = await entry.client.request("textDocument/references", {
      textDocument: { uri: pathToFileURL(file).href },
      position: { line, character: col },
      context: { includeDeclaration: true }
    });
    return { locations: normalizeLocations(result) };
  }

  async hover({ file, line, col }) {
    const { entry, server } = await this.#ensureReady(file);
    const result = await entry.client.request("textDocument/hover", {
      textDocument: { uri: pathToFileURL(file).href },
      position: { line, character: col }
    });
    if (!result || !result.contents) return { content: null, language: server.key };
    const content = typeof result.contents === "string"
      ? result.contents
      : result.contents.value || JSON.stringify(result.contents);
    return { content, language: result.contents.language || server.key };
  }

  async implementation({ file, line, col }) {
    const { entry } = await this.#ensureReady(file);
    const result = await entry.client.request("textDocument/implementation", {
      textDocument: { uri: pathToFileURL(file).href },
      position: { line, character: col }
    });
    return { locations: normalizeLocations(result) };
  }

  async workspaceSymbols({ query }) {
    const health = this.#manager.health();
    const runningKey = Object.keys(health.servers).find(k => health.servers[k].status === "ready");
    if (!runningKey) return { symbols: [], error: "no_running_server" };

    const entry = this.#manager.getServer(runningKey);
    const result = await entry.client.request("workspace/symbol", { query });
    return {
      symbols: (result || []).map(s => ({
        name: s.name,
        kind: symbolKindName(s.kind),
        file: s.location?.uri ? decodeURIComponent(s.location.uri.replace("file://", "")) : null,
        line: s.location?.range?.start?.line ?? 0,
      }))
    };
  }

  async callHierarchyIn({ file, line, col }) {
    const { entry } = await this.#ensureReady(file);
    const uri = pathToFileURL(file).href;
    const items = await entry.client.request("textDocument/prepareCallHierarchy", {
      textDocument: { uri }, position: { line, character: col }
    });
    if (!items || items.length === 0) return { calls: [] };

    const result = await entry.client.request("callHierarchy/incomingCalls", { item: items[0] });
    return {
      calls: (result || []).map(c => ({
        from: {
          name: c.from.name,
          file: c.from.uri ? decodeURIComponent(c.from.uri.replace("file://", "")) : null,
          line: c.from.selectionRange?.start?.line ?? c.from.range?.start?.line ?? 0,
        }
      }))
    };
  }

  async callHierarchyOut({ file, line, col }) {
    const { entry } = await this.#ensureReady(file);
    const uri = pathToFileURL(file).href;
    const items = await entry.client.request("textDocument/prepareCallHierarchy", {
      textDocument: { uri }, position: { line, character: col }
    });
    if (!items || items.length === 0) return { calls: [] };

    const result = await entry.client.request("callHierarchy/outgoingCalls", { item: items[0] });
    return {
      calls: (result || []).map(c => ({
        to: {
          name: c.to.name,
          file: c.to.uri ? decodeURIComponent(c.to.uri.replace("file://", "")) : null,
          line: c.to.selectionRange?.start?.line ?? c.to.range?.start?.line ?? 0,
        }
      }))
    };
  }

  diagnostics({ file } = {}) {
    if (file) {
      const diags = this.#diagnostics.get(file) || [];
      return {
        diagnostics: diags,
        errors: diags.filter(d => d.severity === "error").length,
        warnings: diags.filter(d => d.severity === "warning").length,
        info: diags.filter(d => d.severity === "info").length,
      };
    }
    const all = {};
    let totalErrors = 0, totalWarnings = 0, totalInfo = 0;
    for (const [path, diags] of this.#diagnostics) {
      all[path] = diags;
      totalErrors += diags.filter(d => d.severity === "error").length;
      totalWarnings += diags.filter(d => d.severity === "warning").length;
      totalInfo += diags.filter(d => d.severity === "info").length;
    }
    return { diagnostics: all, errors: totalErrors, warnings: totalWarnings, info: totalInfo };
  }

  async shutdown() {
    await this.#manager.shutdown();
  }
}
