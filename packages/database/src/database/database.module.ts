import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { UserRepository } from "./repositories/user.repository";
import { ChatAuthRepository } from "./repositories/chat.auth.repository";
import { DeletedUserRepository } from "./repositories/deleted.user.respository";
import { CallTranscriptionRepository } from "./repositories/call.transcription.repository";
import { CallRepository } from "./repositories/call.repository";
import { TelnyxRatePerMinuteRepository } from "./repositories/telnyx.rate.per.minute.repository";
import { NumberPurchasedRepository } from "./repositories/number.purchased.repository";
import { ContactRepository } from "./repositories/contact.repository";
import { CallerIdRepository } from "./repositories/caller.id.repository";
import { CreditRepository } from "./repositories/credit.repository";
import { DashboardRepository } from "./repositories/dashboard.repository";
import { UserDeviceRepository } from "./repositories/user.device.repository";
import { RecordingRepository } from "./repositories/recording.repository";
import { OrganizationRepository } from "./repositories/organization.repository";
import { SubscriptionRepository } from "./repositories/subscription.repository";
import { CampaignRepository } from "./repositories/campaign.repository";
import { CampaignLeadRepository } from "./repositories/campaign-lead.repository";
import { TagRepository } from "./repositories/tag.repository";

const databaseProviders = [
  PrismaService,
  UserRepository,
  ChatAuthRepository,
  DeletedUserRepository,
  CallRepository,
  CallTranscriptionRepository,
  TelnyxRatePerMinuteRepository,
  NumberPurchasedRepository,
  ContactRepository,
  CallerIdRepository,
  CreditRepository,
  DashboardRepository,
  UserDeviceRepository,
  RecordingRepository,
  OrganizationRepository,
  SubscriptionRepository,
  CampaignRepository,
  CampaignLeadRepository,
  TagRepository,
];

@Global()
@Module({
  providers: databaseProviders,
  exports: databaseProviders,
})
export class DatabaseModule { }
