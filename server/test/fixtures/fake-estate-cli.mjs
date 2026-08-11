#!/usr/bin/env node
// Fake `wicked-estate` CLI for tests. Supports only the subcommand the import
// driver uses:
//
//   wicked-estate import-telemetry <file.json> --db <path>
//
// Prints the same summary line as the real binary so the driver's parser is
// exercised. Appends the parsed payload to $FAKE_ESTATE_CLI_LOG when set.

import { readFileSync, appendFileSync } from "node:fs";

const argv = process.argv.slice(2);
if (argv.length === 0) {
  // Loaded by a bare `node --test` glob (everything under test/ matches):
  // exit clean so the runner records an empty passing file, not a failure.
  process.exit(0);
}
if (argv[0] !== "import-telemetry") {
  process.stderr.write(`fake-estate-cli: unknown command ${argv[0]}\n`);
  process.exit(2);
}
const file = argv[1];
const dbIdx = argv.indexOf("--db");
const db = dbIdx >= 0 ? argv[dbIdx + 1] : "(default)";

const payload = JSON.parse(readFileSync(file, "utf-8"));
const a = (payload.access_log ?? []).length;
const m = (payload.search_misses ?? []).length;

if (process.env.FAKE_ESTATE_CLI_LOG) {
  appendFileSync(
    process.env.FAKE_ESTATE_CLI_LOG,
    JSON.stringify({ file, db, payload }) + "\n",
    "utf-8",
  );
}

process.stdout.write(
  `import-telemetry: imported ${a} access-log row(s), ${m} search-miss(es) into ${db}\n`,
);
