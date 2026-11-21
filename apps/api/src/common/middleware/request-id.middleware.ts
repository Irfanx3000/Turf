import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header("x-request-id");
    const id = incoming && incoming.length <= 64 ? incoming : randomUUID();
    req.requestId = id;
    res.setHeader("x-request-id", id);
    next();
  }
}
