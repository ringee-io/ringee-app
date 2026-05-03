// Telnyx Messaging webhook types.
// Reference: https://developers.telnyx.com/docs/messaging/sending-and-receiving-messages/webhooks

export type TelnyxMessagingEventType =
  | "message.received"
  | "message.sent"
  | "message.finalized"
  | "message.failed"
  | "message.delivery_unconfirmed";

export interface TelnyxMessagingMediaItem {
  url: string;
  content_type?: string;
  sha256?: string;
  size?: number;
}

export interface TelnyxMessagingNumberAddress {
  phone_number: string;
  carrier?: string;
  line_type?: string;
  status?: string;
}

export interface TelnyxMessagePayload {
  id: string;
  type: "SMS" | "MMS";
  direction: "inbound" | "outbound";
  messaging_profile_id?: string;
  organization_id?: string;
  from?: TelnyxMessagingNumberAddress;
  to?: TelnyxMessagingNumberAddress[];
  text?: string | null;
  media?: TelnyxMessagingMediaItem[];
  encoding?: string;
  parts?: number;
  errors?: { code: string; title?: string; detail?: string }[];
  cost?: { amount: string; currency: string };
  received_at?: string;
  sent_at?: string;
  completed_at?: string;
  webhook_url?: string;
  webhook_failover_url?: string;
}

export interface TelnyxMessagingWebhookEnvelope {
  data: {
    id: string;
    event_type: TelnyxMessagingEventType;
    occurred_at: string;
    record_type: "event";
    payload: TelnyxMessagePayload;
  };
  meta?: {
    attempt: number;
    delivered_to: string;
  };
}
