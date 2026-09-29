import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";
import { logger } from "./logger";
import { ScoringError } from "@/modules/scoring-engine";

type Handler<T> = (ctx: { req: Request; requestId: string; params: T }) => Promise<Response>;

/** Wraps a route handler with request id, error mapping and structured logging. */
export function route<T = Record<string, string>>(handler: Handler<T>) {
  return async (req: Request, ctx: { params: Promise<T> }): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    const started = Date.now();
    try {
      const params = await ctx.params;
      const res = await handler({ req, requestId, params });
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      return errorResponse(err, requestId);
    } finally {
      logger.debug({ requestId, method: req.method, url: req.url, ms: Date.now() - started }, "request");
    }
  };
}

export function errorResponse(err: unknown, requestId: string): Response {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details }, requestId },
      { status: err.status, headers: { "x-request-id": requestId } },
    );
  }
  if (err instanceof ScoringError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details }, requestId },
      { status: 422, headers: { "x-request-id": requestId } },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: `Invalid input: ${err.issues.map((i) => `${i.path.join(".") || "body"} ${i.message}`).join("; ")}`, details: { issues: err.issues } }, requestId },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }
  logger.error({ err, requestId }, "unhandled error");
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Internal error" }, requestId },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const json = await req.json().catch(() => {
    throw new AppError("VALIDATION", "Body must be valid JSON");
  });
  return schema.parse(json);
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
