#!/usr/bin/env node
// wicked-brain installer — detects CLIs and installs skills + agents

import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const skillsSource = join(__dirname, "skills");
const home = homedir();

const CLI_TARGETS = [
  { name: "claude", dir: join(home, ".claude", "skills"), agentDir: join(home, ".claude", "agents"), platform: "claude" },
  { name: "gemini", dir: join(home, ".gemini", "skills"), agentDir: join(home, ".gemini", "agents"), platform: "gemini" },
  { name: "copilot", dir: join(home, ".github", "skills"), agentDir: join(home, ".github", "agents"), platform: "copilot" },
  { name: "codex", dir: join(home, ".codex", "skills"), agentDir: join(home, ".codex", "agents"), platform: "codex" },
  { name: "cursor", dir: join(home, ".cursor", "skills"), agentDir: join(home, ".cursor", "agents"), platform: "cursor" },
  { name: "kiro", dir: join(home, ".kiro", "skills"), agentDir: join(home, ".kiro", "agents"), platform: "kiro" },
  { name: "antigravity", dir: join(home, ".antigravity", "skills"), agentDir: join(home, ".antigravity", "rules"), platform: "antigravity" },
];

// Detect which CLIs are installed by checking if parent dir exists
const detected = CLI_TARGETS.filter((t) => {
  const parentDir = resolve(t.dir, "..");
  return existsSync(parentDir);
});

console.log("wicked-brain installer\n");

if (detected.length === 0) {
  console.log("No supported AI CLIs detected. Supported: claude, gemini, copilot, codex, cursor, kiro, antigravity");
  console.log("Install skills manually by copying the skills/ directory.");
  process.exit(1);
}

console.log(`Detected CLIs: ${detected.map((d) => d.name).join(", ")}\n`);

// Allow filtering via --cli flag
const args = argv.slice(2);
const cliArg = args.find((a) => a.startsWith("--cli="));
const cliFilter = cliArg ? cliArg.split("=")[1].split(",") : null;
const targets = cliFilter
  ? detected.filter((d) => cliFilter.includes(d.name))
  : detected;

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

// Server binary is bundled — npx wicked-brain-server works automatically
// Skills reference it as: npx wicked-brain-server --brain {path} --port {port}
console.log("\nServer: bundled (use 'npx wicked-brain-server' to start)");
console.log(`\nwicked-brain installed! Open your AI CLI and say "wicked-brain:init" to get started.`);
