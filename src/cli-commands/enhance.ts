import * as path from "node:path";
import { BrainHandle } from "../brain.js";
import { createOperationAgent } from "../agent/operations.js";
import { JobManager } from "../agent/job-manager.js";

export async function runEnhance(
  _positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);

  if (flags["dry-run"]) {
    process.stdout.write(
      `[dry-run] Would run enhance agent on brain at: ${resolvedBrain}\n`
    );
    return;
  }

  const brain = await BrainHandle.open(resolvedBrain);
  await brain.lock.acquire("enhance");
  const jobManager = new JobManager(path.join(resolvedBrain, "_meta"));
  const job = await jobManager.create("enhance");

  try {
    process.stdout.write(`Starting enhance job ${job.job_id}...\n`);

    const agent = createOperationAgent(brain, "enhance");

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
      "Enhance the quality and depth of knowledge in this brain. " +
      "Find gaps in information, expand thin articles, resolve references, " +
      "and improve the overall quality of the knowledge base.";

    await agent.prompt(prompt);
    await agent.waitForIdle();

    await jobManager.complete(job.job_id, { messages: agent.state.messages.length });
    process.stdout.write(`Enhance job ${job.job_id} completed.\n`);
  } catch (err) {
    await jobManager.fail(job.job_id, (err as Error).message);
    process.stdout.write(`Enhance job ${job.job_id} failed: ${(err as Error).message}\n`);
    throw err;
  } finally {
    await brain.lock.release();
    brain.close();
  }
}
