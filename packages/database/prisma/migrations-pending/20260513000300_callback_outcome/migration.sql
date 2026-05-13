-- Add `callback_scheduled` to CallOutcome enum.
-- Distinct from `follow_up` (qualitative) — this fires when the agent
-- schedules an explicit callback time, mirroring the campaign dialer flow.

ALTER TYPE "CallOutcome" ADD VALUE IF NOT EXISTS 'callback_scheduled';
