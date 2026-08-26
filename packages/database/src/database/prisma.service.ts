import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
// @ts-ignore
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log: [
        {
          emit: "event",
          level: "query",
        },
      ],
    });
  }
  async onModuleInit() {
    // @ts-ignore
    await this.$connect();
  }

  async onModuleDestroy() {
    // @ts-ignore
    await this.$disconnect();
  }
}

@Injectable()
export class PrismaRepository<T extends keyof PrismaService> {
  public model: Pick<PrismaService, T>;
  constructor(private _prismaService: PrismaService) {
    this.model = this._prismaService;
  }
}
