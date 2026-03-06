import { Module } from "@nestjs/common";
import { BcryptAuth } from "./bcrypt.auth";
import { ClerkModule } from "./clerk/clerk.module";

@Module({
  imports: [ClerkModule],
  providers: [BcryptAuth],
  get exports() {
    return [...this.providers];

  },
})
export class AuthModule { }
