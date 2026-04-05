import { describe, it, expect } from "vitest";
import { parseWikilinks } from "../src/wikilinks.js";

describe("parseWikilinks", () => {
  it("parses a simple local link", () => {
    const links = parseWikilinks("See [[my-note]] for details.");
    expect(links).toHaveLength(1);
    expect(links[0].brain).toBe(null);
    expect(links[0].path).toBe("my-note");
    expect(links[0].raw).toBe("[[my-note]]");
  });

  it("parses a cross-brain link", () => {
    const links = parseWikilinks("Ref: [[brain-id::some/path/to/note]]");
    expect(links).toHaveLength(1);
    expect(links[0].brain).toBe("brain-id");
    expect(links[0].path).toBe("some/path/to/note");
    expect(links[0].raw).toBe("[[brain-id::some/path/to/note]]");
  });

  it("parses multiple links", () => {
    const links = parseWikilinks("[[note-a]] and [[brain-x::note-b]] and [[note-c]]");
    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({ brain: null, path: "note-a" });
    expect(links[1]).toMatchObject({ brain: "brain-x", path: "note-b" });
    expect(links[2]).toMatchObject({ brain: null, path: "note-c" });
  });

  it("returns empty array when no links found", () => {
    const links = parseWikilinks("No links here at all.");
    expect(links).toHaveLength(0);
  });

  it("ignores empty brackets [[]]", () => {
    const links = parseWikilinks("Empty [[]] brackets.");
    expect(links).toHaveLength(0);
  });

  it("ignores whitespace-only brackets [[ ]]", () => {
    const links = parseWikilinks("Blank [[   ]] link.");
    expect(links).toHaveLength(0);
  });

  it("handles cross-brain link where brain or path is empty", () => {
    // [[::path]] - brain is empty, should be ignored
    const links1 = parseWikilinks("[[::path]]");
    expect(links1).toHaveLength(0);

    // [[brain::]] - path is empty, should be ignored
    const links2 = parseWikilinks("[[brain::]]");
    expect(links2).toHaveLength(0);
  });

  it("handles link with path containing slashes", () => {
    const links = parseWikilinks("[[docs/guide/intro]]");
    expect(links).toHaveLength(1);
    expect(links[0].brain).toBe(null);
    expect(links[0].path).toBe("docs/guide/intro");
  });

  it("uses first :: separator for cross-brain split", () => {
    const links = parseWikilinks("[[brain-id::path::with::colons]]");
    expect(links).toHaveLength(1);
    expect(links[0].brain).toBe("brain-id");
    expect(links[0].path).toBe("path::with::colons");
  });
});
