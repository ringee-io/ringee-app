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
import { CreditAutoReloadRepository } from "./repositories/credit-auto-reload.repository";
import { DashboardRepository } from "./repositories/dashboard.repository";
import { UserDeviceRepository } from "./repositories/user.device.repository";
import { RecordingRepository } from "./repositories/recording.repository";
import { OrganizationRepository } from "./repositories/organization.repository";
import { SubscriptionRepository } from "./repositories/subscription.repository";
import { CampaignRepository } from "./repositories/campaign.repository";
import { CampaignMemberRepository } from "./repositories/campaign-member.repository";
import { CampaignLeadRepository } from "./repositories/campaign-lead.repository";
import { CampaignListRepository } from "./repositories/campaign-list.repository";
import { CallAttemptRepository } from "./repositories/call-attempt.repository";
import { DispositionRepository } from "./repositories/disposition.repository";
import { RetryRuleRepository } from "./repositories/retry-rule.repository";
import { CallbackTaskRepository } from "./repositories/callback-task.repository";
import { DNCEntryRepository } from "./repositories/dnc-entry.repository";
import { VoicemailDropAssetRepository } from "./repositories/voicemail-drop-asset.repository";
import { AgentSessionRepository } from "./repositories/agent-session.repository";
import { OutboundAnalyticsRepository } from "./repositories/outbound-analytics.repository";
import { TagRepository } from "./repositories/tag.repository";
import { MeetingRepository } from "./repositories/meeting.repository";
import { CalendarIntegrationRepository } from "./repositories/calendar-integration.repository";
import { TriggerLoopActionExecutionRepository } from "./repositories/triggerloop-action-execution.repository";
import { TriggerLoopOutboxRepository } from "./repositories/triggerloop-outbox.repository";
import { UserActivitySnapshotRepository } from "./repositories/user-activity-snapshot.repository";
import { ContactPhoneRepository } from "./repositories/contact-phone.repository";
import { ContactEmailRepository } from "./repositories/contact-email.repository";
import { CompanyRepository } from "./repositories/company.repository";
import { ContactAffiliationRepository } from "./repositories/contact-affiliation.repository";
import { CrmConnectionRepository } from "./repositories/crm-connection.repository";
import { CrmContactLinkRepository } from "./repositories/crm-contact-link.repository";
import { CrmCompanyLinkRepository } from "./repositories/crm-company-link.repository";
import { CrmCallSyncRepository } from "./repositories/crm-call-sync.repository";
import { CrmOutboxRepository } from "./repositories/crm-outbox.repository";
import { CrmFieldMappingRepository } from "./repositories/crm-field-mapping.repository";

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
  CreditAutoReloadRepository,
  DashboardRepository,
  UserDeviceRepository,
  RecordingRepository,
  OrganizationRepository,
  SubscriptionRepository,
  CampaignRepository,
  CampaignMemberRepository,
  CampaignLeadRepository,
  CampaignListRepository,
  CallAttemptRepository,
  DispositionRepository,
  RetryRuleRepository,
  CallbackTaskRepository,
  DNCEntryRepository,
  VoicemailDropAssetRepository,
  AgentSessionRepository,
  OutboundAnalyticsRepository,
  TagRepository,
  MeetingRepository,
  CalendarIntegrationRepository,
  TriggerLoopActionExecutionRepository,
  TriggerLoopOutboxRepository,
  UserActivitySnapshotRepository,
  ContactPhoneRepository,
  ContactEmailRepository,
  CompanyRepository,
  ContactAffiliationRepository,
  CrmConnectionRepository,
  CrmContactLinkRepository,
  CrmCompanyLinkRepository,
  CrmCallSyncRepository,
  CrmOutboxRepository,
  CrmFieldMappingRepository,
];

@Global()
@Module({
  providers: databaseProviders,
  exports: databaseProviders,
})
export class DatabaseModule { }
