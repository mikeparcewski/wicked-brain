#!/usr/bin/env node
// wicked-brain installer — detects CLIs and installs skills + agents

import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const skillsSource = join(__dirname, "skills");
const home = homedir();

// Claude-root candidate builder. Claude Code's config root is redirectable
// via $CLAUDE_CONFIG_DIR (multi-tenant setups, alt-config layouts, corporate
// home-dir overrides). Mirrors the 0.3.3 wicked-testing fix: env var is
// authoritative when set; otherwise we probe ~/.claude + common alt-config
// paths and install into each that carries Claude identity markers.
function buildClaudeTarget(rootDir, source, { trusted = false } = {}) {
  return {
    name: "claude",
    rootDir,
    dir: join(rootDir, "skills"),
    agentDir: join(rootDir, "agents"),
    agentSubdir: "agents",
    platform: "claude",
    identityMarkers: ["settings.json", "plugins", "projects"],
    source,
    trusted,
  };
}

function resolveClaudeCandidates() {
  const envDir = process.env.CLAUDE_CONFIG_DIR;
  if (envDir && typeof envDir === "string" && envDir.trim()) {
    const root = resolve(envDir.trim().replace(/^~/, home));
    return [buildClaudeTarget(root, "env:CLAUDE_CONFIG_DIR", { trusted: true })];
  }
  return [
    buildClaudeTarget(join(home, ".claude"),                "default"),
    buildClaudeTarget(join(home, "alt-configs", ".claude"), "alt-configs"),
    buildClaudeTarget(join(home, ".config", "claude"),      "xdg"),
  ];
}

// Canonical non-claude targets. Claude is expanded dynamically via
// resolveClaudeCandidates() below so CLI_TARGETS stays a flat spec.
const CLI_TARGETS = [
  { name: "gemini",      dir: join(home, ".gemini", "skills"),      agentDir: join(home, ".gemini", "agents"),      agentSubdir: "agents", platform: "gemini" },
  { name: "copilot",     dir: join(home, ".github", "skills"),      agentDir: join(home, ".github", "agents"),      agentSubdir: "agents", platform: "copilot" },
  { name: "codex",       dir: join(home, ".codex", "skills"),       agentDir: join(home, ".codex", "agents"),       agentSubdir: "agents", platform: "codex" },
  { name: "cursor",      dir: join(home, ".cursor", "skills"),      agentDir: join(home, ".cursor", "agents"),      agentSubdir: "agents", platform: "cursor" },
  { name: "kiro",        dir: join(home, ".kiro", "skills"),        agentDir: join(home, ".kiro", "agents"),        agentSubdir: "agents", platform: "kiro" },
  { name: "antigravity", dir: join(home, ".antigravity", "skills"), agentDir: join(home, ".antigravity", "rules"),  agentSubdir: "rules",  platform: "antigravity" },
];

// Identity-marker gate for claude candidates. Without this, probing
// ~/.claude, ~/alt-configs/.claude, and ~/.config/claude would install
// into every path that happens to exist — risky if one was created by a
// different tool. Env-var / --path targets are `trusted` and skip this.
function claudeHasIdentityMarker(target) {
  if (target.trusted) return true;
  if (!existsSync(target.rootDir)) return false;
  return (target.identityMarkers || []).some(m => existsSync(join(target.rootDir, m)));
}

console.log("wicked-brain installer\n");

const args = argv.slice(2);

// Flag parser supporting both forms:
//   --flag=value   (canonical)
//   --flag value   (common shell muscle-memory; previously silently
//                   dropped the value and fell through to default
//                   detection — same bug that hit wicked-testing 0.3.2).
// Narrow string-boolean coercion: literal "true" / "false" become
// booleans so `--hooks=false` doesn't install hooks.
const flagValue = (name) => {
  const f = args.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!f) return null;
  let val;
  if (f.includes("=")) {
    // slice from the first '=' forward — split("=")[1] would truncate at
    // the second '=' (e.g. --path=/volumes/build=artifacts would silently
    // drop "=artifacts").
    val = f.slice(f.indexOf("=") + 1);
  } else {
    const idx = args.indexOf(f);
    const next = args[idx + 1];
    val = (next && !next.startsWith("-")) ? next : true;
  }
  if (val === "false") return false;
  if (val === "true")  return true;
  return val;
};

const cliArg  = flagValue("cli");
const pathArg = flagValue("path");

let targets;

