import "reflect-metadata";
// Load .env before any module parses environment variables.
import { loadEnvFile } from "@turf/config";
loadEnvFile();
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { ENV, corsOriginsFor } from "./config/configuration.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(helmet({ contentSecurityPolicy: ENV.NODE_ENV !== "production" ? false : undefined }));
  app.use(cookieParser());

  // Webhooks need the RAW body for HMAC signature verification. Capture it
  // before any JSON parser touches the request.
  app.use("/api/v1/payments/webhook", express.raw({ type: "*/*", limit: "256kb" }));
  app.enableCors({ origin: corsOriginsFor(), credentials: true, exposedHeaders: ["x-request-id"] });
  app.setGlobalPrefix("api/v1");

  // Validation is done with Zod pipes (@ZodBody / @ZodQuery) — see packages/validation.
  app.useGlobalFilters(new AllExceptionsFilter());

  const swagger = new DocumentBuilder()
    .setTitle("Turf Booking API")
    .setDescription("Multi-tenant turf booking platform. Money is always integer minor units (paise).")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/v1/docs", app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  new Logger("bootstrap").log(`API listening on :${port}/api/v1 (docs at /api/v1/docs)`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
