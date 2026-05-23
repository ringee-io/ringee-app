import { Global, Module, Provider } from "@nestjs/common";
import { UserService } from "./user.service";
import {
  AuthModule,
  NotificationModule,
  TelephonyModule,
  RedisModule,
  StripeModule,
  CrmModule,
  CryptoModule,
  EnrichmentModule,
  AiAgentsPlatformModule,
} from "@ringee/platform";
import { ChatAuthService } from "./chat.auth.service";
import { CallTranscriptionService } from "./call.transcription.service";
import { CallService } from "./call.service";
import { NumberPurchasedService } from "./number.purchased.service";
import { ContactService } from "./contact.service";
import { CallerIdService } from "./caller.id.service";
import { CreditService } from "./credit.service";
import { DashboardService } from "./dashboard.service";
import { DashboardLayoutService } from "./dashboard-layout.service";
import { UserDeviceService } from "./user.device.service";
import { RecordingService } from "./recording.service";
import { OrganizationService } from "./organization.service";
import { SubscriptionService } from "./subscription.service";
import { CampaignService } from "./campaign.service";
import { TagService } from "./tag.service";
import { CallScriptService } from "./call-script.service";
import { OnboardingService } from "./onboarding.service";
import { MeetingService } from "./meeting.service";
import { CalendarService } from "./calendar.service";
import {
  ComplianceService,
  DispositionService,
  RetryEngine,
  CallbackService,
  AgentSessionService,
  LeadQueueService,
  CallAttemptService,
  DialerOrchestrationService,
  VoicemailDropService,
  OutboundAnalyticsService,
  CampaignConfigService,
  SSEBridgeService,
  CampaignMemberService,
} from "./outbound";
import { AttioAppService } from "./attio-app.service";
import {
  CrmConnectionService,
  CrmOdooConnectionService,
  CrmOAuthService,
  CrmMatchingService,
  CrmCallLogService,
  CrmSyncService,
  CrmStatusService,
  CrmFieldMappingService,
  CrmContactSyncService,
  CrmCompanySyncService,
  CrmNoteSyncService,
  CrmTaskSyncService,
  CrmBulkSyncService,
  CrmMeetingSyncService,
  CrmRecordingUploadService,
} from "./crm";
import {
  EnrichmentConnectionService,
  EnrichmentMergeService,
  EnrichmentService,
  EnrichmentDrainService,
  LeadSearchService,
  CustomFieldsService,
} from "./enrichment";
import { InboxTimelineService, MessageService } from "./inbox";
import {
  EmailReminderChannel,
  REMINDER_CHANNELS,
  ReminderService,
} from "./reminders";
import {
  AgentRegistry,
  AiChatOrchestrator,
  AiConfirmationService,
  AiContextBuilder,
  AiConversationService,
  AiSummarizerService,
  PastBuyerAnalyzerService,
  ProspectDedupService,
  ProspectingExpertAgent,
  ProspectingTools,
  ProspectScoringService,
} from "./ai-agents";
import {
  CustomIntegrationService,
  CustomIntegrationAuthService,
  CustomIntegrationInboundService,
  CustomIntegrationOutboundService,
  CustomIntegrationDeliveryService,
  CustomIntegrationClickToCallService,
} from "./custom-integrations";

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
  DashboardLayoutService,
  UserDeviceService,
  RecordingService,
  OrganizationService,
  SubscriptionService,
  CampaignService,
  TagService,
  CallScriptService,
  OnboardingService,
  MeetingService,
  CalendarService,
  // Outbound system services
  ComplianceService,
  DispositionService,
  RetryEngine,
  CallbackService,
  AgentSessionService,
  LeadQueueService,
  CallAttemptService,
  DialerOrchestrationService,
  VoicemailDropService,
  OutboundAnalyticsService,
  CampaignConfigService,
  CampaignMemberService,
  SSEBridgeService,
  // CRM services
  CrmConnectionService,
  CrmOdooConnectionService,
  CrmOAuthService,
  CrmMatchingService,
  CrmCallLogService,
  CrmSyncService,
  CrmStatusService,
  CrmFieldMappingService,
  CrmContactSyncService,
  CrmCompanySyncService,
  CrmNoteSyncService,
  CrmTaskSyncService,
  CrmBulkSyncService,
  CrmMeetingSyncService,
  CrmRecordingUploadService,
  // Attio App SDK integration
  AttioAppService,
  // Data Enrichment & Lead Search
  EnrichmentConnectionService,
  EnrichmentMergeService,
  EnrichmentService,
  EnrichmentDrainService,
  LeadSearchService,
  CustomFieldsService,
  // Inbox / messaging
  InboxTimelineService,
  MessageService,
  // Reminders
  ReminderService,
  EmailReminderChannel,
  // Ringee AI
  ProspectScoringService,
  PastBuyerAnalyzerService,
  ProspectDedupService,
  ProspectingTools,
  ProspectingExpertAgent,
  AgentRegistry,
  AiContextBuilder,
  AiConversationService,
  AiSummarizerService,
  AiChatOrchestrator,
  AiConfirmationService,
  // Custom Integrations
  CustomIntegrationService,
  CustomIntegrationAuthService,
  CustomIntegrationInboundService,
  CustomIntegrationOutboundService,
  CustomIntegrationDeliveryService,
  CustomIntegrationClickToCallService,
];

const reminderChannelsProvider: Provider = {
  provide: REMINDER_CHANNELS,
  useFactory: (email: EmailReminderChannel) => [email],
  inject: [EmailReminderChannel],
};

const allProviders: Provider[] = [
  ...servicesProviders,
  reminderChannelsProvider,
];

@Global()
@Module({
  imports: [AuthModule, NotificationModule, TelephonyModule, StripeModule, CrmModule, EnrichmentModule, RedisModule, CryptoModule, AiAgentsPlatformModule],
  providers: allProviders,
  exports: allProviders,
})
export class ServicesModule { }
