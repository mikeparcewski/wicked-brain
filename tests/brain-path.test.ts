import { describe, it, expect } from "vitest";
import path from "node:path";
import { BrainPath } from "../src/brain-path.js";

describe("BrainPath.from", () => {
  it("creates a BrainPath from a simple relative path", () => {
    const p = BrainPath.from("notes/foo.md");
    expect(p.toString()).toBe("notes/foo.md");
  });

  it("normalizes multiple slashes", () => {
    const p = BrainPath.from("notes//foo.md");
    expect(p.toString()).toBe("notes/foo.md");
  });

  it("normalizes dot segments", () => {
    const p = BrainPath.from("notes/./foo.md");
    expect(p.toString()).toBe("notes/foo.md");
  });

  it("rejects absolute paths", () => {
    expect(() => BrainPath.from("/absolute/path")).toThrow("absolute paths are not allowed");
  });

  it("rejects direct traversal: '..'", () => {
    expect(() => BrainPath.from("..")).toThrow("path traversal is not allowed");
  });

  it("rejects traversal that escapes root: '../etc'", () => {
    expect(() => BrainPath.from("../etc/passwd")).toThrow("path traversal is not allowed");
  });

  it("rejects traversal disguised with extra segments: 'notes/../../etc'", () => {
    // path.posix.normalize("notes/../../etc") => "../etc" which starts with ".."
    expect(() => BrainPath.from("notes/../../etc")).toThrow("path traversal is not allowed");
  });

  it("accepts a path that goes up but stays within root: 'notes/../wiki'", () => {
    // notes/../wiki normalizes to "wiki" — valid
    const p = BrainPath.from("notes/../wiki");
    expect(p.toString()).toBe("wiki");
  });

  it("accepts '.' as current directory", () => {
    const p = BrainPath.from(".");
    expect(p.toString()).toBe(".");
  });
});

describe("BrainPath.resolve", () => {
  it("resolves to absolute path given brain root", () => {
    const p = BrainPath.from("notes/foo.md");
    const resolved = p.resolve("/brain");
    expect(resolved).toBe(path.resolve("/brain", "notes/foo.md"));
  });
});

describe("BrainPath.parent", () => {
  it("returns parent directory", () => {
    const p = BrainPath.from("notes/foo.md");
    expect(p.parent().toString()).toBe("notes");
  });

  it("parent of top-level file is '.'", () => {
    const p = BrainPath.from("foo.md");
    expect(p.parent().toString()).toBe(".");
  });

  it("parent of '.' stays at '.'", () => {
    const p = BrainPath.from(".");
    expect(p.parent().toString()).toBe(".");
  });
});

describe("BrainPath.basename", () => {
  it("returns the filename", () => {
    const p = BrainPath.from("notes/foo.md");
    expect(p.basename()).toBe("foo.md");
  });

  it("returns last segment of a directory path", () => {
    const p = BrainPath.from("notes/subdir");
    expect(p.basename()).toBe("subdir");
  });
});

describe("BrainPath.join", () => {
  it("joins a segment to the path", () => {
    const p = BrainPath.from("notes");
    expect(p.join("foo.md").toString()).toBe("notes/foo.md");
  });

  it("normalizes joined result", () => {
    const p = BrainPath.from("notes");
    expect(p.join("./sub/../foo.md").toString()).toBe("notes/foo.md");
  });

  it("rejects absolute segment", () => {
    const p = BrainPath.from("notes");
    expect(() => p.join("/etc/passwd")).toThrow("absolute segment is not allowed");
  });

  it("rejects traversal that escapes root", () => {
    const p = BrainPath.from("notes");
    expect(() => p.join("../../etc")).toThrow("path traversal is not allowed");
  });

  it("allows going up but staying within root", () => {
    const p = BrainPath.from("notes/sub");
    expect(p.join("../other.md").toString()).toBe("notes/other.md");
  });
});

describe("BrainPath.equals", () => {
  it("equal paths return true", () => {
    const a = BrainPath.from("notes/foo.md");
    const b = BrainPath.from("notes/foo.md");
    expect(a.equals(b)).toBe(true);
  });

  it("different paths return false", () => {
    const a = BrainPath.from("notes/foo.md");
    const b = BrainPath.from("notes/bar.md");
    expect(a.equals(b)).toBe(false);
  });

  it("normalized paths that are equivalent are equal", () => {
    const a = BrainPath.from("notes//foo.md");
    const b = BrainPath.from("notes/./foo.md");
    expect(a.equals(b)).toBe(true);
  });
});

describe("BrainPath.toString", () => {
  it("returns the relative path string", () => {
    const p = BrainPath.from("notes/foo.md");
    expect(p.toString()).toBe("notes/foo.md");
    expect(`${p}`).toBe("notes/foo.md");
  });
});
