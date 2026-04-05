import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../src/brain.js";
import { resolveOpsTemplate } from "../src/ops-inheritance.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-ops-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function writeOpsTemplate(
  brainDir: string,
  operation: string,
  content: string
): Promise<void> {
  const opsDir = path.join(brainDir, "_ops");
  await fsp.mkdir(opsDir, { recursive: true });
  await fsp.writeFile(path.join(opsDir, `${operation}.md`), content, "utf-8");
}

describe("resolveOpsTemplate", () => {
  it("returns child template when it exists", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-id", name: "My Brain" });

    const childTemplate = "## Instructions\nDo this.\n\n## Notes\nSome notes.";
    await writeOpsTemplate(brainDir, "ingest", childTemplate);

    const brain = await BrainHandle.open(brainDir);

    try {
      const result = await resolveOpsTemplate(brain, "ingest");
      expect(result).toBe(childTemplate);
    } finally {
      brain.close();
    }
  });

  it("falls back to parent template when child does not have it", async () => {
    const parentDir = path.join(tmpDir, "parent");
    const childDir = path.join(tmpDir, "child");

    await BrainHandle.init(parentDir, { id: "parent-id", name: "Parent Brain" });
    const parentTemplate = "## Rules\nParent rules.\n\n## Notes\nParent notes.";
    await writeOpsTemplate(parentDir, "summarize", parentTemplate);

    const relativeParentPath = path.relative(childDir, parentDir);
    await BrainHandle.init(childDir, {
      id: "child-id",
      name: "Child Brain",
      parents: [relativeParentPath],
    });
    // Child does NOT have the summarize template

    const childBrain = await BrainHandle.open(childDir);

    try {
      const result = await resolveOpsTemplate(childBrain, "summarize");
      expect(result).toBe(parentTemplate);
    } finally {
      childBrain.close();
    }
  });

  it("applies locked_fields from parent — parent section replaces child section", async () => {
    const parentDir = path.join(tmpDir, "parent");
    const childDir = path.join(tmpDir, "child");

    await BrainHandle.init(parentDir, { id: "parent-id", name: "Parent Brain" });

    const parentTemplate = `---
locked_fields:
  - "## Rules"
---
## Rules
These are the immutable parent rules.
Rule 1: Always be safe.

## Notes
Parent notes section.
`;
    await writeOpsTemplate(parentDir, "review", parentTemplate);

    const relativeParentPath = path.relative(childDir, parentDir);
    await BrainHandle.init(childDir, {
      id: "child-id",
      name: "Child Brain",
      parents: [relativeParentPath],
    });

    const childTemplate = `## Rules
Child's own rules that should be overridden.

## Summary
Child summary section.
`;
    await writeOpsTemplate(childDir, "review", childTemplate);

    const childBrain = await BrainHandle.open(childDir);

    try {
      const result = await resolveOpsTemplate(childBrain, "review");

      // The ## Rules section should come from parent
      expect(result).toContain("These are the immutable parent rules.");
      expect(result).toContain("Rule 1: Always be safe.");
      // Child's own rules should be replaced
      expect(result).not.toContain("Child's own rules that should be overridden.");
      // Child's own sections should be preserved
      expect(result).toContain("## Summary");
      expect(result).toContain("Child summary section.");
    } finally {
      childBrain.close();
    }
  });

  it("returns empty string when no template found anywhere", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-id", name: "My Brain" });

    const brain = await BrainHandle.open(brainDir);

    try {
      const result = await resolveOpsTemplate(brain, "nonexistent-operation");
      expect(result).toBe("");
    } finally {
      brain.close();
    }
  });

  it("preserves child sections not mentioned in locked_fields", async () => {
    const parentDir = path.join(tmpDir, "parent");
    const childDir = path.join(tmpDir, "child");

    await BrainHandle.init(parentDir, { id: "parent-id", name: "Parent Brain" });

    const parentTemplate = `---
locked_fields:
  - "## Rules"
---
## Rules
Parent locked rules.

## Guidance
Parent guidance.
`;
    await writeOpsTemplate(parentDir, "ops", parentTemplate);

    const relativeParentPath = path.relative(childDir, parentDir);
    await BrainHandle.init(childDir, {
      id: "child-id",
      name: "Child Brain",
      parents: [relativeParentPath],
    });

    const childTemplate = `## Rules
Child rules (will be replaced).

## Context
Child-specific context.

## Guidance
Child guidance (not locked, stays).
`;
    await writeOpsTemplate(childDir, "ops", childTemplate);

    const childBrain = await BrainHandle.open(childDir);

    try {
      const result = await resolveOpsTemplate(childBrain, "ops");

      expect(result).toContain("Parent locked rules.");
      expect(result).not.toContain("Child rules (will be replaced).");
      expect(result).toContain("Child-specific context.");
      expect(result).toContain("Child guidance (not locked, stays).");
    } finally {
      childBrain.close();
    }
  });

  it("returns empty string when parent is inaccessible and child has no template", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, {
      id: "brain-id",
      name: "My Brain",
      parents: ["../nonexistent-parent"],
    });

    const brain = await BrainHandle.open(brainDir);

    try {
      const result = await resolveOpsTemplate(brain, "someop");
      expect(result).toBe("");
    } finally {
      brain.close();
    }
  });
});
