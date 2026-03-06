import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import express from "express";
import { clerkMiddleware } from "@ringee/platform";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: [apiConfiguration.FRONTEND_URL, 'https://phone.ringee.io', 'http://localhost:4201', 'http://localhost:4200'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  app.use("/webhooks/clerk", express.raw({ type: "application/json" }));

  app.setGlobalPrefix("api");

  app.use(clerkMiddleware());

  await app.listen(apiConfiguration.PORT, () => {
    console.log(`🚀 Server running on port ${apiConfiguration.PORT}`);
  });
}
bootstrap();
