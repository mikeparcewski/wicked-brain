import * as path from "node:path";
import { BrainHandle } from "../brain.js";

export async function runInit(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const targetDir = positional[0] ?? ".";
  const resolved = path.resolve(targetDir);
  const basename = path.basename(resolved);
  const name = typeof flags.name === "string" ? flags.name : basename;
  const id = typeof flags.id === "string" ? flags.id : basename;

  await BrainHandle.init(resolved, { id, name });

  if (flags.json) {
    process.stdout.write(
      JSON.stringify({ ok: true, dir: resolved, id, name }) + "\n"
    );
  } else {
    process.stdout.write(`Initialized brain at: ${resolved}\n  id:   ${id}\n  name: ${name}\n`);
  }
}
