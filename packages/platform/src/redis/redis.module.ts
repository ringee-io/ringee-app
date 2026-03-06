import KeyvRedis, { createClient } from "@keyv/redis";
import Keyv from "keyv";
import { Module, Global } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { CacheModule } from "@nestjs/cache-manager";
import { apiConfiguration } from "@ringee/configuration";
import { RedisService } from "./redis.service";
import { WorkerService } from "./worker.service";

const imports = [
  ClientsModule.register([
    {
      name: "WORKER_SERVICE",
      transport: Transport.REDIS,
      options: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        username: process.env.REDIS_USERNAME,
      },
    },
  ]),
];

@Global()
@Module({
  imports: [...imports],
  providers: [RedisService, WorkerService,
    {
      provide: "REDIS_CLIENT",
      useFactory: async () => {
        const client = createClient({
          url: process.env.REDIS_URL,
        });

        await client.connect();
        return client;
      },
    }
  ],
  exports: [...imports, RedisService, WorkerService, "REDIS_CLIENT"],
})
export class RedisModule { }
