import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHello = (): string => `The meaning of life is: 0`;
}
