export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "FROZEN"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
  FROZEN: 423,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`);
export const forbidden = (msg = "Forbidden") => new AppError("FORBIDDEN", msg);
export const unauthorized = (msg = "Unauthorized") => new AppError("UNAUTHORIZED", msg);
export const invalidTransition = (msg: string, details?: Record<string, unknown>) =>
  new AppError("INVALID_TRANSITION", msg, details);
