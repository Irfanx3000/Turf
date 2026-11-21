import { Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ZodBody } from "../common/decorators/zod-body.decorator.js";
import { Public } from "../common/guards/public.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { loginSchema, registerOwnerSchema, registerSchema } from "@turf/validation";
import type { AuthenticatedUser } from "@turf/shared-types";
import { AuthService } from "./auth.service.js";

const SESSION_COOKIE = "turf_session";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @HttpCode(201)
  @ApiOperation({ summary: "Register a customer account" })
  async register(
    @ZodBody(registerSchema) input: ReturnType<typeof registerSchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(input, req.requestId);
    if (result.accessToken) setSessionCookie(res, result.accessToken);
    return result;
  }

  @Public()
  @Post("register-owner")
  @HttpCode(201)
  @ApiOperation({ summary: "Register a tenant owner account and their first organization" })
  async registerOwner(
    @ZodBody(registerOwnerSchema) input: ReturnType<typeof registerOwnerSchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { auth, tenantId } = await this.auth.registerOwner(input, req.requestId);
    if (auth.accessToken) setSessionCookie(res, auth.accessToken);
    return { ...auth, tenantId };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in with email + password" })
  async login(
    @ZodBody(loginSchema) input: ReturnType<typeof loginSchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(input.email, input.password, req.requestId);
    if (result.accessToken) setSessionCookie(res, result.accessToken);
    return result;
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax" });
    return { ok: true };
  }

  @Get("me")
  @ApiOperation({ summary: "Current identity: profile + tenant memberships" })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60 * 1000,
  });
}
