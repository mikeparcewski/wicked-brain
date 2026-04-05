/**
 * fs-brain CLI entry point
 * Usage: brain <command> [args...] [--flags]
 */

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Parse an array of CLI arguments into positional args and flags.
 * --key value  → flags["key"] = "value"
 * --flag       → flags["flag"] = true
 */
export function parseFlags(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      // Check if next arg is a value (not a flag itself)
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { positional, flags };
}

const USAGE = `
fs-brain CLI

Usage: brain <command> [args...] [--flags]

Commands:
  init [dir]              Initialize a new brain
  ingest <file>           Ingest a file into the brain
  search <query...>       Search the brain
  read <path>             Read a file progressively
  list [dir]              List files in the brain
  status                  Show brain status and stats
  lint                    Check for orphans and broken links
  diff [--since <ts>]     Show event log changes
  link <target>           Link this brain to another
  parent <target>         Add a parent brain
  unlink <target>         Remove a link to another brain
  rebuild-index           Reindex all files
  rebuild-meta            Rebuild meta files
  export                  Export brain metadata
  compile                 (Requires agent — Phase 5)
  structure               (Requires agent — Phase 5)
  enhance                 (Requires agent — Phase 5)
  jobs                    (Requires agent — Phase 5)
  schedule                (Requires agent — Phase 5)
`.trim();

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0) {
    process.stdout.write(USAGE + "\n");
    process.exit(1);
  }

  const [command, ...rest] = rawArgs;
  const { positional, flags } = parseFlags(rest);

  const commandMap: Record<string, string> = {
    init: "init",
    ingest: "ingest",
    search: "search",
    read: "read",
    list: "list",
    status: "status",
    lint: "lint",
    diff: "diff",
    link: "link",
    parent: "parent",
    unlink: "unlink",
    "rebuild-index": "rebuild-index",
    "rebuild-meta": "rebuild-meta",
    export: "export",
    compile: "compile",
    structure: "structure",
    enhance: "enhance",
    jobs: "jobs",
    schedule: "schedule",
  };

  const moduleName = commandMap[command];
  if (!moduleName) {
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}\n`);
    process.exit(1);
  }

  try {
    const mod = await import(`./cli-commands/${moduleName}.js`);
    // Each command module exports a run<Command> function
    const fnName = `run${moduleName.charAt(0).toUpperCase()}${moduleName.slice(1).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`;
    const fn = mod[fnName] as ((positional: string[], flags: Record<string, string | boolean>) => Promise<void>) | undefined;
    if (typeof fn !== "function") {
      throw new Error(`Command module ${moduleName} does not export ${fnName}`);
    }
    await fn(positional, flags);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

// Only run main() when invoked directly (not when imported by tests)
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const _scriptPath = fileURLToPath(import.meta.url);
const _isMain = process.argv[1] === _scriptPath ||
  // tsx transpiles to a temp path — check by matching the original source filename
  (process.argv[1] !== undefined && (
    process.argv[1].endsWith("/cli.js") ||
    process.argv[1].endsWith("/cli.ts") ||
    process.argv[1].endsWith("\\cli.js") ||
    process.argv[1].endsWith("\\cli.ts")
  ));

if (_isMain) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
