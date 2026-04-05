import * as path from "node:path";
import { JobManager } from "../agent/job-manager.js";

export async function runJobs(
  _positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);
  const metaDir = path.join(resolvedBrain, "_meta");

  const manager = new JobManager(metaDir);
  const jobs = await manager.list();

  if (flags.json) {
    process.stdout.write(JSON.stringify(jobs, null, 2) + "\n");
    return;
  }

  if (jobs.length === 0) {
    process.stdout.write("No jobs found.\n");
    return;
  }

  process.stdout.write(`Jobs (${jobs.length}):\n\n`);
  for (const job of jobs) {
    const statusIcon =
      job.status === "completed" ? "✓" :
      job.status === "failed" ? "✗" :
      job.status === "cancelled" ? "⊘" :
      "⟳";
    process.stdout.write(`  ${statusIcon} ${job.job_id}\n`);
    process.stdout.write(`    operation: ${job.operation}\n`);
    process.stdout.write(`    status:    ${job.status}\n`);
    process.stdout.write(`    started:   ${job.started_at}\n`);
    if (job.completed_at) {
      process.stdout.write(`    finished:  ${job.completed_at}\n`);
    }
    if (job.error) {
      process.stdout.write(`    error:     ${job.error}\n`);
    }
    process.stdout.write("\n");
  }
}
