import { Module, Global } from "@nestjs/common";
import { RedisService } from "./redis.service";
import { connectRedisClient } from "./redis-client";

@Global()
@Module({
  providers: [
    RedisService,
    {
      provide: "REDIS_CLIENT",
      useFactory: () => connectRedisClient(process.env.REDIS_URL),
    },
  ],
  exports: [RedisService, "REDIS_CLIENT"],
})
export class RedisModule {}
