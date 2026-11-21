import { Controller, Delete, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { pushSubscriptionSchema } from "@turf/validation";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "@turf/shared-types";
import { PushService } from "./push.service.js";

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

@ApiTags("push")
@Controller("push")
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get("vapid-public-key")
  @ApiOperation({ summary: "VAPID public key for browser subscription (null when push is not configured)" })
  key() {
    return { vapidPublicKey: this.push.vapidPublicKey() };
  }

  @Post("subscribe")
  @ApiOperation({ summary: "Register a Web Push subscription for the caller" })
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(pushSubscriptionSchema) input: z.infer<typeof pushSubscriptionSchema>,
  ) {
    return this.push.subscribe(user.id, input);
  }

  @Delete("subscribe")
  @ApiOperation({ summary: "Remove a Web Push subscription" })
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @ZodBody(unsubscribeSchema) input: z.infer<typeof unsubscribeSchema>) {
    return this.push.unsubscribe(user.id, input.endpoint);
  }
}
