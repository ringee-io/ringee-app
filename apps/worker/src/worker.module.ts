import { Module } from "@nestjs/common";
import { WorkerController } from "./worker.controller";
import { WorkerService } from "./woorker.service";
import { CryptoService, TelephonyModule, RedisModule, UploadModule } from "@ringee/platform";
import { ServicesModule } from "@ringee/services";
import { DatabaseModule } from "@ringee/database";

@Module({
  imports: [DatabaseModule, UploadModule, ServicesModule, TelephonyModule, RedisModule],
  controllers: [WorkerController],
  providers: [WorkerService, CryptoService],
})
export class WorkerModule { }
