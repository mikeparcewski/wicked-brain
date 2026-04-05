import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface Job {
  job_id: string;
  operation: string;
  status: "running" | "completed" | "failed" | "cancelled";
  started_at: string;
  completed_at?: string;
  result?: unknown;
  error?: string;
}

export class JobManager {
  private readonly jobsDir: string;

  constructor(metaDir: string) {
    this.jobsDir = path.join(metaDir, "jobs");
  }

  private jobPath(jobId: string): string {
    return path.join(this.jobsDir, `${jobId}.json`);
  }

  private makeJobId(operation: string): string {
    const ts = new Date().toISOString().replace(/:/g, "-");
    return `op-${operation}-${ts}`;
  }

  async create(operation: string): Promise<Job> {
    await fs.mkdir(this.jobsDir, { recursive: true });

    const job: Job = {
      job_id: this.makeJobId(operation),
      operation,
      status: "running",
      started_at: new Date().toISOString(),
    };

    await fs.writeFile(this.jobPath(job.job_id), JSON.stringify(job, null, 2), "utf-8");
    return job;
  }

  async getStatus(jobId: string): Promise<Job | null> {
    try {
      const content = await fs.readFile(this.jobPath(jobId), "utf-8");
      return JSON.parse(content) as Job;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async complete(jobId: string, result?: unknown): Promise<void> {
    const job = await this.getStatus(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const updated: Job = {
      ...job,
      status: "completed",
      completed_at: new Date().toISOString(),
      result,
    };

    await fs.writeFile(this.jobPath(jobId), JSON.stringify(updated, null, 2), "utf-8");
  }

  async fail(jobId: string, error: string): Promise<void> {
    const job = await this.getStatus(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const updated: Job = {
      ...job,
      status: "failed",
      completed_at: new Date().toISOString(),
      error,
    };

    await fs.writeFile(this.jobPath(jobId), JSON.stringify(updated, null, 2), "utf-8");
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.getStatus(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const updated: Job = {
      ...job,
      status: "cancelled",
      completed_at: new Date().toISOString(),
    };

    await fs.writeFile(this.jobPath(jobId), JSON.stringify(updated, null, 2), "utf-8");
  }

  async list(): Promise<Job[]> {
    try {
      const entries = await fs.readdir(this.jobsDir);
      const jobs: Job[] = [];

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        try {
          const content = await fs.readFile(path.join(this.jobsDir, entry), "utf-8");
          jobs.push(JSON.parse(content) as Job);
        } catch {
          // skip malformed job files
        }
      }

      // Sort by started_at descending
      jobs.sort((a, b) => b.started_at.localeCompare(a.started_at));
      return jobs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }
}
