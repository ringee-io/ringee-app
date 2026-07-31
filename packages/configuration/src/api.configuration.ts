const positiveInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const nonNegativeInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
};

const apiConfiguration = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL!,
  WHATSAPP_PHONE_ID: process.env.WHATSAPP_PHONE_ID!,
  WHATSAPP_PHONE_NUMBER: process.env.WHATSAPP_PHONE_NUMBER!,
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN!,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN!,
  FRONTEND_URL: process.env.FRONTEND_URL!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  PUBLIC_BACKEND_URL: process.env.PUBLIC_BACKEND_URL!,
  REDIS_URL: process.env.REDIS_URL!,
  // ── Temporal (durable background jobs / orchestrator) ──
  // Plain gRPC address of the self-hosted Temporal frontend. For local dev,
  // `docker-compose up -d` starts it, or use `temporal server start-dev`.
  TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE || "default",
  TEMPORAL_TASK_QUEUE: process.env.TEMPORAL_TASK_QUEUE || "ringee",
  RESEND_API_KEY: process.env.RESEND_API_KEY!,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME!,
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS!,
  BACKEND_URL: process.env.BACKEND_URL!,
  CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET!,
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY!,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
  APP_ENCRYPTION_SECRET: process.env.APP_ENCRYPTION_SECRET!,
  TELNYX_API_KEY: process.env.TELNYX_API_KEY!,
  TELNYX_CONNECTION_ID: process.env.TELNYX_CONNECTION_ID!,
  TELNYX_PUBLIC_KEY: process.env.TELNYX_PUBLIC_KEY,
  TELNYX_MESSAGING_PROFILE_ID: process.env.TELNYX_MESSAGING_PROFILE_ID,
  // Shared Outbound Voice Profile assigned to every desk-phone SIP connection
  // so outbound calls from physical phones bill through Ringee. Required only
  // when DESK_PHONES_ENABLED is true (validated lazily on device creation).
  TELNYX_OUTBOUND_VOICE_PROFILE_ID:
    process.env.TELNYX_OUTBOUND_VOICE_PROFILE_ID,
  // Master switch for the Desk Phones / SIP Devices feature. When false the
  // CRUD endpoints and the dedicated desk-phone webhook reject all traffic, so
  // the flow can be shipped dark and toggled on per environment.
  DESK_PHONES_ENABLED: process.env.DESK_PHONES_ENABLED === "true",
  // Hard per-call ceiling (minutes) for desk-phone outbound calls. Enforced as
  // a Telnyx `time_limit_secs` on the bridged call so an unattended phone can't
  // rack up runaway spend; the real cost is still settled from Telnyx CDRs.
  DESK_PHONE_MAX_CALL_MINUTES: Number(
    process.env.DESK_PHONE_MAX_CALL_MINUTES ?? 120,
  ),
  TELNYX_WEBHOOK_TOLERANCE_SECONDS: Number(
    process.env.TELNYX_WEBHOOK_TOLERANCE_SECONDS ?? 300,
  ),
  // ── Call Recording & Transcription (Deepgram) ──
  // Optional: when unset, recording still works but transcription is disabled
  // and the service surfaces a clear error instead of crashing at boot.
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  DEEPGRAM_MODEL: process.env.DEEPGRAM_MODEL || "nova-2",
  // Deepgram language hint. "multi" enables multilingual transcription; set a
  // concrete code (e.g. "en", "es") to lock the language.
  DEEPGRAM_LANGUAGE: process.env.DEEPGRAM_LANGUAGE || "multi",
  // Credits billed per transcribed minute before margin is applied.
  TRANSCRIPTION_CREDIT_COST_PER_MINUTE: Number(
    process.env.TRANSCRIPTION_CREDIT_COST_PER_MINUTE ?? 0.01,
  ),
  // Profit margin multiplier for transcription charges.
  // 1 = charge provider-equivalent cost, 1.5 = +50%.
  TRANSCRIPTION_CREDIT_PROFIT_MARGIN: Number(
    process.env.TRANSCRIPTION_CREDIT_PROFIT_MARGIN ?? 1,
  ),
  // Public wss:// URL Telnyx dials for the live media stream. The bridge runs
  // on the SAME host/port as the API (path /media-stream), so this is just the
  // public API origin with wss:// + /media-stream, e.g.
  // wss://api.example.com/media-stream. Required for realtime transcription.
  TRANSCRIPTION_MEDIA_STREAM_PUBLIC_URL:
    process.env.TRANSCRIPTION_MEDIA_STREAM_PUBLIC_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
  // Number of reverse-proxy hops in front of Express. Keep at 0 when the API is
  // directly internet-facing; set the exact hop count in production so req.ip
  // cannot be spoofed through X-Forwarded-For.
  TRUST_PROXY_HOPS: nonNegativeInteger("TRUST_PROXY_HOPS", 0),
  // Stripe card-testing controls. Request limits stop PaymentIntent/SetupIntent
  // creation floods; failure limits are driven by signed Stripe webhooks.
  STRIPE_ABUSE_REQUEST_WINDOW_SECONDS: positiveInteger(
    "STRIPE_ABUSE_REQUEST_WINDOW_SECONDS",
    600,
  ),
  STRIPE_ABUSE_MAX_REQUESTS_PER_USER: positiveInteger(
    "STRIPE_ABUSE_MAX_REQUESTS_PER_USER",
    20,
  ),
  STRIPE_ABUSE_MAX_REQUESTS_PER_IP: positiveInteger(
    "STRIPE_ABUSE_MAX_REQUESTS_PER_IP",
    60,
  ),
  STRIPE_ABUSE_FAILURE_WINDOW_SECONDS: positiveInteger(
    "STRIPE_ABUSE_FAILURE_WINDOW_SECONDS",
    3600,
  ),
  STRIPE_ABUSE_MAX_FAILURES_PER_USER: positiveInteger(
    "STRIPE_ABUSE_MAX_FAILURES_PER_USER",
    5,
  ),
  STRIPE_ABUSE_MAX_FAILURES_PER_IP: positiveInteger(
    "STRIPE_ABUSE_MAX_FAILURES_PER_IP",
    15,
  ),
  STRIPE_ABUSE_BLOCK_SECONDS: positiveInteger(
    "STRIPE_ABUSE_BLOCK_SECONDS",
    86400,
  ),
  TRIGGERLOOP_BASE_URL: process.env.TRIGGERLOOP_BASE_URL!,
  TRIGGERLOOP_API_KEY: process.env.TRIGGERLOOP_API_KEY!,
  TRIGGERLOOP_WEBHOOK_SECRET: process.env.TRIGGERLOOP_WEBHOOK_SECRET!,
  TRIGGERLOOP_PROJECT_KEY: process.env.TRIGGERLOOP_PROJECT_KEY || "ringee",
  // ── CRM Integrations ──
  ATTIO_OAUTH_CLIENT_ID: process.env.ATTIO_OAUTH_CLIENT_ID,
  ATTIO_OAUTH_CLIENT_SECRET: process.env.ATTIO_OAUTH_CLIENT_SECRET,
  ATTIO_OAUTH_AUTHORIZE_URL:
    process.env.ATTIO_OAUTH_AUTHORIZE_URL || "https://app.attio.com/authorize",
  ATTIO_OAUTH_TOKEN_URL:
    process.env.ATTIO_OAUTH_TOKEN_URL || "https://app.attio.com/oauth/token",
  ATTIO_API_BASE_URL: process.env.ATTIO_API_BASE_URL || "https://api.attio.com",
  CRM_DRY_RUN: process.env.CRM_DRY_RUN === "true",
  // ── Data Enrichment & Lead Search ──
  ENRICHMENT_FEATURE_ENABLED:
    process.env.ENRICHMENT_FEATURE_ENABLED !== "false",
  ENRICHMENT_DRY_RUN: process.env.ENRICHMENT_DRY_RUN === "true",
  ENRICHMENT_DEDUP_TTL_DAYS: Number(
    process.env.ENRICHMENT_DEDUP_TTL_DAYS ?? 30,
  ),
  PROSPEO_API_BASE_URL:
    process.env.PROSPEO_API_BASE_URL || "https://api.prospeo.io",
  APOLLO_API_BASE_URL:
    process.env.APOLLO_API_BASE_URL || "https://api.apollo.io",
  // ── Ringee AI ──
  AI_PROVIDER: (process.env.AI_PROVIDER || "openai") as
    | "openai"
    | "anthropic"
    | "google"
    | "groq",
  OPENAI_DEFAULT_MODEL: process.env.OPENAI_DEFAULT_MODEL || "gpt-5.4-mini",
  OPENAI_SUMMARY_MODEL: process.env.OPENAI_SUMMARY_MODEL || "gpt-5.4-mini",
  ANTHROPIC_DEFAULT_MODEL:
    process.env.ANTHROPIC_DEFAULT_MODEL || "claude-haiku-4-5",
  ANTHROPIC_SUMMARY_MODEL:
    process.env.ANTHROPIC_SUMMARY_MODEL || "claude-haiku-4-5",
  // Profit margin multiplier applied to raw token cost before debiting
  // credits. 1 = charge exactly the provider cost; 1.5 = +50% margin.
  AI_TOKEN_MARGIN: Number(process.env.AI_TOKEN_MARGIN ?? 1),
  AI_TEMPERATURE: Number(process.env.AI_TEMPERATURE ?? 0.4),
  AI_MAX_CONTEXT_MESSAGES: Number(process.env.AI_MAX_CONTEXT_MESSAGES ?? 20),
  AI_SUMMARY_TRIGGER_TOKENS: Number(
    process.env.AI_SUMMARY_TRIGGER_TOKENS ?? 6000,
  ),
  AI_PROMPT_CACHE_ENABLED: process.env.AI_PROMPT_CACHE_ENABLED !== "false",
  // AI Pipeline — Follow-up Intelligence batch enrichment. Context activation
  // is already explicit, so AI runs unless it is deliberately disabled.
  AI_FOLLOWUP_AI_ENABLED: process.env.AI_FOLLOWUP_AI_ENABLED !== "false",
  // AI Pipeline — semantic, at-most-once full-transcript extraction. Pipeline
  // activation is already explicit per context, so AI is on unless disabled.
  AI_OBJECTION_AI_ENABLED: process.env.AI_OBJECTION_AI_ENABLED !== "false",
  // ── Backoffice (super admin) ──
  // Comma-separated email allowlist for the internal super-admin area. When
  // unset, the backend falls back to DEFAULT_SUPER_ADMIN_EMAILS (see the
  // SuperAdminGuard) so the module works out of the box for the founders.
  BACKOFFICE_SUPER_ADMIN_EMAILS: process.env.BACKOFFICE_SUPER_ADMIN_EMAILS,
};

