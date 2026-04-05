import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../src/brain.js";
import { resolveBrainRefs } from "../src/federation.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-federation-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveBrainRefs", () => {
  it("resolves self brain ref", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-self", name: "Self Brain" });
    const brain = await BrainHandle.open(brainDir);

    try {
      const refs = await resolveBrainRefs(brain);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        id: "brain-self",
        path: brainDir,
        relationship: "self",
        accessible: true,
      });
    } finally {
      brain.close();
    }
  });

  it("resolves accessible parent brain", async () => {
    const parentDir = path.join(tmpDir, "parent-brain");
    const childDir = path.join(tmpDir, "child-brain");

    await BrainHandle.init(parentDir, { id: "parent-id", name: "Parent Brain" });
    // Child references parent with relative path
    const relativeParentPath = path.relative(childDir, parentDir);
    await BrainHandle.init(childDir, {
      id: "child-id",
      name: "Child Brain",
      parents: [relativeParentPath],
    });

    const childBrain = await BrainHandle.open(childDir);

    try {
      const refs = await resolveBrainRefs(childBrain);

      expect(refs).toHaveLength(2);

      const selfRef = refs.find((r) => r.relationship === "self");
      expect(selfRef).toEqual({
        id: "child-id",
        path: childDir,
        relationship: "self",
        accessible: true,
      });

      const parentRef = refs.find((r) => r.relationship === "parent");
      expect(parentRef).toEqual({
        id: "parent-id",
        path: parentDir,
        relationship: "parent",
        accessible: true,
      });
    } finally {
      childBrain.close();
    }
  });

  it("resolves accessible link brain", async () => {
    const linkedDir = path.join(tmpDir, "linked-brain");
    const mainDir = path.join(tmpDir, "main-brain");

    await BrainHandle.init(linkedDir, { id: "linked-id", name: "Linked Brain" });
    const relativeLinkedPath = path.relative(mainDir, linkedDir);
    await BrainHandle.init(mainDir, {
      id: "main-id",
      name: "Main Brain",
      links: [relativeLinkedPath],
    });

    const mainBrain = await BrainHandle.open(mainDir);

    try {
      const refs = await resolveBrainRefs(mainBrain);

      expect(refs).toHaveLength(2);

      const linkRef = refs.find((r) => r.relationship === "link");
      expect(linkRef).toEqual({
        id: "linked-id",
        path: linkedDir,
        relationship: "link",
        accessible: true,
      });
    } finally {
      mainBrain.close();
    }
  });

  it("marks inaccessible brains when path does not exist", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    const nonExistentRelative = "../nonexistent-brain";

    await BrainHandle.init(brainDir, {
      id: "brain-id",
      name: "My Brain",
      parents: [nonExistentRelative],
    });

    const brain = await BrainHandle.open(brainDir);

    try {
      const refs = await resolveBrainRefs(brain);

      expect(refs).toHaveLength(2);

      const parentRef = refs.find((r) => r.relationship === "parent");
      expect(parentRef).toBeDefined();
      expect(parentRef!.accessible).toBe(false);
      expect(parentRef!.id).toBe("nonexistent-brain");
      expect(parentRef!.relationship).toBe("parent");
    } finally {
      brain.close();
    }
  });

  it("resolves multiple parents and links together", async () => {
    const parent1Dir = path.join(tmpDir, "parent1");
    const parent2Dir = path.join(tmpDir, "parent2");
    const linkDir = path.join(tmpDir, "linkbrain");
    const mainDir = path.join(tmpDir, "main");

    await BrainHandle.init(parent1Dir, { id: "parent1-id", name: "Parent 1" });
    await BrainHandle.init(parent2Dir, { id: "parent2-id", name: "Parent 2" });
    await BrainHandle.init(linkDir, { id: "link-id", name: "Link Brain" });

    await BrainHandle.init(mainDir, {
      id: "main-id",
      name: "Main Brain",
      parents: [
        path.relative(mainDir, parent1Dir),
        path.relative(mainDir, parent2Dir),
      ],
      links: [path.relative(mainDir, linkDir)],
    });

    const mainBrain = await BrainHandle.open(mainDir);

    try {
      const refs = await resolveBrainRefs(mainBrain);

      expect(refs).toHaveLength(4);
      expect(refs.filter((r) => r.relationship === "parent")).toHaveLength(2);
      expect(refs.filter((r) => r.relationship === "link")).toHaveLength(1);
      expect(refs.filter((r) => r.relationship === "self")).toHaveLength(1);
    } finally {
      mainBrain.close();
    }
  });
});
