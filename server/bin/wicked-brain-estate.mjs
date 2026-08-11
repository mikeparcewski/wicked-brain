#!/usr/bin/env node
// wicked-brain-estate — brain → wicked-estate consolidation tool (stage S1b).
//
// Two-phase migration with an inspectable bundle in between:
//
//   wicked-brain-estate export --out <bundle-dir> [--brain <path>] [--db <path>]
//       Read the brain's .brain.db (STRICTLY read-only) and write a
//       self-contained export bundle: documents.jsonl, links.jsonl (with the
//       real tuned confidence/evidence_count values), telemetry.json (the
//       exact `wicked-estate import-telemetry` shape), manifest.json.
//
//   wicked-brain-estate import --bundle <dir> --estate-home <dir>
//       Drive the bundle into estate: content via the wicked-estate-mcp stdio
//       binary (memory.capture / knowledge.write), relations via
//       knowledge.relate (explicit confidence + evidence_count), telemetry via
//       the `wicked-estate import-telemetry` CLI. Idempotent: re-runs skip
//       landed content (id-map.jsonl ledger), relations upsert, telemetry is
//       state-guarded. Ends with a counts reconciliation; any unaccounted row
//       exits non-zero.
//
//   wicked-brain-estate verify --bundle <dir>
//       Recompute the verification report from bundle artifacts (no estate
//       calls). Same exit semantics.
//
// Import contract pinned to wicked-estate PR #95
// (wicked-estate/docs/brain-consolidation-import-contract.md).

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { exportBundle } from "../lib/estate-export.mjs";
import { runImport, verifyBundle } from "../lib/estate-import.mjs";
import { projectId } from "../lib/project-id.mjs";

const HELP = `wicked-brain-estate — export a wicked-brain into a bundle and import it into wicked-estate.

Usage:
  wicked-brain-estate export --out <bundle-dir> [options]
  wicked-brain-estate import --bundle <bundle-dir> --estate-home <dir> [options]
  wicked-brain-estate verify --bundle <bundle-dir>

Export options:
  --brain <path>        brain directory (default: $WICKED_BRAIN_PATH, else
                        ~/.wicked-brain/projects/<project-id-of-cwd>)
  --db <path>           .brain.db path (default: <brain>/.brain.db)
  --out <dir>           bundle output directory (required)

Import options:
  --bundle <dir>        export bundle directory (required)
  --estate-home <dir>   directory holding the four estate stores (required
                        unless every db path is given explicitly):
                          graph.db, memory.db, knowledge.db, xedge.db
  --graph-db <path>     override estate graph db      (default <estate-home>/graph.db)
  --memory-db <path>    override memory db            (default <estate-home>/memory.db)
  --knowledge-db <path> override knowledge db         (default <estate-home>/knowledge.db)
  --xedge-db <path>     override xedge db             (default <estate-home>/xedge.db)
  --mcp-bin <path>      wicked-estate-mcp binary (default: $WICKED_ESTATE_MCP_BIN,
                        else "wicked-estate-mcp" on PATH)
  --estate-bin <path>   wicked-estate CLI binary (default: $WICKED_ESTATE_BIN,
                        else "wicked-estate" on PATH)
  --timeout <ms>        per-MCP-call timeout (default 60000)

Exit codes:
  0  success (import/verify: zero_loss confirmed)
  1  verification failed — unaccounted rows (see verification-report.json)
  2  CLI / infrastructure failure
`;

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.flags.help = true;
    } else if (a.startsWith("--")) {
      out.flags[a.slice(2)] = argv[++i];
    } else {
      out._.push(a);
    }
  }
  return out;
}

function die(msg) {
  process.stderr.write(`wicked-brain-estate: ${msg}\n`);
  process.exit(2);
}

function log(msg) {
  process.stderr.write(`[wicked-brain-estate] ${msg}\n`);
}

// Brain discovery for export: explicit flag → env → canonical per-project dir.
function resolveBrainPath(explicit) {
  if (explicit) return resolve(explicit);
  if (process.env.WICKED_BRAIN_PATH) return resolve(process.env.WICKED_BRAIN_PATH);
  const candidate = join(homedir(), ".wicked-brain", "projects", projectId(process.cwd()));
  if (existsSync(join(candidate, ".brain.db"))) return candidate;
  return null;
}

