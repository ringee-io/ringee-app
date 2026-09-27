-- The dedicated inbound agent type. Only this type can be routed to a number
-- (AGENT-016). Additive: existing agents keep their type.
ALTER TYPE "AiVoiceAgentType" ADD VALUE IF NOT EXISTS 'receptionist';
