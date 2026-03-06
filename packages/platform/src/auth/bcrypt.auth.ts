import * as bcrypt from "bcrypt";
import { Injectable } from "@nestjs/common";

@Injectable()
export class BcryptAuth {
  constructor() {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
