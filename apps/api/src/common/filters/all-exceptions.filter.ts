import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../logging/logger.service.js";

const CODES: Array<[HttpStatus, string]> = [
  [HttpStatus.BAD_REQUEST, "BAD_REQUEST"],
  [HttpStatus.UNAUTHORIZED, "UNAUTHORIZED"],
  [HttpStatus.FORBIDDEN, "FORBIDDEN"],
  [HttpStatus.NOT_FOUND, "NOT_FOUND"],
  [HttpStatus.CONFLICT, "CONFLICT"],
  [HttpStatus.GONE, "GONE"],
  [HttpStatus.UNPROCESSABLE_ENTITY, "UNPROCESSABLE"],
  [HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED"],
  [HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL"],
];

function codeFor(status: number): string {
  return CODES.find(([s]) => s === status)?.[1] ?? "ERROR";
}

/** Never leaks stack traces or driver errors to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly nestLogger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = req.requestId ?? "unknown";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let errorCode = "INTERNAL";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorCode = codeFor(status);
      const body = exception.getResponse();
      if (typeof body === "string") message = body;
      else if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        if ("message" in b) {
          const m = b.message;
          message = Array.isArray(m) ? (m as string[]) : String(m);
        }
        // Domain codes (EMAIL_UNCONFIRMED, SERVICE_UNAVAILABLE, …) travel on
        // the exception body; fall back to the status-derived code otherwise.
        if (typeof b.errorCode === "string" && b.errorCode.length > 0) {
          errorCode = b.errorCode;
        }
      }
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      errorCode = "VALIDATION_ERROR";
      message = exception.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
    }

    if (status >= 500) {
      logger.error({ requestId, url: req.url, err: exception }, "unhandled exception");
    } else {
      logger.warn({ requestId, url: req.url, status, errorCode }, "request failed");
    }

    res.status(status).json({
      statusCode: status,
      message,
      errorCode,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
