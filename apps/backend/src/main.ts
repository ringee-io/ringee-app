import "dotenv/config";

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import express from "express";
import { clerkMiddleware } from "@ringee/platform";
import { sdkCors } from "./api/sdk/sdk-cors";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  if (apiConfiguration.TRUST_PROXY_HOPS > 0) {
    // Use req.ip only after Express has been told exactly how many proxy hops
    // are trusted. Trusting arbitrary forwarded headers would let attackers
    // rotate a spoofed IP and bypass the Stripe abuse limiter.
    app
      .getHttpAdapter()
      .getInstance()
      .set("trust proxy", apiConfiguration.TRUST_PROXY_HOPS);
  }

  // Dynamic, non-credentialed CORS for the browser Dialer SDK (`/api/v1/sdk/*`).
  // Registered BEFORE the static credentialed CORS so it owns SDK preflights.
  app.use(sdkCors);

  app.enableCors({
    origin: [
      apiConfiguration.FRONTEND_URL,
      "https://phone.ringee.io",
      "http://localhost:4201",
      "http://localhost:4200",
      "http://localhost:8081",
      "http://localhost:19006",
      // MCP connectors (claude.ai, chatgpt.com) — needed if their UI ever
      // makes a browser-side request to our /api/mcp endpoints.
      "https://api.claude.ai",
      "https://chatgpt.com",
      "https://api.chatgpt.com",
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  app.use("/webhooks/clerk", express.raw({ type: "application/json" }));

  app.setGlobalPrefix("api", {
    // Verification crawlers (e.g. OpenAI Apps SDK domain check) fetch the
    // `.well-known` challenge at the bare hostname root, not under `/api`.
    exclude: [
      {
        path: ".well-known/openai-apps-challenge",
        method: RequestMethod.GET,
      },
    ],
  });

  app.use(clerkMiddleware());

  // Both WebSocket servers self-attach to this HTTP server from their
  // `onApplicationBootstrap` hooks: the Telnyx media stream on /media-stream
  // and the per-user events gateway on /ws/user-events. Each one claims only
  // its own path on the shared `upgrade` event.

  await app.listen(apiConfiguration.PORT, () => {
    console.log(`🚀 Server running on port ${apiConfiguration.PORT}`);
  });
}
bootstrap();
