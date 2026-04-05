import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { contentHash, fileHash } from "../src/hasher.js";

describe("contentHash", () => {
  it("returns a 16-character hex string", () => {
    const hash = contentHash("hello world");
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is consistent for the same input", () => {
    const a = contentHash("test content");
    const b = contentHash("test content");
    expect(a).toBe(b);
  });

  it("produces different hashes for different content", () => {
    const a = contentHash("content A");
    const b = contentHash("content B");
    expect(a).not.toBe(b);
  });

  it("handles empty string", () => {
    const hash = contentHash("");
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("fileHash", () => {
  it("matches contentHash for the same content", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hasher-test-"));
    const filePath = path.join(tmpDir, "test.txt");
    const content = "file content for hashing";
    await fs.writeFile(filePath, content, "utf-8");

    const fromFile = await fileHash(filePath);
    const fromContent = contentHash(content);
    expect(fromFile).toBe(fromContent);

    await fs.rm(tmpDir, { recursive: true });
  });

  it("returns 16-char hex for a file", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hasher-test-"));
    const filePath = path.join(tmpDir, "data.txt");
    await fs.writeFile(filePath, "some data", "utf-8");

    const hash = await fileHash(filePath);
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);

    await fs.rm(tmpDir, { recursive: true });
  });
});
