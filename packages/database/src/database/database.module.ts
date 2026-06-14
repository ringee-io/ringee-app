import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { UserRepository } from "./repositories/user.repository";
import { ChatAuthRepository } from "./repositories/chat.auth.repository";
import { DeletedUserRepository } from "./repositories/deleted.user.respository";
import { CallTranscriptionRepository } from "./repositories/call.transcription.repository";
import { CallRecordingSettingsRepository } from "./repositories/call-recording-settings.repository";
import { CallRepository } from "./repositories/call.repository";
import { TelnyxRatePerMinuteRepository } from "./repositories/telnyx.rate.per.minute.repository";
import { NumberPurchasedRepository } from "./repositories/number.purchased.repository";
import { ContactRepository } from "./repositories/contact.repository";
import { CallerIdRepository } from "./repositories/caller.id.repository";
import { CreditRepository } from "./repositories/credit.repository";
import { CreditAutoReloadRepository } from "./repositories/credit-auto-reload.repository";
import { DashboardRepository } from "./repositories/dashboard.repository";
import { DashboardLayoutRepository } from "./repositories/dashboard-layout.repository";
import { UserDeviceRepository } from "./repositories/user.device.repository";
import { RecordingRepository } from "./repositories/recording.repository";
import { PublicRecordingRepository } from "./repositories/public-recording.repository";
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
import { ReminderRepository } from "./repositories/reminder.repository";
import { VoicemailDropAssetRepository } from "./repositories/voicemail-drop-asset.repository";
import { AgentSessionRepository } from "./repositories/agent-session.repository";
import { OutboundAnalyticsRepository } from "./repositories/outbound-analytics.repository";
import { TagRepository } from "./repositories/tag.repository";
import { CallScriptRepository } from "./repositories/call-script.repository";
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
import { EnrichmentConnectionRepository } from "./repositories/enrichment-connection.repository";
import { EnrichmentJobRepository } from "./repositories/enrichment-job.repository";
import { LeadSearchJobRepository } from "./repositories/lead-search-job.repository";
import { CustomFieldRepository } from "./repositories/custom-field.repository";
import { SocialLinkRepository } from "./repositories/social-link.repository";
import { InboxThreadRepository } from "./repositories/inbox-thread.repository";
import { InboxEventRepository } from "./repositories/inbox-event.repository";
import { MessageRepository } from "./repositories/message.repository";
import { MessageEventRepository } from "./repositories/message-event.repository";
import { AiConversationRepository } from "./repositories/ai-conversation.repository";
import { AiMessageRepository } from "./repositories/ai-message.repository";
import { AiToolEventRepository } from "./repositories/ai-tool-event.repository";
import { CustomIntegrationRepository } from "./repositories/custom-integration.repository";
import {
  CustomIntegrationContactLinkRepository,
  CustomIntegrationCompanyLinkRepository,
} from "./repositories/custom-integration-link.repository";
import { CustomIntegrationInboundRepository } from "./repositories/custom-integration-inbound.repository";
import { CustomIntegrationDeliveryRepository } from "./repositories/custom-integration-delivery.repository";
import { CallSessionRepository } from "./repositories/call-session.repository";
import { RegulatoryDocumentRepository } from "./repositories/regulatory-document.repository";
import { NumberRequirementValueRepository } from "./repositories/number-requirement-value.repository";

const databaseProviders = [
  PrismaService,
  UserRepository,
  ChatAuthRepository,
  DeletedUserRepository,
  CallRepository,
  CallTranscriptionRepository,
  CallRecordingSettingsRepository,
  TelnyxRatePerMinuteRepository,
  NumberPurchasedRepository,
  ContactRepository,
  CallerIdRepository,
  CreditRepository,
  CreditAutoReloadRepository,
  DashboardRepository,
  DashboardLayoutRepository,
  UserDeviceRepository,
  RecordingRepository,
  PublicRecordingRepository,
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
  ReminderRepository,
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
  EnrichmentConnectionRepository,
  EnrichmentJobRepository,
  LeadSearchJobRepository,
  CustomFieldRepository,
  SocialLinkRepository,
  CallScriptRepository,
  InboxThreadRepository,
  InboxEventRepository,
  MessageRepository,
  MessageEventRepository,
  AiConversationRepository,
  AiMessageRepository,
  AiToolEventRepository,
  CustomIntegrationRepository,
  CustomIntegrationContactLinkRepository,
  CustomIntegrationCompanyLinkRepository,
  CustomIntegrationInboundRepository,
  CustomIntegrationDeliveryRepository,
  CallSessionRepository,
  RegulatoryDocumentRepository,
  NumberRequirementValueRepository,
];

@Global()
@Module({
  providers: databaseProviders,
  exports: databaseProviders,
})
export class DatabaseModule {}
