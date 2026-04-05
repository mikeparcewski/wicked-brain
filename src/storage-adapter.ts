import type { BrainPath } from "./brain-path.js";
import type { WriteReceipt, BatchResult, WriteOp, FileStat } from "./types.js";

export interface StorageAdapter {
  read(path: BrainPath): Promise<string>;
  write(path: BrainPath, content: string, opts?: { expectedHash?: string }): Promise<WriteReceipt>;
  delete(path: BrainPath): Promise<void>;
  exists(path: BrainPath): Promise<boolean>;
  list(dir: BrainPath, opts?: { pattern?: string; recursive?: boolean }): Promise<BrainPath[]>;
  mkdir(dir: BrainPath): Promise<void>;
  stat(path: BrainPath): Promise<FileStat>;
  batch(ops: WriteOp[]): Promise<BatchResult>;
}
