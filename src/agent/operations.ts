import * as fs from "node:fs";
import * as path from "node:path";
import { getModel } from "@mariozechner/pi-ai";
import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { BrainHandle } from "../brain.js";
import { createBrainTools } from "./tools.js";

interface OperationConfig {
  tools: string[];
  thinkingLevel: string;
  toolExecution: "sequential" | "parallel";
}

const OPERATION_CONFIGS: Record<string, OperationConfig> = {
  structure: {
    tools: ["brain_read", "brain_write", "brain_search", "brain_status", "brain_backlinks", "brain_forward_links"],
    thinkingLevel: "medium",
    toolExecution: "sequential",
  },
  compile: {
    tools: ["brain_read", "brain_write", "brain_search", "brain_status", "brain_backlinks", "brain_list"],
    thinkingLevel: "high",
    toolExecution: "sequential",
  },
  lint: {
    tools: ["brain_read", "brain_write", "brain_search", "brain_status", "brain_lint", "brain_diff"],
    thinkingLevel: "medium",
    toolExecution: "parallel",
  },
  enhance: {
    tools: ["brain_read", "brain_write", "brain_search", "brain_status", "brain_resolve"],
    thinkingLevel: "high",
    toolExecution: "sequential",
  },
  query: {
    tools: ["brain_read", "brain_search", "brain_backlinks", "brain_forward_links", "brain_resolve", "brain_status"],
    thinkingLevel: "low",
    toolExecution: "parallel",
  },
};

const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
  structure: "You are a brain structure agent. Analyze and improve the organization of knowledge in this brain.",
  compile: "You are a brain compile agent. Gather and synthesize information into coherent documents.",
  lint: "You are a brain lint agent. Identify and fix structural issues, broken links, and inconsistencies.",
  enhance: "You are a brain enhance agent. Improve the quality and depth of knowledge in this brain.",
  query: "You are a brain query agent. Answer questions using the knowledge stored in this brain.",
};

function loadSystemPrompt(brain: BrainHandle, operation: string): string {
  const opsPath = path.join(brain.root, "_ops", `${operation}.md`);
  try {
    return fs.readFileSync(opsPath, "utf-8");
  } catch {
    return DEFAULT_SYSTEM_PROMPTS[operation] ?? `You are a brain ${operation} agent.`;
  }
}

export function createOperationAgent(brain: BrainHandle, operation: string): Agent {
  const config = OPERATION_CONFIGS[operation];
  if (!config) {
    throw new Error(`Unknown operation: ${operation}. Valid operations: ${Object.keys(OPERATION_CONFIGS).join(", ")}`);
  }

  // Build all brain tools and filter to only the ones for this operation
  const allTools = createBrainTools(brain);
  const toolSet = new Set(config.tools);
  const filteredTools: AgentTool[] = allTools.filter((t) => toolSet.has(t.name));

  // Load system prompt from _ops/{operation}.md or fall back to default
  const systemPrompt = loadSystemPrompt(brain, operation);

  // Get model from brain config, fallback to default
  const brainConfig = brain.config();
  const modelConfig = brainConfig.models?.[operation] ?? brainConfig.models?.["default"];

  let model;
  if (modelConfig) {
    model = getModel(modelConfig.provider as "anthropic", modelConfig.model as "claude-sonnet-4-20250514");
  } else {
    model = getModel("anthropic" as "anthropic", "claude-sonnet-4-20250514" as "claude-sonnet-4-20250514");
  }

  return new Agent({
    initialState: {
      systemPrompt,
      model: model as ReturnType<typeof getModel>,
      thinkingLevel: config.thinkingLevel as "medium",
      tools: filteredTools,
      messages: [],
    },
    toolExecution: config.toolExecution,
  });
}
