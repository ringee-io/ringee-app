import {
  ChatSignInDto,
  ChatSignUpDto,
  ChatWelcomeDto,
  ChatWelcomeNotLoggedInDto,
} from "./chat.dto";

export interface ChatServiceInterface {
  welcomeNotLoggedIn(
    phoneNumber: string,
    dto: ChatWelcomeNotLoggedInDto,
  ): Promise<void>;
  welcome(phoneNumber: string, dto: ChatWelcomeDto): Promise<void>;
  signIn(phoneNumber: string, dto: ChatSignInDto): Promise<void>;
  signUp(phoneNumber: string, dto: ChatSignUpDto): Promise<void>;

  markAsRead(messageId: string): Promise<void>;
  sendTypingIndicator(messageId: string): Promise<void>;
  sendText(to: string, text: string): Promise<void>;
}
