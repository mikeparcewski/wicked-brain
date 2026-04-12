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

const CLI_TARGETS = [
  { name: "claude",      dir: join(home, ".claude", "skills"),      agentDir: join(home, ".claude", "agents"),      agentSubdir: "agents", platform: "claude" },
  { name: "gemini",      dir: join(home, ".gemini", "skills"),      agentDir: join(home, ".gemini", "agents"),      agentSubdir: "agents", platform: "gemini" },
  { name: "copilot",     dir: join(home, ".github", "skills"),      agentDir: join(home, ".github", "agents"),      agentSubdir: "agents", platform: "copilot" },
  { name: "codex",       dir: join(home, ".codex", "skills"),       agentDir: join(home, ".codex", "agents"),       agentSubdir: "agents", platform: "codex" },
  { name: "cursor",      dir: join(home, ".cursor", "skills"),      agentDir: join(home, ".cursor", "agents"),      agentSubdir: "agents", platform: "cursor" },
  { name: "kiro",        dir: join(home, ".kiro", "skills"),        agentDir: join(home, ".kiro", "agents"),        agentSubdir: "agents", platform: "kiro" },
  { name: "antigravity", dir: join(home, ".antigravity", "skills"), agentDir: join(home, ".antigravity", "rules"),  agentSubdir: "rules",  platform: "antigravity" },
];

console.log("wicked-brain installer\n");

const args = argv.slice(2);
const argValue = (a) => a.split("=")[1];
const cliArg = args.find((a) => a.startsWith("--cli="));
const pathArg = args.find((a) => a.startsWith("--path="));

let targets;

if (pathArg) {
  const rawPath = argValue(pathArg);
  if (!rawPath) {
    console.error("Error: --path requires a value (e.g. --path=~/.claude)");
    process.exit(1);
  }
  const customPath = resolve(rawPath.replace(/^~/, home));
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
} else {
  // Detect which CLIs are installed by checking if parent dir exists
  const detected = CLI_TARGETS.filter((t) => existsSync(resolve(t.dir, "..")));

  if (detected.length === 0) {
    console.log("No supported AI CLIs detected. Supported: claude, gemini, copilot, codex, cursor, kiro, antigravity");
    console.log("Install skills manually by copying the skills/ directory.");
    process.exit(1);
  }

  console.log(`Detected CLIs: ${detected.map((d) => d.name).join(", ")}\n`);

  const cliFilter = cliArg ? argValue(cliArg).split(",") : null;
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

// Optional hook installation (--hooks flag)
const installHooks = args.includes("--hooks");

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
