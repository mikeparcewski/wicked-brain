import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../src/frontmatter.js";

describe("parseFrontmatter", () => {
  it("parses basic scalar fields", () => {
    const md = `---
title: Hello World
count: 42
enabled: true
nothing: null
---
Body text here.
`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.title).toBe("Hello World");
    expect(frontmatter.count).toBe(42);
    expect(frontmatter.enabled).toBe(true);
    expect(frontmatter.nothing).toBe(null);
    expect(body.trim()).toBe("Body text here.");
  });

  it("parses block-style arrays", () => {
    const md = `---
tags:
  - typescript
  - testing
  - vitest
---
`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.tags).toEqual(["typescript", "testing", "vitest"]);
  });

  it("parses inline arrays", () => {
    const md = `---
colors: [red, green, blue]
empty: []
---
`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.colors).toEqual(["red", "green", "blue"]);
    expect(frontmatter.empty).toEqual([]);
  });

  it("parses nested objects", () => {
    const md = `---
meta:
  author: Alice
  version: 2
---
`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.meta).toEqual({ author: "Alice", version: 2 });
  });

  it("parses nested objects with sub-arrays", () => {
    const md = `---
config:
  name: test
  features:
    - a
    - b
---
`;
    const { frontmatter } = parseFrontmatter(md);
    const config = frontmatter.config as Record<string, unknown>;
    expect(config.name).toBe("test");
    expect(config.features).toEqual(["a", "b"]);
  });

  it("returns empty object for missing frontmatter", () => {
    const md = "Just plain body text.";
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter).toEqual({});
    expect(body).toBe("Just plain body text.");
  });

  it("returns empty object for empty frontmatter block", () => {
    const md = `---
---
Some body.
`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter).toEqual({});
    expect(body.trim()).toBe("Some body.");
  });

  it("parses quoted strings", () => {
    const md = `---
key: "true"
other: 'false'
---
`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.key).toBe("true");
    expect(frontmatter.other).toBe("false");
  });
});

describe("serializeFrontmatter", () => {
  it("serializes basic scalars", () => {
    const result = serializeFrontmatter({ title: "Test", count: 5, active: false }, "");
    expect(result).toContain("title: Test");
    expect(result).toContain("count: 5");
    expect(result).toContain("active: false");
    expect(result).toMatch(/^---\n/);
  });

  it("serializes arrays as block style", () => {
    const result = serializeFrontmatter({ tags: ["a", "b"] }, "");
    expect(result).toContain("- a");
    expect(result).toContain("- b");
  });

  it("serializes empty arrays", () => {
    const result = serializeFrontmatter({ tags: [] }, "");
    expect(result).toContain("tags: []");
  });

  it("includes body after frontmatter", () => {
    const result = serializeFrontmatter({ title: "Hi" }, "Body content.");
    expect(result).toContain("Body content.");
  });
});

describe("round-trip", () => {
  it("parse → serialize → parse preserves scalar data", () => {
    const original = `---
title: My Document
count: 42
active: true
nothing: null
---
Body here.
`;
    const { frontmatter: fm1, body: b1 } = parseFrontmatter(original);
    const serialized = serializeFrontmatter(fm1, b1);
    const { frontmatter: fm2, body: b2 } = parseFrontmatter(serialized);

    expect(fm2.title).toBe(fm1.title);
    expect(fm2.count).toBe(fm1.count);
    expect(fm2.active).toBe(fm1.active);
    expect(fm2.nothing).toBe(fm1.nothing);
    expect(b2.trim()).toBe(b1.trim());
  });

  it("parse → serialize → parse preserves arrays", () => {
    const original = `---
tags:
  - one
  - two
  - three
---
`;
    const { frontmatter: fm1 } = parseFrontmatter(original);
    const serialized = serializeFrontmatter(fm1, "");
    const { frontmatter: fm2 } = parseFrontmatter(serialized);

    expect(fm2.tags).toEqual(fm1.tags);
  });
});
