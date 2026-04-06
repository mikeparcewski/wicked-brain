#!/usr/bin/env node
// wicked-brain installer — detects CLIs and installs skills

import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const skillsSource = join(__dirname, "skills");
const home = homedir();

const CLI_TARGETS = [
  { name: "claude", dir: join(home, ".claude", "skills") },
  { name: "gemini", dir: join(home, ".gemini", "skills") },
  { name: "copilot", dir: join(home, ".github", "skills") },
  { name: "codex", dir: join(home, ".codex", "skills") },
  { name: "cursor", dir: join(home, ".cursor", "skills") },
];

// Detect which CLIs are installed by checking if parent dir exists
const detected = CLI_TARGETS.filter((t) => {
  const parentDir = resolve(t.dir, "..");
  return existsSync(parentDir);
});

console.log("wicked-brain installer\n");

if (detected.length === 0) {
  console.log("No supported AI CLIs detected. Supported: claude, gemini, copilot, codex, cursor");
  console.log("Install skills manually by copying the skills/ directory.");
  process.exit(1);
}

console.log(`Detected CLIs: ${detected.map((d) => d.name).join(", ")}\n`);

// Allow filtering via --cli flag
const cliArg = argv.find((a) => a.startsWith("--cli="));
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

// Install server globally
console.log("\nInstalling wicked-brain-server...");
try {
  // Check if already installed — npx resolves it without running
  const check = process.platform === "win32" ? "where wicked-brain-server" : "command -v wicked-brain-server";
  execSync(check, { stdio: "ignore" });
  console.log("  Server already installed");
} catch {
  try {
    // Try installing from npm (works when published)
    execSync("npm install -g wicked-brain-server", { stdio: "inherit" });
    console.log("  Server installed from npm");
  } catch {
    try {
      // Fall back to installing from bundled server/ directory
      const serverDir = join(__dirname, "server");
      if (existsSync(join(serverDir, "package.json"))) {
        execSync(`npm install -g ${serverDir}`, { stdio: "inherit" });
        console.log("  Server installed from local bundle");
      } else {
        throw new Error("no local server");
      }
    } catch {
      console.log("  Could not install server. Install manually:");
      console.log("    npm install -g wicked-brain-server");
    }
  }
}

console.log(`\nwicked-brain installed! Open your AI CLI and say "wicked-brain:init" to get started.`);
