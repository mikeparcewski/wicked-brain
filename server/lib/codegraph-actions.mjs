import { CodegraphClient } from "./codegraph-client.mjs";
import { runIndex, staleness } from "./codegraph-index.mjs";

/**
 * Build the graph-* action handlers bound to a source repo. A fresh client per
 * call keeps the readonly DB handle short-lived and always reopens after a rebuild.
 */
export function makeGraphActions({ sourcePath, brainPath } = {}) {
  const withClient = (fn) => {
    const c = new CodegraphClient(sourcePath);
    try { return fn(c); } finally { c.close(); }
  };
  return {
    "graph-blast-radius": (p = {}) => withClient((c) => c.blastRadius({ node: p.node, maxDepth: p.maxDepth })),
    "graph-callers": (p = {}) => withClient((c) => c.callers({ node: p.node })),
    "graph-lineage": (p = {}) => withClient((c) => c.lineage({ node: p.node, maxDepth: p.maxDepth })),
    "graph-index": async () => {
      const r = await runIndex(sourcePath, { brainPath, sourcePath });
      return { ...r, staleness: staleness(sourcePath) };
    },
  };
}
