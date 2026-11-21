import { Injectable, LoggerService as NestLoggerService } from "@nestjs/common";
import pino from "pino";
import { ENV } from "../../config/configuration.js";

const base = pino({
  level: ENV.LOG_LEVEL,
  base: { app: "turf-api", env: ENV.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "*.password",
      "*.token",
      "*.access_token",
      "*.refresh_token",
    ],
    censor: "[redacted]",
  },
  ...(ENV.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } }
    : {}),
});

@Injectable()
export class AppLogger implements NestLoggerService {
  log(msg: string, context?: string) { base.info({ context }, msg); }
  error(msg: string, trace?: string, context?: string) { base.error({ context, trace }, msg); }
  warn(msg: string, context?: string) { base.warn({ context }, msg); }
  debug(msg: string, context?: string) { base.debug({ context }, msg); }
  verbose(msg: string, context?: string) { base.trace({ context }, msg); }
}

export const logger = base;
export type Logger = typeof base;
