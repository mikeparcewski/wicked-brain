import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { BrainHandle } from "../brain.js";
import { ProgressiveLoader } from "../progressive.js";
import { resolveBrainRefs } from "../federation.js";
import { BrainPath } from "../brain-path.js";
import { contentHash } from "../hasher.js";
import { ingestFile } from "../ingest.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParams = Record<string, any>;

function textResult(data: unknown): { content: Array<{ type: "text"; text: string }>; details: null } {
  return { content: [{ type: "text", text: JSON.stringify(data) }], details: null };
}

export function createBrainTools(brain: BrainHandle): AgentTool[] {
  const loader = new ProgressiveLoader(brain);

  const brainSearch: AgentTool = {
    name: "brain_search",
    label: "Search brain",
    description: "Full-text search across the brain and federated brains",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      depth: Type.Optional(Type.Number({ description: "Federation depth" })),
      limit: Type.Optional(Type.Number({ description: "Maximum results" })),
      offset: Type.Optional(Type.Number({ description: "Pagination offset" })),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as AnyParams;
      const brainRefs = await resolveBrainRefs(brain);
      const result = await brain.search.searchFederated(
        { query: params["query"] as string, limit: params["limit"] as number | undefined, offset: params["offset"] as number | undefined },
        brainRefs
      );
      return textResult(result);
    },
  };

  const brainRead: AgentTool = {
    name: "brain_read",
    label: "Read brain file",
    description: "Read a file from the brain with progressive detail levels",
    parameters: Type.Object({
      path: Type.String({ description: "Relative path within the brain" }),
      depth: Type.Optional(Type.Number({ description: "0=stats, 1=summary+sections, 2=full content" })),
      sections: Type.Optional(Type.Array(Type.String(), { description: "Section filter for depth 2" })),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as AnyParams;
      const bp = BrainPath.from(params["path"] as string);
      const depth = (params["depth"] as number | undefined) ?? 1;
      const result = await loader.read(bp, depth, params["sections"] as string[] | undefined);
      return textResult(result);
    },
  };

  const brainWrite: AgentTool = {
    name: "brain_write",
    label: "Write brain file",
    description: "Write content to a file in the brain",
    parameters: Type.Object({
      path: Type.String({ description: "Relative path within the brain" }),
      content: Type.String({ description: "File content" }),
      expected_hash: Type.Optional(Type.String({ description: "Expected current content hash for optimistic concurrency" })),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as AnyParams;
      const bp = BrainPath.from(params["path"] as string);
      const receipt = await brain.storage.write(bp, params["content"] as string, {
        expectedHash: params["expected_hash"] as string | undefined,
      });
      const hash = contentHash(params["content"] as string);
      await brain.eventLog.append({
        ts: new Date().toISOString(),
        op: "write",
        path: params["path"] as string,
        author: "agent",
        content_hash: hash,
      });
      return textResult(receipt);
    },
  };

  const brainList: AgentTool = {
    name: "brain_list",
    label: "List brain files",
    description: "List files in a brain directory",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Directory path (defaults to root)" })),
      pattern: Type.Optional(Type.String({ description: "Glob pattern filter" })),
      recursive: Type.Optional(Type.Boolean({ description: "List recursively" })),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as AnyParams;
      const dir = (params["path"] as string | undefined) ? BrainPath.from(params["path"] as string) : BrainPath.from(".");
      const paths = await brain.storage.list(dir, {
        pattern: params["pattern"] as string | undefined,
        recursive: params["recursive"] as boolean | undefined,
      });
      return textResult(paths.map((p) => p.toString()));
    },
  };

  const brainStatus: AgentTool = {
    name: "brain_status",
    label: "Brain status",
    description: "Get brain status including index statistics and configuration",
    parameters: Type.Object({
      depth: Type.Optional(Type.Number({ description: "Federation depth" })),
    }),
    execute: async (_id, _rawParams) => {
      const stats = await brain.search.stats();
      const config = brain.config();
      return textResult({ stats, config });
    },
  };

  const brainBacklinks: AgentTool = {
    name: "brain_backlinks",
    label: "Brain backlinks",
    description: "Find all documents that link to a given path",
    parameters: Type.Object({
      path: Type.String({ description: "Target path to find backlinks for" }),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as AnyParams;
      const result = await brain.search.backlinks(params["path"] as string);
      return textResult(result);
    },
  };

  const brainForwardLinks: AgentTool = {
    name: "brain_forward_links",
    label: "Brain forward links",
    description: "Find all links going out from a given document",
    parameters: Type.Object({
      path: Type.String({ description: "Source path to find forward links for" }),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as AnyParams;
      const result = await brain.search.forwardLinks(params["path"] as string);
      return textResult(result);
    },
  };

  const brainLint: AgentTool = {
    name: "brain_lint",
    label: "Brain lint",
    description: "Check brain for structural issues and broken links",
    parameters: Type.Object({
      deep: Type.Optional(Type.Boolean({ description: "Perform deep lint checks" })),
    }),
    execute: async (_id, _rawParams) => {
      // Deterministic checks only for now
      const issues: Array<{ type: string; path?: string; message: string }> = [];

      // Check for broken wikilinks by comparing forward links to existing files
      try {
        const allDocs = await brain.storage.list(BrainPath.from("."), { recursive: true });
        const allPathSet = new Set(allDocs.map((p) => p.toString()));

        for (const p of allDocs) {
          const pathStr = p.toString();
          if (!pathStr.endsWith(".md")) continue;
          try {
            const fwLinks = await brain.search.forwardLinks(pathStr);
            for (const link of fwLinks) {
              if (!allPathSet.has(link) && !link.includes("::")) {
                issues.push({
                  type: "broken_link",
                  path: pathStr,
                  message: `Broken wikilink to: ${link}`,
                });
              }
            }
          } catch {
            // ignore per-file errors
          }
        }
      } catch {
        // ignore list errors
      }

      return textResult({ issues });
    },
  };

  const brainDiff: AgentTool = {
    name: "brain_diff",
    label: "Brain diff",
    description: "Show brain changes since a given timestamp",
    parameters: Type.Object({
      since: Type.Optional(Type.String({ description: "ISO timestamp — returns all events after this time" })),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as AnyParams;
      let entries;
      if (params["since"] as string | undefined) {
        entries = await brain.eventLog.readSince(params["since"] as string);
      } else {
        entries = await brain.eventLog.readAll();
      }
      return textResult(entries);
    },
  };

  const brainResolve: AgentTool = {
    name: "brain_resolve",
    label: "Resolve brain ref",
    description: "Resolve a path reference and check if it exists",
    parameters: Type.Object({
      ref: Type.String({ description: "Path reference to resolve" }),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as AnyParams;
      try {
        const bp = BrainPath.from(params["ref"] as string);
        const exists = await brain.storage.exists(bp);
        return textResult({ ref: params["ref"], path: bp.toString(), exists });
      } catch (err) {
        return textResult({ ref: params["ref"], error: (err as Error).message, exists: false });
      }
    },
  };

  const brainIngest: AgentTool = {
    name: "brain_ingest",
    label: "Ingest file",
    description: "Ingest a raw file into the brain (chunk and index it)",
    parameters: Type.Object({
      source: Type.String({ description: "Relative path to the source file within the brain" }),
    }),
    execute: async (_id, rawParams) => {
      const params = rawParams as AnyParams;
      const result = await ingestFile(brain, params["source"] as string);
      return textResult(result);
    },
  };

  return [
    brainSearch,
    brainRead,
    brainWrite,
    brainList,
    brainStatus,
    brainBacklinks,
    brainForwardLinks,
    brainLint,
    brainDiff,
    brainResolve,
    brainIngest,
  ];
}
