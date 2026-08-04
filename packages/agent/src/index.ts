/**
 * @ringee-io/agent
 *
 * The Ringee agent layer: typed clients, schemas, flows, prompts and operating
 * rules built ON TOP of the existing Ringee backend/MCP (the single source of
 * truth). It powers the `ringee` CLI, Claude Skills, slash commands and the
 * ChatGPT App. It contains no business logic of its own.
 */
export * from "./config.js";
export * from "./types/index.js";
export * from "./schemas/index.js";
export * from "./clients/index.js";
export * from "./tools/index.js";
export * from "./rules/index.js";
export * from "./flows/index.js";
export * from "./prompts/index.js";

export const AGENT_VERSION = "0.2.0";