const errors = [];

if (!apiConfiguration.DATABASE_URL) {
  errors.push("DATABASE_URL is not defined");
}

if (!apiConfiguration.PORT) {
  errors.push("PORT is not defined");
}

if (!apiConfiguration.WHATSAPP_PHONE_ID) {
  errors.push("WHATSAPP_PHONE_ID is not defined");
}

if (!apiConfiguration.WHATSAPP_TOKEN) {
  errors.push("WHATSAPP_TOKEN is not defined");
}

if (!apiConfiguration.FRONTEND_URL) {
  errors.push("FRONTEND_URL is not defined");
}

if (!apiConfiguration.OPENAI_API_KEY) {
  errors.push("OPENAI_API_KEY is not defined");
}

if (
  apiConfiguration.AI_PROVIDER === "anthropic" &&
  !apiConfiguration.ANTHROPIC_API_KEY
) {
  errors.push(
    "ANTHROPIC_API_KEY is not defined (required when AI_PROVIDER=anthropic)",
  );
}

if (!(apiConfiguration.AI_TOKEN_MARGIN >= 1)) {
  errors.push("AI_TOKEN_MARGIN must be a number >= 1");
}

if (!(apiConfiguration.TRANSCRIPTION_CREDIT_COST_PER_MINUTE >= 0)) {
  errors.push("TRANSCRIPTION_CREDIT_COST_PER_MINUTE must be a number >= 0");
}

