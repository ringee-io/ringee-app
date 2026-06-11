import { createClient } from "@keyv/redis";
import { Module, Global } from "@nestjs/common";
import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [
    RedisService,
    {
      provide: "REDIS_CLIENT",
      useFactory: async () => {
        const client = createClient({
          url: process.env.REDIS_URL,
        });

        await client.connect();
        return client;
      },
    },
  ],
  exports: [RedisService, "REDIS_CLIENT"],
})
export class RedisModule {}
