import { BadRequestException, Injectable } from "@nestjs/common";
import { User, UserRepository } from "@ringee/database";

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) { }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async getByClerkId(clerkId: string): Promise<User | null> {
    return this.userRepository.findByClerkId(clerkId);
  }

  async getByClerkIds(clerkIds: string[]): Promise<{ id: string; clerkId: string | null }[]> {
    return this.userRepository.findByClerkIds(clerkIds);
  }

  async patchCustomerId(userId: string, customerId: string): Promise<User> {
    return this.userRepository.update(userId, { customerId });
  }

  async consumeFreeCallTrial(userId: string): Promise<User> {
    try {
      const user = await this.userRepository.updateFreeCallTrial(userId, false);
      return user;
    } catch (error) {
      console.error(
        "Error consuming free call trial:",
        JSON.stringify(error, null, 2),
      );
      throw new BadRequestException(error);
    }
  }
}
