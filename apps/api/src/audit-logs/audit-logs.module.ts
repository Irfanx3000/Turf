import { Module } from "@nestjs/common";
// The audit writer is a plain helper (audit.helper.ts) used by all services;
// admin read access lives in the admin module. This module exists to keep the
// domain boundary explicit and to host future audit tooling.

@Module({})
export class AuditLogsModule {}
