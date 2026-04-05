#!/usr/bin/env node
import { argv } from "node:process";
const args = argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const brainPath = getArg("brain") || ".";
const port = parseInt(getArg("port") || "4242", 10);
console.log(`fs-brain-server: brain=${brainPath} port=${port}`);
