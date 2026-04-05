import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../src/brain.js";
import { BrainPath } from "../src/brain-path.js";
import { ProgressiveLoader } from "../src/progressive.js";

let tmpDir: string;
let brain: BrainHandle;
let loader: ProgressiveLoader;

const sampleMarkdown = `---
title: Test Article
author: Alice
tags: [science, nature]
---
# Introduction

This is the introduction paragraph with some content about animals.
It has multiple sentences to form a complete paragraph.

## Details

Here are the details about the topic.
We can discuss [[related-topic]] and [[another::cross-brain-path]] here.

### Sub-section

A sub-section with more detailed information.

## Conclusion

The conclusion summarizes everything discussed above.
`;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-prog-"));
  const brainDir = path.join(tmpDir, "brain");
  await BrainHandle.init(brainDir, { id: "test-brain", name: "Test" });
  brain = await BrainHandle.open(brainDir);
  loader = new ProgressiveLoader(brain);

  // Write a sample wiki article
  await fsp.mkdir(path.join(brainDir, "wiki"), { recursive: true });
  await fsp.writeFile(
    path.join(brainDir, "wiki", "article.md"),
    sampleMarkdown,
    "utf-8"
  );
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ProgressiveLoader", () => {
  describe("depth 0", () => {
    it("returns only stats (frontmatter, word_count, link_count, no content)", async () => {
      const result = await loader.read(BrainPath.from("wiki/article.md"), 0);

      expect(result.path).toBe("wiki/article.md");
      expect(result.word_count).toBeGreaterThan(0);
      expect(result.link_count).toBe(2);
      expect(result.frontmatter).toBeDefined();
      expect(result.frontmatter!["title"]).toBe("Test Article");
      expect(result.frontmatter!["author"]).toBe("Alice");
      expect(result.summary).toBeUndefined();
      expect(result.sections).toBeUndefined();
      expect(result.content).toBeUndefined();
      expect(result.truncated).toBe(true);
    });

    it("includes related paths from wikilinks", async () => {
      const result = await loader.read(BrainPath.from("wiki/article.md"), 0);

      expect(result.related).toContain("related-topic");
      expect(result.related).toContain("cross-brain-path");
    });
  });

  describe("depth 1", () => {
    it("returns frontmatter + summary + sections, no full content", async () => {
      const result = await loader.read(BrainPath.from("wiki/article.md"), 1);

      expect(result.frontmatter).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary!.length).toBeGreaterThan(0);
      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBeGreaterThan(0);
      expect(result.content).toBeUndefined();
      expect(result.truncated).toBe(true);
    });

    it("includes section headings", async () => {
      const result = await loader.read(BrainPath.from("wiki/article.md"), 1);

      expect(result.sections).toContain("Introduction");
      expect(result.sections).toContain("Details");
      expect(result.sections).toContain("Conclusion");
    });

    it("extracts first paragraph as summary", async () => {
      const result = await loader.read(BrainPath.from("wiki/article.md"), 1);

      // Summary should contain content from first paragraph
      expect(result.summary).toContain("Introduction");
    });
  });

  describe("depth 2", () => {
    it("returns full content", async () => {
      const result = await loader.read(BrainPath.from("wiki/article.md"), 2);

      expect(result.content).toBeDefined();
      expect(result.content!).toContain("Introduction");
      expect(result.content!).toContain("Details");
      expect(result.content!).toContain("Conclusion");
      expect(result.truncated).toBe(false);
    });

    it("includes all depth 1 fields plus content", async () => {
      const result = await loader.read(BrainPath.from("wiki/article.md"), 2);

      expect(result.frontmatter).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.sections).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it("with section filter returns only matching sections", async () => {
      const result = await loader.read(
        BrainPath.from("wiki/article.md"),
        2,
        ["Details"]
      );

      expect(result.content).toBeDefined();
      expect(result.content!).toContain("Details");
      // Should not contain Introduction heading in the filtered content
      // (since only Details section was requested)
      expect(result.truncated).toBe(true);
    });

    it("section filter with no match returns empty content", async () => {
      const result = await loader.read(
        BrainPath.from("wiki/article.md"),
        2,
        ["NonExistentSection"]
      );

      expect(result.content).toBe("");
      expect(result.truncated).toBe(true);
    });
  });
});