if (!(apiConfiguration.TRANSCRIPTION_CREDIT_PROFIT_MARGIN >= 1)) {
  errors.push("TRANSCRIPTION_CREDIT_PROFIT_MARGIN must be a number >= 1");
}

if (!apiConfiguration.PUBLIC_BACKEND_URL) {
  errors.push("PUBLIC_BACKEND_URL is not defined");
}

if (!apiConfiguration.WHATSAPP_VERIFY_TOKEN) {
  errors.push("WHATSAPP_VERIFY_TOKEN is not defined");
}

if (!apiConfiguration.REDIS_URL) {
  errors.push("REDIS_URL is not defined");
}

if (!apiConfiguration.RESEND_API_KEY) {
  errors.push("RESEND_API_KEY is not defined");
}

if (!apiConfiguration.EMAIL_FROM_NAME) {
  errors.push("EMAIL_FROM_NAME is not defined");
}

if (!apiConfiguration.EMAIL_FROM_ADDRESS) {
  errors.push("EMAIL_FROM_ADDRESS is not defined");
}

if (!apiConfiguration.BACKEND_URL) {
  errors.push("BACKEND_URL is not defined");
}

if (!apiConfiguration.CLERK_WEBHOOK_SIGNING_SECRET) {
  errors.push("CLERK_WEBHOOK_SIGNING_SECRET is not defined");
}

if (!apiConfiguration.APP_ENCRYPTION_SECRET) {
  errors.push("APP_ENCRYPTION_SECRET is not defined");
}

if (!apiConfiguration.WHATSAPP_PHONE_NUMBER) {
  errors.push("WHATSAPP_PHONE_NUMBER is not defined");
}

if (!apiConfiguration.TELNYX_API_KEY) {
  errors.push("TELNYX_API_KEY is not defined");
}

if (!apiConfiguration.TELNYX_CONNECTION_ID) {
  errors.push("TELNYX_CONNECTION_ID is not defined");
}

if (!apiConfiguration.STRIPE_SECRET_KEY) {
  errors.push("STRIPE_SECRET_KEY is not defined");
}

if (!apiConfiguration.STRIPE_WEBHOOK_SECRET) {
  errors.push("STRIPE_WEBHOOK_SECRET is not defined");
}

if (errors.length > 0) {
  console.error(errors.join(", "));
  process.exit(1);
}

export { apiConfiguration };
