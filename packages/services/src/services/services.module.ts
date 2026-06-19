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
  DeepgramModule,
  TemporalModule,
} from "@ringee/platform";
import { ChatAuthService } from "./chat.auth.service";
import { CallTranscriptionService } from "./call.transcription.service";
import { CallService } from "./call.service";
import { NumberPurchasedService } from "./number.purchased.service";
import { RegulatoryDocumentService } from "./regulatory-document.service";
import { ContactService } from "./contact.service";
import { CallerIdService } from "./caller.id.service";
import { CreditService } from "./credit.service";
import { DashboardService } from "./dashboard.service";
import { DashboardLayoutService } from "./dashboard-layout.service";
import { UserDeviceService } from "./user.device.service";
import { RecordingService } from "./recording.service";
import { RecordingProcessingService } from "./recording-processing.service";
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
  PushReminderChannel,
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
  CustomIntegrationFailureNotifierService,
  CustomIntegrationClickToCallService,
} from "./custom-integrations";
import {
  CallSessionService,
  CallSessionAccessTokenService,
} from "./call-session";
import {
  CallRecordingSettingsService,
  TranscriptionService,
} from "./transcription";
import {
  PIPELINE_DEFINITIONS,
  PipelineContextResolver,
  CallAnalysisService,
  PipelineRegistry,
  PipelineActivationService,
  PipelineRunService,
  PendingActionService,
  PipelineFanoutService,
  FollowUpAiBatchService,
  FollowUpRecommendationsPipeline,
  ObjectionAiBatchService,
  ObjectionIntelligencePipeline,
  ObjectionInsightService,
} from "./ai-pipeline";
import { BackofficeService } from "./backoffice.service";

const servicesProviders = [
  UserService,
  ChatAuthService,
  CallTranscriptionService,
  CallService,
  NumberPurchasedService,
  RegulatoryDocumentService,
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
  PushReminderChannel,
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
  CustomIntegrationFailureNotifierService,
  CustomIntegrationClickToCallService,
  // Call Sessions (magic-link dialing)
  CallSessionService,
  CallSessionAccessTokenService,
  // Call Recording & Transcription
  // (TranscriptionMediaGateway is registered only in the backend app so the
  //  Telnyx media WS server binds a single port — see RoutesModule.)
  CallRecordingSettingsService,
  TranscriptionService,
  // Recording post-processing pipeline (runs as a Temporal activity in
  // apps/orchestrator)
  RecordingProcessingService,
  // AI Pipeline & Pending Actions
  PipelineContextResolver,
  CallAnalysisService,
  PipelineRegistry,
  PipelineActivationService,
  PipelineRunService,
  PendingActionService,
  PipelineFanoutService,
  FollowUpAiBatchService,
  FollowUpRecommendationsPipeline,
  // AI Pipeline — Objection Intelligence
  ObjectionAiBatchService,
  ObjectionIntelligencePipeline,
  ObjectionInsightService,
  // Backoffice (super admin)
  BackofficeService,
];

/**
 * Pipeline registry source of truth. Adding a pipeline = implement its
 * AiPipelineDefinition, add the class to servicesProviders, and add it here
 * (one line). Nothing in the pipeline core changes.
 */
const pipelineDefinitionsProvider: Provider = {
  provide: PIPELINE_DEFINITIONS,
  useFactory: (
    followUp: FollowUpRecommendationsPipeline,
    objection: ObjectionIntelligencePipeline,
  ) => [followUp, objection],
  inject: [FollowUpRecommendationsPipeline, ObjectionIntelligencePipeline],
};

const reminderChannelsProvider: Provider = {
  provide: REMINDER_CHANNELS,
  useFactory: (email: EmailReminderChannel, push: PushReminderChannel) => [
    email,
    push,
  ],
  inject: [EmailReminderChannel, PushReminderChannel],
};

const allProviders: Provider[] = [
  ...servicesProviders,
  reminderChannelsProvider,
  pipelineDefinitionsProvider,
];

@Global()
@Module({
  imports: [
    AuthModule,
    NotificationModule,
    TelephonyModule,
    StripeModule,
    CrmModule,
    EnrichmentModule,
    RedisModule,
    CryptoModule,
    AiAgentsPlatformModule,
    DeepgramModule,
    TemporalModule,
  ],
  providers: allProviders,
  exports: [...allProviders, NotificationModule],
})
export class ServicesModule {}
