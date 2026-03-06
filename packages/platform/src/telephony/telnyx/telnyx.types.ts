export interface TelnyxCallResponse {
  data: {
    record_type: "call";
    call_session_id: string;
    call_leg_id: string;
    call_control_id: string;
    is_alive: boolean;
    client_state?: string;
    call_duration?: number;
    recording_id?: string;
    start_time?: string;
    end_time?: string;
  };
}

export interface TelnyxHangupResponse {
  data: {
    result: "ok";
  };
}

export interface TelnyxErrorResponse {
  errors: {
    code: string;
    title: string;
    detail?: string;
    source?: {
      pointer?: string;
      parameter?: string;
    };
    meta?: Record<string, any>;
  }[];
}

export interface TelnyxRecordActionResponse {
  data: {
    result: "ok";
  };
}

export interface TelnyxRecordActionRequest {
  client_state?: string;
  command_id?: string;
  recording_id: string;
}

export interface TelnyxTranscriptionStartRequest {
  transcription_engine?: "Google" | "Telnyx" | "Deepgram";
  transcription_engine_config?: {
    language?: string;
    interim_results?: boolean;
    enable_speaker_diarization?: boolean;
    min_speaker_count?: number;
    max_speaker_count?: number;
    profanity_filter?: boolean;
    use_enhanced?: boolean;
    model?: string;
    hints?: string[];
  };
  transcription_tracks?: "inbound" | "outbound" | "both";
  client_state?: string;
  command_id?: string;
}

export interface TelnyxTranscriptionResponse {
  data: {
    result: string;
  };
}
