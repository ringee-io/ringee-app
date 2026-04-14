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
import { OnboardingController } from "./onboarding.controller";
import { MeetingController } from "./meeting.controller";
import { CalendarController } from "./calendar.controller";
import { TriggerLoopModule } from "../../triggerloop/triggerloop.module";

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
    OnboardingController,
    MeetingController,
    CalendarController,
  ],
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
