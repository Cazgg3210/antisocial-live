import { logger } from "./logger";

type Job = { name: string; everyMs: number; run: () => Promise<unknown> };

const g = globalThis as unknown as { jobRunnerStarted?: boolean };

/**
 * Minimal in-process scheduler (interface point for a future queue). Each job runs serially,
 * errors are logged and never crash the server.
 */
export function startJobRunner(): void {
  if (g.jobRunnerStarted) return;
  g.jobRunnerStarted = true;
  const jobs: Job[] = [
    {
      name: "timers.tick",
      everyMs: 5000,
      run: async () => (await import("@/modules/events/service")).tickTimers(),
    },
    {
      name: "grace.settle",
      everyMs: 1000,
      run: async () => (await import("@/modules/events/service")).settleGracePeriods(),
    },
  ];
  for (const job of jobs) {
    let running = false;
    setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        logger.error({ err, job: job.name }, "job failed");
      } finally {
        running = false;
      }
    }, job.everyMs).unref();
  }
  logger.info({ jobs: jobs.map((j) => j.name) }, "job runner started");
}