async function cmdExport(flags) {
  if (!flags.out) die("export requires --out <bundle-dir>");
  const brainPath = flags.db ? (flags.brain ? resolve(flags.brain) : null) : resolveBrainPath(flags.brain);
  const dbPath = flags.db ? resolve(flags.db) : brainPath ? join(brainPath, ".brain.db") : null;
  if (!dbPath) {
    die(
      "no brain found — pass --brain <dir> or --db <.brain.db path> " +
        "(or set WICKED_BRAIN_PATH)",
    );
  }
  const manifest = exportBundle({
    brainPath,
    dbPath,
    bundleDir: resolve(flags.out),
  });
  log(
    `exported brain '${manifest.brain_id}': ${manifest.counts.documents} documents ` +
      `(${manifest.counts.memories} memories, ${manifest.counts.chunks} chunks, ` +
      `${manifest.counts.wiki} wiki), ${manifest.counts.links} links, ` +
      `${manifest.counts.access_log} access rows, ${manifest.counts.search_misses} misses`,
  );
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
}

async function cmdImport(flags) {
  if (!flags.bundle) die("import requires --bundle <dir>");
  const home = flags["estate-home"] ? resolve(flags["estate-home"]) : null;
  const graphDb = flags["graph-db"] ?? (home && join(home, "graph.db"));
  const memoryDb = flags["memory-db"] ?? (home && join(home, "memory.db"));
  const knowledgeDb = flags["knowledge-db"] ?? (home && join(home, "knowledge.db"));
  const xedgeDb = flags["xedge-db"] ?? (home && join(home, "xedge.db"));
  if (!graphDb || !memoryDb || !knowledgeDb || !xedgeDb) {
    die("import requires --estate-home <dir> (or all four --*-db overrides)");
  }

  const mcpBin = flags["mcp-bin"] ?? process.env.WICKED_ESTATE_MCP_BIN ?? "wicked-estate-mcp";
  const estateBin = flags["estate-bin"] ?? process.env.WICKED_ESTATE_BIN ?? "wicked-estate";

  // The four store paths travel to the MCP child via its documented env/args
  // surface. Never fall back to the user's real ~/.wicked — every path here is
  // explicit.
  const env = {
    ...process.env,
    WICKED_ESTATE_DB: graphDb,
    WICKED_MEMORY_DB: memoryDb,
    WICKED_KNOWLEDGE_DB: knowledgeDb,
    WICKED_XEDGE_DB: xedgeDb,
  };

  const report = await runImport({
    bundleDir: resolve(flags.bundle),
    mcpBin,
    mcpArgs: ["--db", graphDb],
    estateBin,
    knowledgeDb,
    env,
    timeoutMs: flags.timeout ? parseInt(flags.timeout, 10) : 60_000,
    log,
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.zero_loss) {
    log("VERIFICATION FAILED — unaccounted rows detected (see verification-report.json)");
    process.exit(1);
  }
  log("verification passed: zero loss");
}

async function cmdVerify(flags) {
  if (!flags.bundle) die("verify requires --bundle <dir>");
  const report = verifyBundle(resolve(flags.bundle));
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.zero_loss) {
    log("VERIFICATION FAILED — unaccounted rows detected");
    process.exit(1);
  }
  log("verification passed: zero loss");
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (args.flags.help || !cmd) {
    process.stdout.write(HELP);
    process.exit(cmd ? 0 : 2);
  }
  switch (cmd) {
    case "export":
      await cmdExport(args.flags);
      break;
    case "import":
      await cmdImport(args.flags);
      break;
    case "verify":
      await cmdVerify(args.flags);
      break;
    default:
      die(`unknown command '${cmd}' — expected export | import | verify`);
  }
})().catch((err) => {
  process.stderr.write(`wicked-brain-estate: ${err.message ?? String(err)}\n`);
  process.exit(2);
});
