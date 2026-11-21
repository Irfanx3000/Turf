import { Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { createPaymentOrderSchema } from "@turf/validation";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { TenantCtx, TenantRoles } from "../common/decorators/tenant-roles.decorator.js";
import { TenantMemberGuard } from "../common/guards/tenant-member.guard.js";
import { Public } from "../common/guards/public.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "@turf/shared-types";
import { DbService } from "../database/db-tokens.js";
import { PaymentsService } from "./payments.service.js";

const mockPaySchema = z.object({ orderId: z.string().min(6).max(80).optional(), bookingId: z.string().uuid().optional() }).refine((v) => v.orderId || v.bookingId, "orderId or bookingId required");
const reconcileSchema = z.object({ graceSeconds: z.number().int().min(30).max(86_400).optional() });

@ApiTags("payments")
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly db: DbService,
  ) {}

  /**
   * Gateway webhook. Signature is verified against the RAW body, so this
   * route must receive unparsed bytes — the raw-body capture is done by the
   * express raw middleware configured for this path.
   */
  @Public()
  @Post("payments/webhook/:provider")
  @ApiOperation({ summary: "Payment gateway webhook (signature-verified, idempotent)" })
  webhook(
    @Param("provider") provider: string,
    @Headers("x-razorpay-signature") signature: string | null,
    @Req() req: Request,
  ) {
    const raw = (req as Request & { rawBody?: string }).rawBody;
    if (!raw) {
      // Fallback for JSON-parsed bodies (should not happen with raw middleware).
      return this.payments.handleWebhook(provider, JSON.stringify(req.body ?? {}), signature);
    }
    return this.payments.handleWebhook(provider, raw, signature);
  }

  /** Dev-only mock checkout: pays an order through the signed webhook path. */
  @Post("payments/mock/pay")
  @ApiOperation({ summary: "DEV ONLY — mock gateway checkout; requires the booking owner" })
  mockPay(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(mockPaySchema) input: z.infer<typeof mockPaySchema>,
    @Req() req: Request,
  ) {
    return this.payments.mockPay({ orderId: input.orderId, bookingId: input.bookingId }, user.id, req.requestId);
  }

  @Post("payments/orders")
  @ApiOperation({ summary: "Create/retry a payment order for the caller's pending booking" })
  createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(createPaymentOrderSchema) input: z.infer<typeof createPaymentOrderSchema>,
    @Req() req: Request,
  ) {
    return this.payments.createOrderForBooking(user.id, input.bookingId, req.requestId);
  }

  @Get("tenants/:tenantId/payments")
  @UseGuards(TenantMemberGuard)
  @ApiOperation({ summary: "Tenant collections: online vs venue money (staff+)" })
  listForTenant(@TenantCtx() ctx: { tenantId: string }) {
    return this.payments.listForTenant(ctx.tenantId);
  }

  @Post("tenants/:tenantId/payments/:paymentId/collect")
  @UseGuards(TenantMemberGuard)
  @TenantRoles("staff")
  @ApiOperation({ summary: "Mark a pay-at-venue payment as collected at the counter" })
  markCollected(
    @TenantCtx() ctx: { tenantId: string },
    @CurrentUser() user: AuthenticatedUser,
    @Param("paymentId", ParseUUIDPipe) paymentId: string,
    @Req() req: Request,
  ) {
    return this.payments.markVenueCollected(ctx.tenantId, user.id, paymentId, req.requestId);
  }

  @Post("admin/payments/reconcile")
  @Roles("super_admin")
  @ApiOperation({ summary: "Reconcile stale pending payments against the gateway (super admin)" })
  reconcile(@ZodBody(reconcileSchema) input: z.infer<typeof reconcileSchema>, @Req() req: Request) {
    return this.payments.reconcile(input.graceSeconds ?? 300, req.requestId);
  }
}
