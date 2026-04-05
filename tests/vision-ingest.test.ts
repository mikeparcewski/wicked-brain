import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../src/brain.js";
import {
  needsVisionIngest,
  TEXT_EXTENSIONS,
  ingestFile,
} from "../src/ingest.js";
import { getMimeType, VISION_EXTENSIONS } from "../src/vision-ingest.js";

// ---------------------------------------------------------------------------
// needsVisionIngest
// ---------------------------------------------------------------------------

describe("needsVisionIngest", () => {
  it("returns true for PDF", () => {
    expect(needsVisionIngest("pdf")).toBe(true);
  });

  it("returns true for docx", () => {
    expect(needsVisionIngest("docx")).toBe(true);
  });

  it("returns true for pptx", () => {
    expect(needsVisionIngest("pptx")).toBe(true);
  });

  it("returns true for xlsx", () => {
    expect(needsVisionIngest("xlsx")).toBe(true);
  });

  it("returns true for png", () => {
    expect(needsVisionIngest("png")).toBe(true);
  });

  it("returns true for jpg", () => {
    expect(needsVisionIngest("jpg")).toBe(true);
  });

  it("returns true for jpeg", () => {
    expect(needsVisionIngest("jpeg")).toBe(true);
  });

  it("returns true for gif", () => {
    expect(needsVisionIngest("gif")).toBe(true);
  });

  it("returns true for webp", () => {
    expect(needsVisionIngest("webp")).toBe(true);
  });

  it("returns true for svg", () => {
    expect(needsVisionIngest("svg")).toBe(true);
  });

  it("returns false for md", () => {
    expect(needsVisionIngest("md")).toBe(false);
  });

  it("returns false for txt", () => {
    expect(needsVisionIngest("txt")).toBe(false);
  });

  it("returns false for csv", () => {
    expect(needsVisionIngest("csv")).toBe(false);
  });

  it("returns false for html", () => {
    expect(needsVisionIngest("html")).toBe(false);
  });

  it("returns false for json", () => {
    expect(needsVisionIngest("json")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(needsVisionIngest("PDF")).toBe(true);
    expect(needsVisionIngest("DOCX")).toBe(true);
    expect(needsVisionIngest("PNG")).toBe(true);
    expect(needsVisionIngest("MD")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VISION_EXTENSIONS set
// ---------------------------------------------------------------------------

describe("VISION_EXTENSIONS", () => {
  it("contains expected binary formats", () => {
    expect(VISION_EXTENSIONS.has("pdf")).toBe(true);
    expect(VISION_EXTENSIONS.has("docx")).toBe(true);
    expect(VISION_EXTENSIONS.has("pptx")).toBe(true);
    expect(VISION_EXTENSIONS.has("xlsx")).toBe(true);
    expect(VISION_EXTENSIONS.has("png")).toBe(true);
    expect(VISION_EXTENSIONS.has("jpg")).toBe(true);
    expect(VISION_EXTENSIONS.has("jpeg")).toBe(true);
    expect(VISION_EXTENSIONS.has("gif")).toBe(true);
    expect(VISION_EXTENSIONS.has("webp")).toBe(true);
    expect(VISION_EXTENSIONS.has("svg")).toBe(true);
  });

  it("does not contain text formats", () => {
    expect(VISION_EXTENSIONS.has("md")).toBe(false);
    expect(VISION_EXTENSIONS.has("txt")).toBe(false);
    expect(VISION_EXTENSIONS.has("csv")).toBe(false);
    expect(VISION_EXTENSIONS.has("html")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TEXT_EXTENSIONS set
// ---------------------------------------------------------------------------

describe("TEXT_EXTENSIONS", () => {
  it("contains expected text formats", () => {
    expect(TEXT_EXTENSIONS.has("md")).toBe(true);
    expect(TEXT_EXTENSIONS.has("markdown")).toBe(true);
    expect(TEXT_EXTENSIONS.has("txt")).toBe(true);
    expect(TEXT_EXTENSIONS.has("csv")).toBe(true);
    expect(TEXT_EXTENSIONS.has("html")).toBe(true);
    expect(TEXT_EXTENSIONS.has("htm")).toBe(true);
    expect(TEXT_EXTENSIONS.has("json")).toBe(true);
  });

  it("does not contain binary formats", () => {
    expect(TEXT_EXTENSIONS.has("pdf")).toBe(false);
    expect(TEXT_EXTENSIONS.has("docx")).toBe(false);
    expect(TEXT_EXTENSIONS.has("png")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getMimeType
// ---------------------------------------------------------------------------

describe("getMimeType", () => {
  it("maps pdf to application/pdf", () => {
    expect(getMimeType("pdf")).toBe("application/pdf");
  });

  it("maps docx to correct MIME type", () => {
    expect(getMimeType("docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it("maps pptx to correct MIME type", () => {
    expect(getMimeType("pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
  });

  it("maps xlsx to correct MIME type", () => {
    expect(getMimeType("xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("maps png to image/png", () => {
    expect(getMimeType("png")).toBe("image/png");
  });

  it("maps jpg to image/jpeg", () => {
    expect(getMimeType("jpg")).toBe("image/jpeg");
  });

  it("maps jpeg to image/jpeg", () => {
    expect(getMimeType("jpeg")).toBe("image/jpeg");
  });

  it("maps gif to image/gif", () => {
    expect(getMimeType("gif")).toBe("image/gif");
  });

  it("maps webp to image/webp", () => {
    expect(getMimeType("webp")).toBe("image/webp");
  });

  it("maps svg to image/svg+xml", () => {
    expect(getMimeType("svg")).toBe("image/svg+xml");
  });

  it("is case-insensitive", () => {
    expect(getMimeType("PDF")).toBe("application/pdf");
    expect(getMimeType("PNG")).toBe("image/png");
  });

  it("returns fallback for unknown extensions", () => {
    expect(getMimeType("xyz")).toBe("application/octet-stream");
  });
});

// ---------------------------------------------------------------------------
// ingestFile routing: text files still use the deterministic path
// ---------------------------------------------------------------------------

let tmpDir: string;
let brain: BrainHandle;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-vision-"));
  const brainDir = path.join(tmpDir, "brain");
  await BrainHandle.init(brainDir, { id: "test-brain", name: "Test" });
  brain = await BrainHandle.open(brainDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ingestFile routing", () => {
  it("routes text .md files through the deterministic path (creates chunks without LLM)", async () => {
    const rawDir = path.join(brain.root, "raw");
    await fsp.mkdir(rawDir, { recursive: true });
    await fsp.writeFile(
      path.join(rawDir, "document.md"),
      "# Title\n\nSome content here.",
      "utf-8"
    );

    const result = await ingestFile(brain, "raw/document.md");

    expect(result.source_name).toBe("raw-document-md");
    expect(result.chunks_created).toBeGreaterThan(0);
  });

  it("routes text .txt files through the deterministic path", async () => {
    const rawDir = path.join(brain.root, "raw");
    await fsp.mkdir(rawDir, { recursive: true });
    await fsp.writeFile(
      path.join(rawDir, "notes.txt"),
      "Some plain text notes here.",
      "utf-8"
    );

    const result = await ingestFile(brain, "raw/notes.txt");

    expect(result.source_name).toBe("raw-notes-txt");
    expect(result.chunks_created).toBeGreaterThan(0);
  });

  it("routes .pdf files to vision ingest (calls visionIngest)", async () => {
    // We can't call the actual LLM in tests, so we mock visionIngest
    const visionModule = await import("../src/vision-ingest.js");
    const mockVisionIngest = vi.spyOn(visionModule, "visionIngest").mockResolvedValue({
      source_name: "raw-test-pdf",
      chunks_created: 3,
    });

    const rawDir = path.join(brain.root, "raw");
    await fsp.mkdir(rawDir, { recursive: true });
    // Write a fake PDF file (just needs to exist)
    await fsp.writeFile(path.join(rawDir, "test.pdf"), Buffer.from("fake pdf content"));

    const result = await ingestFile(brain, "raw/test.pdf");

    expect(mockVisionIngest).toHaveBeenCalledWith(brain, "raw/test.pdf", "pdf");
    expect(result.source_name).toBe("raw-test-pdf");
    expect(result.chunks_created).toBe(3);

    mockVisionIngest.mockRestore();
  });

  it("routes .docx files to vision ingest", async () => {
    const visionModule = await import("../src/vision-ingest.js");
    const mockVisionIngest = vi.spyOn(visionModule, "visionIngest").mockResolvedValue({
      source_name: "raw-test-docx",
      chunks_created: 5,
    });

    const rawDir = path.join(brain.root, "raw");
    await fsp.mkdir(rawDir, { recursive: true });
    await fsp.writeFile(path.join(rawDir, "test.docx"), Buffer.from("fake docx content"));

    const result = await ingestFile(brain, "raw/test.docx");

    expect(mockVisionIngest).toHaveBeenCalledWith(brain, "raw/test.docx", "docx");
    expect(result.chunks_created).toBe(5);

    mockVisionIngest.mockRestore();
  });

  it("routes .png files to vision ingest", async () => {
    const visionModule = await import("../src/vision-ingest.js");
    const mockVisionIngest = vi.spyOn(visionModule, "visionIngest").mockResolvedValue({
      source_name: "raw-diagram-png",
      chunks_created: 1,
    });

    const rawDir = path.join(brain.root, "raw");
    await fsp.mkdir(rawDir, { recursive: true });
    await fsp.writeFile(path.join(rawDir, "diagram.png"), Buffer.from("fake png"));

    const result = await ingestFile(brain, "raw/diagram.png");

    expect(mockVisionIngest).toHaveBeenCalledWith(brain, "raw/diagram.png", "png");
    expect(result.chunks_created).toBe(1);

    mockVisionIngest.mockRestore();
  });

  it("routes .pptx files to vision ingest", async () => {
    const visionModule = await import("../src/vision-ingest.js");
    const mockVisionIngest = vi.spyOn(visionModule, "visionIngest").mockResolvedValue({
      source_name: "raw-slides-pptx",
      chunks_created: 12,
    });

    const rawDir = path.join(brain.root, "raw");
    await fsp.mkdir(rawDir, { recursive: true });
    await fsp.writeFile(path.join(rawDir, "slides.pptx"), Buffer.from("fake pptx"));

    const result = await ingestFile(brain, "raw/slides.pptx");

    expect(mockVisionIngest).toHaveBeenCalledWith(brain, "raw/slides.pptx", "pptx");
    expect(result.chunks_created).toBe(12);

    mockVisionIngest.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// BrainHandle.init copies vision-ingest template
// ---------------------------------------------------------------------------

describe("BrainHandle.init vision-ingest template", () => {
  it("creates _ops/vision-ingest.md on init", async () => {
    const brainDir = path.join(tmpDir, "brain2");
    await BrainHandle.init(brainDir, { id: "brain2", name: "Test Brain 2" });

    const templatePath = path.join(brainDir, "_ops", "vision-ingest.md");
    const stat = await fsp.stat(templatePath);
    expect(stat.isFile()).toBe(true);

    const content = await fsp.readFile(templatePath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("vision");
  });
});
