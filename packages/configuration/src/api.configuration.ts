const apiConfiguration = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL!,
  WHATSAPP_PHONE_ID: process.env.WHATSAPP_PHONE_ID!,
  WHATSAPP_PHONE_NUMBER: process.env.WHATSAPP_PHONE_NUMBER!,
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN!,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN!,
  FRONTEND_URL: process.env.FRONTEND_URL!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
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
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
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
