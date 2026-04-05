import * as path from "node:path";
import { BrainHandle } from "../brain.js";
import { createOperationAgent } from "../agent/operations.js";
import { JobManager } from "../agent/job-manager.js";

export async function runStructure(
  _positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);

  if (flags["dry-run"]) {
    process.stdout.write(
      `[dry-run] Would run structure agent on brain at: ${resolvedBrain}\n`
    );
    return;
  }

  const brain = await BrainHandle.open(resolvedBrain);
  await brain.lock.acquire("structure");
  const jobManager = new JobManager(path.join(resolvedBrain, "_meta"));
  const job = await jobManager.create("structure");

  try {
    process.stdout.write(`Starting structure job ${job.job_id}...\n`);

    const agent = createOperationAgent(brain, "structure");

    // Subscribe for real-time progress output
    agent.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        process.stdout.write(`  [tool] ${event.toolName}(${JSON.stringify(event.args)})\n`);
      } else if (event.type === "message_end") {
        process.stdout.write("  [turn complete]\n");
      } else if (event.type === "agent_end") {
        process.stdout.write("  [agent finished]\n");
      }
    });

    const prompt =
      "Analyze and improve the structure of this brain. " +
      "Review the organization of wiki articles, check for missing links, " +
      "and suggest or apply improvements to the knowledge hierarchy.";

    await agent.prompt(prompt);
    await agent.waitForIdle();

    await jobManager.complete(job.job_id, { messages: agent.state.messages.length });
    process.stdout.write(`Structure job ${job.job_id} completed.\n`);
  } catch (err) {
    await jobManager.fail(job.job_id, (err as Error).message);
    process.stdout.write(`Structure job ${job.job_id} failed: ${(err as Error).message}\n`);
    throw err;
  } finally {
    await brain.lock.release();
    brain.close();
  }
}
