import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { EventLog } from "../src/event-log.js";
import { MetaBuilder } from "../src/meta-builder.js";

let tmpDir: string;
let metaDir: string;
let log: EventLog;
let builder: MetaBuilder;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-meta-"));
  metaDir = path.join(tmpDir, "_meta");
  const logPath = path.join(tmpDir, "_ops", "log.jsonl");
  log = new EventLog(logPath);
  builder = new MetaBuilder(metaDir, log);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("MetaBuilder", () => {
  describe("manifest.json", () => {
    it("builds manifest from write events with _meta/manifest: prefix", async () => {
      const now = new Date().toISOString();
      await log.append({
        ts: now,
        op: "write",
        path: "_meta/manifest:raw/doc.md",
        author: "ingest",
        content_hash: "abc123",
        source_chunks: ["chunks/extracted/doc/chunk-000.md"],
      });

      await builder.rebuild();

      const manifest = JSON.parse(
        await fsp.readFile(path.join(metaDir, "manifest.json"), "utf-8")
      );

      expect(manifest["raw/doc.md"]).toBeDefined();
      expect(manifest["raw/doc.md"].hash).toBe("abc123");
      expect(manifest["raw/doc.md"].chunks).toEqual([
        "chunks/extracted/doc/chunk-000.md",
      ]);
    });

    it("does not include non-manifest write events", async () => {
      const now = new Date().toISOString();
      await log.append({
        ts: now,
        op: "write",
        path: "chunks/extracted/doc/chunk-000.md",
        author: "ingest",
        content_hash: "xyz",
      });

      await builder.rebuild();

      const manifest = JSON.parse(
        await fsp.readFile(path.join(metaDir, "manifest.json"), "utf-8")
      );

      expect(Object.keys(manifest)).toHaveLength(0);
    });
  });

  describe("tags.json", () => {
    it("builds tags from tag events", async () => {
      const now = new Date().toISOString();
      await log.append({
        ts: now,
        op: "tag",
        path: "wiki/article1.md",
        author: "user",
        tags: ["important", "tech"],
      });
      await log.append({
        ts: now,
        op: "tag",
        path: "wiki/article2.md",
        author: "user",
        tags: ["important"],
      });

      await builder.rebuild();

      const tags = JSON.parse(
        await fsp.readFile(path.join(metaDir, "tags.json"), "utf-8")
      );

      expect(tags["important"]).toContain("wiki/article1.md");
      expect(tags["important"]).toContain("wiki/article2.md");
      expect(tags["tech"]).toContain("wiki/article1.md");
    });

    it("deduplicates paths per tag", async () => {
      const now = new Date().toISOString();
      await log.append({
        ts: now,
        op: "tag",
        path: "wiki/article1.md",
        author: "user",
        tags: ["important"],
      });
      await log.append({
        ts: now,
        op: "tag",
        path: "wiki/article1.md",
        author: "user",
        tags: ["important"],
      });

      await builder.rebuild();

      const tags = JSON.parse(
        await fsp.readFile(path.join(metaDir, "tags.json"), "utf-8")
      );

      expect(tags["important"]).toHaveLength(1);
    });
  });

  describe("links.json", () => {
    it("builds forward and backward links from link events", async () => {
      const now = new Date().toISOString();
      await log.append({
        ts: now,
        op: "link",
        from: "wiki/source.md",
        to: "wiki/target.md",
        link_type: "reference",
        author: "user",
      });

      await builder.rebuild();

      const links = JSON.parse(
        await fsp.readFile(path.join(metaDir, "links.json"), "utf-8")
      );

      expect(links.forward["wiki/source.md"]).toContain("wiki/target.md");
      expect(links.backward["wiki/target.md"]).toContain("wiki/source.md");
    });

    it("builds empty link maps when no link events", async () => {
      await builder.rebuild();

      const links = JSON.parse(
        await fsp.readFile(path.join(metaDir, "links.json"), "utf-8")
      );

      expect(links.forward).toEqual({});
      expect(links.backward).toEqual({});
    });
  });

  describe("orientation.md", () => {
    it("builds orientation.md with chunk and wiki counts", async () => {
      const now = new Date().toISOString();
      await log.append({
        ts: now,
        op: "write",
        path: "chunks/extracted/doc/chunk-000.md",
        author: "ingest",
        content_hash: "aaa",
      });
      await log.append({
        ts: now,
        op: "write",
        path: "chunks/extracted/doc/chunk-001.md",
        author: "ingest",
        content_hash: "bbb",
      });
      await log.append({
        ts: now,
        op: "write",
        path: "wiki/article.md",
        author: "user",
        content_hash: "ccc",
      });

      await builder.rebuild();

      const orientation = await fsp.readFile(
        path.join(metaDir, "orientation.md"),
        "utf-8"
      );

      expect(orientation).toContain("Chunks**: 2");
      expect(orientation).toContain("Wiki articles**: 1");
    });

    it("subtracts deleted paths from counts", async () => {
      const now = new Date().toISOString();
      await log.append({
        ts: now,
        op: "write",
        path: "chunks/extracted/doc/chunk-000.md",
        author: "ingest",
        content_hash: "aaa",
      });
      await log.append({
        ts: new Date(Date.now() + 1).toISOString(),
        op: "delete",
        path: "chunks/extracted/doc/chunk-000.md",
        author: "ingest",
      });

      await builder.rebuild();

      const orientation = await fsp.readFile(
        path.join(metaDir, "orientation.md"),
        "utf-8"
      );

      expect(orientation).toContain("Chunks**: 0");
    });
  });

  describe("recent.md", () => {
    it("builds recent.md with events from last 7 days", async () => {
      const now = new Date().toISOString();
      await log.append({
        ts: now,
        op: "write",
        path: "wiki/recent.md",
        author: "user",
        content_hash: "xyz",
      });

      await builder.rebuild();

      const recent = await fsp.readFile(
        path.join(metaDir, "recent.md"),
        "utf-8"
      );

      expect(recent).toContain("Recent Activity");
      expect(recent).toContain("wiki/recent.md");
    });
  });
});
