import { Injectable, NotFoundException } from "@nestjs/common";
import { UserRepository } from "@ringee/database";
import { CreateChatAuthDto, OwnershipContext } from "@ringee/platform";
import { ChatAuthRepository } from "@ringee/database";

@Injectable()
export class ChatAuthService {
  constructor(
    private readonly chatAuthRepository: ChatAuthRepository,
    private readonly userRepository: UserRepository,
  ) { }

  async createChatAuth(ctx: OwnershipContext, data: CreateChatAuthDto): Promise<void> {
    const user = await this.userRepository.findById(ctx.userId);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.chatAuthRepository.createChatAuth(ctx, {
      phoneNumber: data.phoneNumber,
    });
  }

  async getByPhoneNumber(phoneNumber: string) {
    return await this.chatAuthRepository.findByPhoneNumber(phoneNumber);
  }

  async markAsDeleted(id: string) {
    await this.chatAuthRepository.deleteChatAuth(id);
  }
}
