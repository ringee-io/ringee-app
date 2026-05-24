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
} from "@ringee/platform";
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
    McpController,
  ],
  providers: [EnrichmentFeatureGuard],
  imports: [
    McpModule,
    ChatModule,
    AiModule,
    TelephonyModule,
    StripeModule,
    NotificationModule,
    TriggerLoopModule,
  ],
})
export class RoutesModule { }
