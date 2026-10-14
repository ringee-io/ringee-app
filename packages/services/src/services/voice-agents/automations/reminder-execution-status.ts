import {
  AiVoiceAgentCall,
  AiVoiceAgentCallStatus,
  AiVoiceAgentOutcome,
  MeetingReminderExecutionStatus,
} from "@ringee/database";

const S = MeetingReminderExecutionStatus;

/** How a finished agent call closes the execution that placed it. */
export function executionStatusFor(
  agentCall: AiVoiceAgentCall,
): MeetingReminderExecutionStatus | null {
  switch (agentCall.status) {
    case AiVoiceAgentCallStatus.no_answer:
    case AiVoiceAgentCallStatus.busy:
    case AiVoiceAgentCallStatus.voicemail:
      return S.no_answer;
    case AiVoiceAgentCallStatus.failed:
      return S.failed;
    case AiVoiceAgentCallStatus.completed:
      if (agentCall.outcome === AiVoiceAgentOutcome.no_answer) {
        return S.no_answer;
      }
      return S.completed;
    default:
      return null;
  }
}
