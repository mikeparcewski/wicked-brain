import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../../src/brain.js";
import { createOperationAgent } from "../../src/agent/operations.js";
import { Agent } from "@mariozechner/pi-agent-core";

let tmpDir: string;
let brain: BrainHandle;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-ops-"));
  const brainDir = path.join(tmpDir, "brain");
  await BrainHandle.init(brainDir, { id: "test-brain", name: "Test Brain" });
  brain = await BrainHandle.open(brainDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("createOperationAgent", () => {
  it("throws for unknown operation", () => {
    expect(() => createOperationAgent(brain, "unknown-op")).toThrow("Unknown operation");
  });

  const OPERATIONS = ["structure", "compile", "lint", "enhance", "query"] as const;

  for (const op of OPERATIONS) {
    it(`creates agent for operation: ${op}`, () => {
      const agent = createOperationAgent(brain, op);
      expect(agent).toBeInstanceOf(Agent);
    });

    it(`${op} agent has correct tools`, () => {
      const agent = createOperationAgent(brain, op);
      const toolNames = agent.state.tools.map((t) => t.name);

      const EXPECTED_TOOLS: Record<string, string[]> = {
        structure: ["brain_read", "brain_write", "brain_search", "brain_status", "brain_backlinks", "brain_forward_links"],
        compile: ["brain_read", "brain_write", "brain_search", "brain_status", "brain_backlinks", "brain_list"],
        lint: ["brain_read", "brain_write", "brain_search", "brain_status", "brain_lint", "brain_diff"],
        enhance: ["brain_read", "brain_write", "brain_search", "brain_status", "brain_resolve"],
        query: ["brain_read", "brain_search", "brain_backlinks", "brain_forward_links", "brain_resolve", "brain_status"],
      };

      for (const expectedTool of EXPECTED_TOOLS[op]) {
        expect(toolNames).toContain(expectedTool);
      }

      // Should not have tools outside operation's config
      for (const toolName of toolNames) {
        expect(EXPECTED_TOOLS[op]).toContain(toolName);
      }
    });

    it(`${op} agent has system prompt`, () => {
      const agent = createOperationAgent(brain, op);
      expect(agent.state.systemPrompt).toBeTruthy();
      expect(agent.state.systemPrompt.length).toBeGreaterThan(0);
    });
  }

  it("loads system prompt from _ops/ if file exists", async () => {
    const customPrompt = "Custom system prompt for testing.";
    const opsDir = path.join(brain.root, "_ops");
    await fsp.mkdir(opsDir, { recursive: true });
    await fsp.writeFile(path.join(opsDir, "structure.md"), customPrompt, "utf-8");

    const agent = createOperationAgent(brain, "structure");
    expect(agent.state.systemPrompt).toBe(customPrompt);
  });

  it("falls back to default prompt if _ops/ file missing", () => {
    const agent = createOperationAgent(brain, "query");
    // Default prompt should contain "query" or some relevant content
    expect(agent.state.systemPrompt.toLowerCase()).toContain("query");
  });

  it("structure agent has sequential tool execution", () => {
    const agent = createOperationAgent(brain, "structure");
    expect(agent.toolExecution).toBe("sequential");
  });

  it("lint agent has parallel tool execution", () => {
    const agent = createOperationAgent(brain, "lint");
    expect(agent.toolExecution).toBe("parallel");
  });

  it("query agent has parallel tool execution", () => {
    const agent = createOperationAgent(brain, "query");
    expect(agent.toolExecution).toBe("parallel");
  });
});
