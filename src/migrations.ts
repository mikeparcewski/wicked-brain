import { CURRENT_SCHEMA } from "./types.js";

export type MigrationFn = (brainRoot: string) => Promise<void>;
const migrations = new Map<number, MigrationFn>();
// No migrations yet — schema 1 is first version

export function getMigrations(fromSchema: number): MigrationFn[] {
  const fns: MigrationFn[] = [];
  for (let v = fromSchema + 1; v <= CURRENT_SCHEMA; v++) {
    const fn = migrations.get(v);
    if (fn) fns.push(fn);
  }
  return fns;
}

export function needsMigration(schema: number): boolean {
  return schema < CURRENT_SCHEMA;
}
