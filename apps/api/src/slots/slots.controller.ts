import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { slotTemplateSchema } from "@turf/validation";
import { hhmm, isoDateTimeUtc, moneyMinor } from "@turf/validation";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { ZodQuery } from "../common/decorators/zod-query.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { TenantCtx, TenantRoles } from "../common/decorators/tenant-roles.decorator.js";
import { TenantMemberGuard } from "../common/guards/tenant-member.guard.js";
import type { AuthenticatedUser } from "@turf/shared-types";
import { SlotsService } from "./slots.service.js";

const generateSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
});

const blockSchema = z.object({
  startsAt: isoDateTimeUtc,
  endsAt: isoDateTimeUtc,
  reason: z.string().max(200).optional(),
});

const slotsQuery = z.object({
  from: isoDateTimeUtc,
  to: isoDateTimeUtc,
  statuses: z.string().optional(),
});

const templateInput = slotTemplateSchema.omit({ turfId: true });

const pricingRuleSchemaLocal = z.object({
  ruleType: z.enum(["base", "weekend", "peak_hours", "special_date"]),
  name: z.string().min(2).max(120),
  daysOfWeek: z.array(z.string().max(10)).optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  specialDate: z.string().date().optional(),
  multiplierPercent: z.number().int().min(1).max(1000).optional(),
  priceOverrideMinor: moneyMinor.optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

@ApiTags("slots")
@Controller("tenants/:tenantId/turfs/:turfId")
@UseGuards(TenantMemberGuard)
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get("slot-templates")
  @ApiOperation({ summary: "List slot templates (staff+)" })
  templates(@TenantCtx() ctx: { tenantId: string }, @Param("turfId", ParseUUIDPipe) turfId: string) {
    return this.slots.listTemplates(ctx.tenantId, turfId);
  }

  @Post("slot-templates")
  @TenantRoles("manager")
  @ApiOperation({ summary: "Create a slot template (manager+)" })
  createTemplate(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodBody(templateInput) input: z.infer<typeof templateInput>,
    @Req() req: Request,
  ) {
    return this.slots.upsertTemplate(ctx.tenantId, user.id, turfId, input, req.requestId);
  }

  @Delete("slot-templates/:templateId")
  @TenantRoles("manager")
  deleteTemplate(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Req() req: Request,
  ) {
    return this.slots.deleteTemplate(ctx.tenantId, user.id, turfId, templateId, req.requestId);
  }

  @Post("slots/generate")
  @TenantRoles("manager")
  @ApiOperation({ summary: "Materialize slots from templates for a date range (manager+, idempotent)" })
  generate(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodBody(generateSchema) input: z.infer<typeof generateSchema>,
    @Req() req: Request,
  ) {
    return this.slots.generate(ctx.tenantId, user.id, turfId, input, req.requestId);
  }

  @Get("slots")
  @ApiOperation({ summary: "Slot calendar for a window (staff+)" })
  listSlots(
    @TenantCtx() ctx: { tenantId: string },
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodQuery(slotsQuery) query: z.infer<typeof slotsQuery>,
  ) {
    const statuses = query.statuses ? query.statuses.split(",").map((s) => s.trim()) : undefined;
    return this.slots.listSlots(ctx.tenantId, turfId, new Date(query.from), new Date(query.to), statuses);
  }

  @Post("slot-blocks")
  @TenantRoles("manager")
  @ApiOperation({ summary: "Block a time window (manager+); available slots become blocked" })
  createBlock(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodBody(blockSchema) input: z.infer<typeof blockSchema>,
    @Req() req: Request,
  ) {
    return this.slots.createBlock(ctx.tenantId, user.id, turfId, input, req.requestId);
  }

  @Delete("slot-blocks/:blockId")
  @TenantRoles("manager")
  removeBlock(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @Param("blockId", ParseUUIDPipe) blockId: string,
    @Req() req: Request,
  ) {
    return this.slots.removeBlock(ctx.tenantId, user.id, turfId, blockId, req.requestId);
  }

  @Get("pricing-rules")
  @ApiOperation({ summary: "List pricing rules (staff+)" })
  pricingRules(@TenantCtx() ctx: { tenantId: string }, @Param("turfId", ParseUUIDPipe) turfId: string) {
    return this.slots.listPricingRules(ctx.tenantId, turfId);
  }

  @Post("pricing-rules")
  @TenantRoles("manager")
  @ApiOperation({ summary: "Create a pricing rule (manager+)" })
  createPricingRule(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @ZodBody(pricingRuleSchemaLocal) input: z.infer<typeof pricingRuleSchemaLocal>,
    @Req() req: Request,
  ) {
    return this.slots.upsertPricingRule(ctx.tenantId, user.id, turfId, input, req.requestId);
  }

  @Delete("pricing-rules/:ruleId")
  @TenantRoles("manager")
  deletePricingRule(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("turfId", ParseUUIDPipe) turfId: string,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @Req() req: Request,
  ) {
    return this.slots.deletePricingRule(ctx.tenantId, user.id, turfId, ruleId, req.requestId);
  }
}