if (pathArg && typeof pathArg === "string" && pathArg !== "") {
  const customPath = resolve(pathArg.replace(/^~/, home));
  // Strip leading dot to match CLI_TARGETS names (e.g. ".claude" → "claude")
  const dirName = basename(customPath).replace(/^\./, "");
  const knownPlatform = CLI_TARGETS.find((t) => t.name === dirName);
  const agentSubdir = knownPlatform?.agentSubdir ?? "agents";
  targets = [{
    name: dirName,
    dir: join(customPath, "skills"),
    agentDir: join(customPath, agentSubdir),
    platform: knownPlatform?.platform ?? dirName,
  }];
  console.log(`Custom path: ${customPath}\n`);
} else if (pathArg === true || pathArg === "") {
  console.error("Error: --path requires a value (e.g. --path=~/.claude or --path ~/.claude)");
  process.exit(1);
} else {
  // Build the detection set: expanded claude candidates (env var OR alt-config
  // probes) + all non-claude targets. Claude candidates pass an identity-marker
  // check so we don't install into a bare ~/.claude that belongs to some other
  // tool. Non-claude targets keep the original parent-dir-exists heuristic.
  const claudeDetected = resolveClaudeCandidates().filter(claudeHasIdentityMarker);
  const otherDetected  = CLI_TARGETS.filter((t) => existsSync(resolve(t.dir, "..")));
  const detected = [...claudeDetected, ...otherDetected];

  if (detected.length === 0) {
    console.log("No supported AI CLIs detected. Supported: claude, gemini, copilot, codex, cursor, kiro, antigravity");
    console.log("Install skills manually by copying the skills/ directory, or set CLAUDE_CONFIG_DIR.");
    process.exit(1);
  }

  // Annotate claude candidates with their source when more than one was
  // detected, so the log is not ambiguous.
  const claudeCount = claudeDetected.length;
  const label = (d) => d.name === "claude" && claudeCount > 1 && d.source
    ? `${d.name}[${d.source}]`
    : d.name;
  console.log(`Detected CLIs: ${detected.map(label).join(", ")}\n`);

  const cliFilter = (cliArg && typeof cliArg === "string") ? cliArg.split(",") : null;
  targets = cliFilter ? detected.filter((d) => cliFilter.includes(d.name)) : detected;
}

// Copy skills to each target CLI
const skillDirs = readdirSync(skillsSource).filter((d) => !d.startsWith("."));

for (const target of targets) {
  console.log(`Installing to ${target.name} (${target.dir})...`);
  mkdirSync(target.dir, { recursive: true });

  for (const skill of skillDirs) {
    const src = join(skillsSource, skill);
    const dest = join(target.dir, skill);
    cpSync(src, dest, { recursive: true });
  }

  console.log(`  ${skillDirs.length} skills installed`);
}

// Copy platform-specific agents
const agentsSource = join(__dirname, "skills", "wicked-brain-agent", "platform");

for (const target of targets) {
  const platformDir = join(agentsSource, target.platform);
  if (!existsSync(platformDir)) {
    console.log(`  No agent definitions for ${target.name}, skipping agents`);
    continue;
  }

  if (!target.agentDir) continue;

  mkdirSync(target.agentDir, { recursive: true });
  const agentFiles = readdirSync(platformDir);
  let agentCount = 0;

  for (const file of agentFiles) {
    const src = join(platformDir, file);
    const dest = join(target.agentDir, file);
    cpSync(src, dest, { force: true });
    agentCount++;
  }

  console.log(`  Installed ${agentCount} agents to ${target.agentDir}`);
}

// Optional hook installation (--hooks flag). Goes through flagValue so
// `--hooks=false` correctly disables; bare `--hooks` and `--hooks=true`
// both enable (flagValue coerces "true"/"false" literals to booleans).
const installHooks = flagValue("hooks") === true;

if (installHooks) {
  console.log("\nInstalling hooks...");
  const hooksSource = join(__dirname, "skills", "wicked-brain-agent", "hooks");

  for (const target of targets) {
    const hookFile = join(hooksSource, `${target.platform}-hooks.json`);
    if (!existsSync(hookFile)) {
      console.log(`  No hook template for ${target.name}, skipping`);
      continue;
    }
    // Note: hook installation is platform-specific and may need merging
    // with existing hooks. For now, just report what would be installed.
    console.log(`  Hook template available for ${target.name}: ${hookFile}`);
    console.log(`  To install: merge into your ${target.name} hook config manually`);
  }
}

// Register as a wicked-bus provider if bus is available
try {
  const { openDb, resolveDbPath, register } = await import("wicked-bus");
  const busDbPath = resolveDbPath();
  const busDb = openDb(busDbPath);
  try {
    register(busDb, {
      plugin: "wicked-brain",
      role: "provider",
      filter: "wicked.*",
    });
    console.log("\nwicked-bus: registered wicked-brain as provider");
  } catch (err) {
    // Already registered or other non-fatal issue
    if (err.message && err.message.includes("UNIQUE")) {
      console.log("\nwicked-bus: wicked-brain already registered as provider");
    } else {
      console.log(`\nwicked-bus: could not register (${err.message})`);
    }
  }
  busDb.close();
} catch {
  console.log("\nwicked-bus: not available (install wicked-bus to enable event integration)");
}

// Server binary is bundled — npx wicked-brain-server works automatically
// Skills reference it as: npx wicked-brain-server --brain {path} --port {port}
console.log("\nServer: bundled (use 'npx wicked-brain-server' to start)");
console.log(`\nwicked-brain installed! Open your AI CLI and say "wicked-brain:init" to get started.`);
