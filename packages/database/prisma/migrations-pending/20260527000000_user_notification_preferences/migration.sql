-- Per-user notification preferences for mobile push fan-out.
-- Shape: { callbacks: boolean, meetings: boolean, missedCalls: boolean }
-- NULL means "default on" so existing users keep current behavior.

ALTER TABLE "User" ADD COLUMN "notificationPreferences" JSONB;
