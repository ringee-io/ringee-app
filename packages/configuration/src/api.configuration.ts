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
  TELNYX_WEBHOOK_TOLERANCE_SECONDS: Number(
    process.env.TELNYX_WEBHOOK_TOLERANCE_SECONDS ?? 300,
  ),
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
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
  ENRICHMENT_FEATURE_ENABLED: process.env.ENRICHMENT_FEATURE_ENABLED !== "false",
  ENRICHMENT_DRY_RUN: process.env.ENRICHMENT_DRY_RUN === "true",
  ENRICHMENT_DEDUP_TTL_DAYS: Number(process.env.ENRICHMENT_DEDUP_TTL_DAYS ?? 30),
  ENRICHMENT_COST_PROSPEO: Number(process.env.ENRICHMENT_COST_PROSPEO ?? 5),
  ENRICHMENT_COST_APOLLO: Number(process.env.ENRICHMENT_COST_APOLLO ?? 3),
  ENRICHMENT_COST_LEAD_SEARCH: Number(process.env.ENRICHMENT_COST_LEAD_SEARCH ?? 1),
  ENRICHMENT_COST_LEAD_IMPORT: Number(process.env.ENRICHMENT_COST_LEAD_IMPORT ?? 5),
  PROSPEO_API_BASE_URL: process.env.PROSPEO_API_BASE_URL || "https://api.prospeo.io",
  APOLLO_API_BASE_URL: process.env.APOLLO_API_BASE_URL || "https://api.apollo.io",
  // ── Ringee AI ──
  AI_PROVIDER: (process.env.AI_PROVIDER || "openai") as
    | "openai"
    | "anthropic"
    | "google"
    | "groq",
  OPENAI_DEFAULT_MODEL:
    process.env.OPENAI_DEFAULT_MODEL || "gpt-5.4-mini",
  OPENAI_SUMMARY_MODEL:
    process.env.OPENAI_SUMMARY_MODEL || "gpt-5.4-mini",
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
  errors.push("ANTHROPIC_API_KEY is not defined (required when AI_PROVIDER=anthropic)");
}

if (!(apiConfiguration.AI_TOKEN_MARGIN >= 1)) {
  errors.push("AI_TOKEN_MARGIN must be a number >= 1");
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
