import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadPlugins, findPluginForFile } from "../src/plugins.js";
import type { IngestPlugin } from "../src/plugins.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-plugins-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadPlugins", () => {
  it("returns empty array for no plugin paths", async () => {
    const plugins = await loadPlugins(tmpDir, []);
    expect(plugins).toEqual([]);
  });

  it("loads a valid plugin from a .mjs file", async () => {
    const pluginContent = `
const plugin = {
  name: "test-plugin",
  extensions: [".foo", ".bar"],
  async extract(filePath, opts) {
    return [{ content: "test content", metadata: { source: filePath } }];
  }
};
export default plugin;
`;
    const pluginPath = path.join(tmpDir, "test-plugin.mjs");
    await fsp.writeFile(pluginPath, pluginContent, "utf-8");

    const plugins = await loadPlugins(tmpDir, ["test-plugin.mjs"]);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("test-plugin");
    expect(plugins[0].extensions).toEqual([".foo", ".bar"]);
    expect(typeof plugins[0].extract).toBe("function");
  });

  it("skips nonexistent plugin paths with a warning", async () => {
    const plugins = await loadPlugins(tmpDir, ["nonexistent-plugin.mjs"]);
    expect(plugins).toEqual([]);
  });

  it("skips plugins with missing required fields", async () => {
    const pluginContent = `
export default {
  name: "incomplete",
  // missing extensions and extract
};
`;
    const pluginPath = path.join(tmpDir, "incomplete-plugin.mjs");
    await fsp.writeFile(pluginPath, pluginContent, "utf-8");

    const plugins = await loadPlugins(tmpDir, ["incomplete-plugin.mjs"]);
    expect(plugins).toEqual([]);
  });

  it("loads multiple plugins, skipping failed ones", async () => {
    const goodPlugin = `
export default {
  name: "good-plugin",
  extensions: [".good"],
  async extract(filePath, opts) { return []; }
};
`;
    await fsp.writeFile(path.join(tmpDir, "good.mjs"), goodPlugin, "utf-8");

    const plugins = await loadPlugins(tmpDir, [
      "good.mjs",
      "nonexistent.mjs",
    ]);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("good-plugin");
  });

  it("plugin extract returns chunks correctly", async () => {
    const pluginContent = `
export default {
  name: "chunk-plugin",
  extensions: [".txt"],
  async extract(filePath, opts) {
    return [
      { content: "chunk one", metadata: { index: 0 } },
      { content: "chunk two", metadata: { index: 1 } }
    ];
  }
};
`;
    await fsp.writeFile(
      path.join(tmpDir, "chunk-plugin.mjs"),
      pluginContent,
      "utf-8"
    );

    const plugins = await loadPlugins(tmpDir, ["chunk-plugin.mjs"]);
    expect(plugins).toHaveLength(1);

    const chunks = await plugins[0].extract("/some/file.txt", {
      brainRoot: tmpDir,
    });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe("chunk one");
    expect(chunks[1].metadata.index).toBe(1);
  });
});

describe("findPluginForFile", () => {
  const mockPlugin = (name: string, extensions: string[]): IngestPlugin => ({
    name,
    extensions,
    async extract() {
      return [];
    },
  });

  it("returns null for empty plugin list", () => {
    const result = findPluginForFile([], "file.pdf");
    expect(result).toBeNull();
  });

  it("returns null when no plugin matches the extension", () => {
    const plugin = mockPlugin("pdf-plugin", [".pdf"]);
    const result = findPluginForFile([plugin], "file.docx");
    expect(result).toBeNull();
  });

  it("returns the matching plugin", () => {
    const pdfPlugin = mockPlugin("pdf-plugin", [".pdf"]);
    const docxPlugin = mockPlugin("docx-plugin", [".docx"]);
    const result = findPluginForFile([pdfPlugin, docxPlugin], "report.pdf");
    expect(result).toBe(pdfPlugin);
  });

  it("matches case-insensitively", () => {
    const plugin = mockPlugin("pdf-plugin", [".PDF"]);
    const result = findPluginForFile([plugin], "file.pdf");
    expect(result).toBe(plugin);
  });

  it("returns null for a file with no extension", () => {
    const plugin = mockPlugin("any-plugin", [".txt"]);
    const result = findPluginForFile([plugin], "Makefile");
    expect(result).toBeNull();
  });

  it("returns the first matching plugin when multiple match", () => {
    const first = mockPlugin("first", [".md"]);
    const second = mockPlugin("second", [".md"]);
    const result = findPluginForFile([first, second], "doc.md");
    expect(result).toBe(first);
  });
});
