/**
 * MCP Server for fs-brain.
 *
 * Usage (single brain):
 *   node dist/mcp/server.js --brain /path/to/brain
 *
 * Usage (multi-brain discovery root):
 *   node dist/mcp/server.js --root /path/to/brains
 *
 * The server communicates over stdio using the MCP protocol.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BrainHandle } from "../brain.js";
import { JobManager } from "../agent/job-manager.js";
import {
  createToolDispatch,
  getToolDefinitions,
  handleResourceOrientation,
  handleResourceRecent,
  handleResourceGaps,
} from "./handlers.js";

// ──────────────────────────────────────────────────────────────────────────────
// Server factory
// ──────────────────────────────────────────────────────────────────────────────

export interface BrainServerOptions {
  brain: BrainHandle;
}

export function createBrainMcpServer(opts: BrainServerOptions): Server {
  const { brain } = opts;
  const jobManager = new JobManager(path.join(brain.root, "_meta"));
  const dispatch = createToolDispatch(brain, jobManager);
  const toolDefs = getToolDefinitions();

  const server = new Server(
    { name: "fs-brain", version: "1.0.0" },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // ── tools/list ──────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefs.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  // ── tools/call ──────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await dispatch(name, (args ?? {}) as Record<string, any>);
    return {
      content: result.content,
      isError: result.isError,
    };
  });

  // ── resources/list ──────────────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "brain://orientation",
          name: "Brain Orientation",
          description: "Overview of this brain's purpose, structure, and conventions",
          mimeType: "text/markdown",
        },
        {
          uri: "brain://recent",
          name: "Recent Changes",
          description: "Recently added or modified content in this brain",
          mimeType: "text/markdown",
        },
        {
          uri: "brain://gaps",
          name: "Knowledge Gaps",
          description: "Identified gaps and areas needing more content",
          mimeType: "text/markdown",
        },
      ],
    };
  });

  // ── resources/read ──────────────────────────────────────────────────────────
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    let content: string;
    switch (uri) {
      case "brain://orientation":
        content = await handleResourceOrientation(brain);
        break;
      case "brain://recent":
        content = await handleResourceRecent(brain);
        break;
      case "brain://gaps":
        content = await handleResourceGaps(brain);
        break;
      default:
        throw new Error(`Unknown resource URI: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: content,
        },
      ],
    };
  });

  return server;
}

// ──────────────────────────────────────────────────────────────────────────────
// Multi-brain discovery
// ──────────────────────────────────────────────────────────────────────────────

async function discoverBrains(rootDir: string): Promise<string[]> {
  const brainDirs: string[] = [];

  async function scan(dir: string): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return;
    }

    // Check if this dir itself is a brain
    const hasBrainJson = names.includes("brain.json");
    if (hasBrainJson) {
      brainDirs.push(dir);
      return; // don't recurse into a brain
    }

    for (const name of names) {
      if (name.startsWith(".")) continue;
      const fullPath = path.join(dir, name);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          await scan(fullPath);
        }
      } catch {
        // skip inaccessible entries
      }
    }
  }

  await scan(rootDir);
  return brainDirs;
}

// ──────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let brainPath: string | undefined;
  let rootPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--brain" && args[i + 1]) {
      brainPath = path.resolve(args[++i]!);
    } else if (args[i] === "--root" && args[i + 1]) {
      rootPath = path.resolve(args[++i]!);
    }
  }

  if (!brainPath && !rootPath) {
    process.stderr.write("Usage: fs-brain-mcp --brain <path> | --root <path>\n");
    process.exit(1);
  }

  // Resolve brain path from root discovery if needed
  if (!brainPath && rootPath) {
    const discovered = await discoverBrains(rootPath);
    if (discovered.length === 0) {
      process.stderr.write(`No brains found under: ${rootPath}\n`);
      process.exit(1);
    }
    // Use the first discovered brain for now (multi-brain MUX is a future concern)
    brainPath = discovered[0]!;
    process.stderr.write(`Using brain: ${brainPath}\n`);
  }

  const brain = await BrainHandle.open(brainPath!);

  const server = createBrainMcpServer({ brain });
  const transport = new StdioServerTransport();

  await server.connect(transport);

  process.stderr.write(`fs-brain MCP server running (brain: ${brainPath})\n`);

  // Graceful shutdown
  process.on("SIGINT", () => {
    brain.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    brain.close();
    process.exit(0);
  });
}

// Run if this is the entry point
const isMain = process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts");
if (isMain) {
  main().catch((e: unknown) => {
    process.stderr.write(`Fatal error: ${(e as Error).message}\n`);
    process.exit(1);
  });
}
