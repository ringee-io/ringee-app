import { Module } from "@nestjs/common";
import { ChatAuthController } from "./chat.auth.controller";
import { WhatsappController } from "./whatsapp.controller";
import { McpModule } from "../../mcp/mcp.module";
import {
  AiModule,
  ChatModule,
  TelephonyModule,
  StripeModule,
  NotificationModule,
  DeepgramModule,
  RedisModule,
} from "@ringee/platform";
import { TranscriptionMediaGateway } from "@ringee/services";
import { ClerkController } from "./clerk.controller";
import { CallController } from "./call.controller";
import { WebRTCController } from "./webrtc.controller";
import { TelephonyController } from "./telephony.controller";
import { ContactController } from "./contact.controller";
import { StripeController } from "./stripe.controller";
import { CreditController } from "./credit.controller";
import { DashboardController } from "./dashboard.controller";
import { DashboardLayoutController } from "./dashboard-layout.controller";
import { UserController } from "./user.controller";
import { RecordingsController } from "./recordings.controller";
import { SubscriptionController } from "./subscription.controller";
import { EncryptionController } from "./encryption.controller";
import { CampaignController } from "./campaign.controller";
import { DialerController } from "./dialer.controller";
import { DNCController } from "./dnc.controller";
import { CallbackController } from "./callback.controller";
import { VoicemailAssetController } from "./voicemail-asset.controller";
import { OutboundAnalyticsController } from "./outbound-analytics.controller";
import { TagController, ContactTagController } from "./tag.controller";
import { CallScriptController } from "./call-script.controller";
import { OnboardingController } from "./onboarding.controller";
import { MeetingController } from "./meeting.controller";
import { CalendarController } from "./calendar.controller";
import { TriggerLoopModule } from "../../triggerloop/triggerloop.module";
import { CrmController } from "./crm.controller";
import { AttioAppController } from "./attio-app.controller";
import { EnrichmentController } from "./enrichment.controller";
import { CustomFieldsController } from "./custom-fields.controller";
import { EnrichmentFeatureGuard } from "../guards/enrichment-feature.guard";
import { InboxController } from "./inbox.controller";
import { MessagingWebhookController } from "./messaging.webhook.controller";
import { ReminderController } from "./reminder.controller";
import { RingeeAiController } from "./ringee-ai.controller";
import { MobileController } from "./mobile.controller";
import { CustomIntegrationsController } from "./custom-integrations.controller";
import { CustomIntegrationsWebhookController } from "./custom-integrations.webhook.controller";
import { McpController } from "./mcp.controller";
import { McpChatgptController } from "./mcp.chatgpt.controller";
import { CallSessionController } from "./call-session.controller";
import { WellKnownController } from "./well-known.controller";
import { CallRecordingSettingsController } from "./call-recording-settings.controller";
import { TranscriptionController } from "./transcription.controller";
import { AiPipelineController } from "./ai-pipeline.controller";
import { ObjectionInsightController } from "./objection-insight.controller";
import { PendingActionController } from "./pending-action.controller";
import { ExtensionController } from "./extension.controller";
import { BackofficeController } from "./backoffice.controller";
import { CallerIdRotationController } from "./caller-id-rotation.controller";
import { SipDeviceController } from "./sip-device.controller";
import { DeskPhoneWebhookController } from "./desk-phone.webhook.controller";
import { FreeTrialController } from "./free-trial.controller";
import { InfrastructureController } from "./infrastructure.controller";

@Module({
  controllers: [
    ChatAuthController,
    WhatsappController,
    ClerkController,
    CallController,
    WebRTCController,
    TelephonyController,
    ContactController,
    StripeController,
    CreditController,
    DashboardController,
    DashboardLayoutController,
    UserController,
    RecordingsController,
    SubscriptionController,
    EncryptionController,
    CampaignController,
    DialerController,
    DNCController,
    CallbackController,
    VoicemailAssetController,
    OutboundAnalyticsController,
    TagController,
    ContactTagController,
    CallScriptController,
    OnboardingController,
    MeetingController,
    CalendarController,
    CrmController,
    AttioAppController,
    EnrichmentController,
    CustomFieldsController,
    InboxController,
    MessagingWebhookController,
    ReminderController,
    RingeeAiController,
    MobileController,
    CustomIntegrationsController,
    CustomIntegrationsWebhookController,
    // Register the static /mcp/chatgpt routes BEFORE McpController's
    // /mcp/:id/* param routes, or "chatgpt" would be captured as an :id.
    McpChatgptController,
    McpController,
    CallSessionController,
    WellKnownController,
    CallRecordingSettingsController,
    TranscriptionController,
    AiPipelineController,
    ObjectionInsightController,
    PendingActionController,
    ExtensionController,
    BackofficeController,
    CallerIdRotationController,
    SipDeviceController,
    DeskPhoneWebhookController,
    InfrastructureController,
    FreeTrialController,
  ],
  // TranscriptionMediaGateway lives here (not in the shared ServicesModule) so
  // the Telnyx media-stream WS server binds its port only in the API process.
  providers: [EnrichmentFeatureGuard, TranscriptionMediaGateway],
  imports: [
    McpModule,
    ChatModule,
    AiModule,
    TelephonyModule,
    StripeModule,
    NotificationModule,
    TriggerLoopModule,
    DeepgramModule,
    RedisModule,
  ],
})
export class RoutesModule {}
