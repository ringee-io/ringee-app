import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    WorkerModule,
    {
      transport: Transport.REDIS,
      options: {
        host: process.env.REDIS_HOST!,
        port: Number(process.env.REDIS_PORT!),
        password: process.env.REDIS_PASSWORD!,
        username: process.env.REDIS_USERNAME!,
      },
    },
  );

  await app.listen();
  console.log("Worker microservice is listening...");
}

bootstrap();
