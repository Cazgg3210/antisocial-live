/**
 * Next.js instrumentation hook: starts the in-process job runner once per server instance.
 * Jobs are idempotent and lock rows, so running on several instances is safe.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startJobRunner } = await import("./lib/jobs");
  startJobRunner();
}
