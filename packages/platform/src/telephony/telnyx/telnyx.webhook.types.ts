// ======================================================
// ✅ EVENT TYPES
// ======================================================

export type TelnyxEventType =
  | "call.initiated"
  | "call.answered"
  | "call.hangup"
  | "call.recording.saved"
  | "call.recording.error"
  | "call.transcription"
  | "call.cost";

// ======================================================
// ✅ BASE PAYLOAD
// ======================================================

export interface TelnyxBasePayload {
  call_control_id: string;
  call_session_id?: string;
  call_leg_id?: string;
  occurred_at?: string;
  client_state?: string;
  custom_headers?: any[];
}

// ======================================================
// ✅ PAYLOADS POR TIPO DE EVENTO
// ======================================================

export interface CallInitiatedPayload extends TelnyxBasePayload {
  direction?: "inbound" | "outbound";
  from?: string;
  to?: string;
  start_time?: string;
}

export interface CallAnsweredPayload extends TelnyxBasePayload {
  answered_at?: string;
}

export interface CallHangupPayload extends TelnyxBasePayload {
  hangup_cause?: string;
  duration_sec?: number;
  end_time?: string;
  start_time?: string;
}

export interface CallRecordingSavedPayload extends TelnyxBasePayload {
  recording_id: string;
  recording_started_at: string;
  recording_ended_at: string;
  recording_urls: {
    mp3: string;
    wav: string;
  };
  public_recording_urls: {
    mp3: string;
    wav: string;
  };
  format?: "mp3" | "wav";
  track?: "both" | "inbound" | "outbound";
}

export interface CallRecordingErrorPayload extends TelnyxBasePayload {
  recording_id?: string;
  error: string;
}

export interface CallTranscriptionPayload extends TelnyxBasePayload {
  transcription: string;
  is_final: boolean;
  track?: "inbound" | "outbound" | "both";
  speaker?: number;
  confidence?: number;
}

export interface CallCostPayload extends TelnyxBasePayload {
  billed_duration_secs: number;
  billing_group_id: string | null;
  cost_parts: [
    {
      billed_duration_secs: number;
      call_part: "sip-trunking";
      cost: string;
      currency: "USD";
      rate: string;
    },
    {
      billed_duration_secs: number;
      call_part: "call-control";
      cost: string;
      currency: "USD";
      rate: string;
    },
  ];
  status: "success";
  total_cost: string;
}
// ======================================================
// ✅ ENVELOPE GENERAL
// ======================================================

export interface TelnyxWebhookEnvelope<TPayload> {
  event_type: TelnyxEventType;
  id: string;
  occurred_at: string;
  payload: TPayload & {
    custom_headers: any[];
  };
}

// ======================================================
// ✅ EVENTO COMPLETO (UNIÓN DISCRIMINADA)
// ======================================================

export type TelnyxWebhookEvent =
  | (TelnyxWebhookEnvelope<CallInitiatedPayload> & {
      event_type: "call.initiated";
    })
  | (TelnyxWebhookEnvelope<CallAnsweredPayload> & {
      event_type: "call.answered";
    })
  | (TelnyxWebhookEnvelope<CallHangupPayload> & {
      event_type: "call.hangup";
    })
  | (TelnyxWebhookEnvelope<CallRecordingSavedPayload> & {
      event_type: "call.recording.saved";
    })
  | (TelnyxWebhookEnvelope<CallRecordingErrorPayload> & {
      event_type: "call.recording.error";
    })
  | (TelnyxWebhookEnvelope<CallTranscriptionPayload> & {
      event_type: "call.transcription";
    })
  | (TelnyxWebhookEnvelope<CallCostPayload> & {
      event_type: "call.cost";
    });
// ======================================================
// ✅ HELPER TYPE (Opcional)
// ======================================================

/**
 * Extrae el tipo de payload según el evento Telnyx
 */
export type ExtractTelnyxPayload<T extends TelnyxEventType> = Extract<
  TelnyxWebhookEvent,
  { event_type: T }
>["payload"];
