import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";

export function contentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function fileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");
  return contentHash(content);
}
