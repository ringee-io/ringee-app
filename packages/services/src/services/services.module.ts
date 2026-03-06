import { Global, Module } from "@nestjs/common";
import { UserService } from "./user.service";
import {
  AuthModule,
  NotificationModule,
  TelephonyModule,
  RedisModule,
} from "@ringee/platform";
import { ChatAuthService } from "./chat.auth.service";
import { CallTranscriptionService } from "./call.transcription.service";
import { CallService } from "./call.service";
import { NumberPurchasedService } from "./number.purchased.service";
import { ContactService } from "./contact.service";
import { CallerIdService } from "./caller.id.service";
import { CreditService } from "./credit.service";
import { DashboardService } from "./dashboard.service";
import { UserDeviceService } from "./user.device.service";
import { RecordingService } from "./recording.service";
import { OrganizationService } from "./organization.service";
import { SubscriptionService } from "./subscription.service";
import { CampaignService } from "./campaign.service";
import { TagService } from "./tag.service";
import { OnboardingService } from "./onboarding.service";

const servicesProviders = [
  UserService,
  ChatAuthService,
  CallTranscriptionService,
  CallService,
  NumberPurchasedService,
  ContactService,
  CallerIdService,
  CreditService,
  DashboardService,
  UserDeviceService,
  RecordingService,
  OrganizationService,
  SubscriptionService,
  CampaignService,
  TagService,
  OnboardingService,
];

@Global()
@Module({
  imports: [AuthModule, NotificationModule, TelephonyModule],
  providers: servicesProviders,
  exports: servicesProviders,
})
export class ServicesModule { }
