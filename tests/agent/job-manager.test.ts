import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { JobManager } from "../../src/agent/job-manager.js";

let tmpDir: string;
let manager: JobManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-jobs-"));
  const metaDir = path.join(tmpDir, "_meta");
  manager = new JobManager(metaDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("JobManager", () => {
  describe("create", () => {
    it("creates a job with running status", async () => {
      const job = await manager.create("compile");
      expect(job.operation).toBe("compile");
      expect(job.status).toBe("running");
      expect(job.job_id).toMatch(/^op-compile-/);
      expect(job.started_at).toBeTruthy();
      expect(job.completed_at).toBeUndefined();
    });

    it("job ID contains ISO timestamp with colons replaced by dashes", async () => {
      const job = await manager.create("structure");
      // Should not contain colons in the timestamp portion
      expect(job.job_id).not.toContain(":");
      // Should start with op-structure-
      expect(job.job_id.startsWith("op-structure-")).toBe(true);
    });

    it("persists job to disk", async () => {
      const job = await manager.create("lint");
      const retrieved = await manager.getStatus(job.job_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.job_id).toBe(job.job_id);
    });
  });

  describe("getStatus", () => {
    it("returns null for non-existent job", async () => {
      const result = await manager.getStatus("op-nonexistent-2024-01-01T00-00-00.000Z");
      expect(result).toBeNull();
    });

    it("returns the job when it exists", async () => {
      const job = await manager.create("enhance");
      const result = await manager.getStatus(job.job_id);
      expect(result).not.toBeNull();
      expect(result!.operation).toBe("enhance");
      expect(result!.status).toBe("running");
    });
  });

  describe("complete", () => {
    it("marks job as completed with result", async () => {
      const job = await manager.create("query");
      await manager.complete(job.job_id, { answer: "42" });

      const updated = await manager.getStatus(job.job_id);
      expect(updated!.status).toBe("completed");
      expect(updated!.completed_at).toBeTruthy();
      expect(updated!.result).toEqual({ answer: "42" });
    });

    it("marks job as completed without result", async () => {
      const job = await manager.create("compile");
      await manager.complete(job.job_id);

      const updated = await manager.getStatus(job.job_id);
      expect(updated!.status).toBe("completed");
    });

    it("throws for non-existent job", async () => {
      await expect(manager.complete("nonexistent")).rejects.toThrow("Job not found");
    });
  });

  describe("fail", () => {
    it("marks job as failed with error message", async () => {
      const job = await manager.create("structure");
      await manager.fail(job.job_id, "Something went wrong");

      const updated = await manager.getStatus(job.job_id);
      expect(updated!.status).toBe("failed");
      expect(updated!.error).toBe("Something went wrong");
      expect(updated!.completed_at).toBeTruthy();
    });

    it("throws for non-existent job", async () => {
      await expect(manager.fail("nonexistent", "error")).rejects.toThrow("Job not found");
    });
  });

  describe("cancel", () => {
    it("marks job as cancelled", async () => {
      const job = await manager.create("lint");
      await manager.cancel(job.job_id);

      const updated = await manager.getStatus(job.job_id);
      expect(updated!.status).toBe("cancelled");
      expect(updated!.completed_at).toBeTruthy();
    });

    it("throws for non-existent job", async () => {
      await expect(manager.cancel("nonexistent")).rejects.toThrow("Job not found");
    });
  });

  describe("list", () => {
    it("returns empty array when no jobs", async () => {
      const jobs = await manager.list();
      expect(jobs).toEqual([]);
    });

    it("returns all jobs", async () => {
      await manager.create("compile");
      await manager.create("lint");
      await manager.create("structure");

      const jobs = await manager.list();
      expect(jobs).toHaveLength(3);
    });

    it("sorts jobs by started_at descending (newest first)", async () => {
      const job1 = await manager.create("compile");
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      const job2 = await manager.create("lint");
      await new Promise((r) => setTimeout(r, 10));
      const job3 = await manager.create("structure");

      const jobs = await manager.list();
      expect(jobs[0].job_id).toBe(job3.job_id);
      expect(jobs[1].job_id).toBe(job2.job_id);
      expect(jobs[2].job_id).toBe(job1.job_id);
    });

    it("includes jobs of all statuses", async () => {
      const j1 = await manager.create("compile");
      const j2 = await manager.create("lint");
      const _j3 = await manager.create("enhance"); // stays "running"
      await manager.complete(j1.job_id, {});
      await manager.fail(j2.job_id, "error");

      const jobs = await manager.list();
      const statuses = jobs.map((j) => j.status);
      expect(statuses).toContain("running");
      expect(statuses).toContain("completed");
      expect(statuses).toContain("failed");
    });
  });
});
