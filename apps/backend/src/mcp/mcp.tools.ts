import "reflect-metadata";
import { ZodRawShape } from "zod";

export const MCP_TOOL_METADATA = "MCP_TOOL";
export const MCP_PROMPT_METADATA = "MCP_PROMPT";

/**
 * MCP tool annotations (the trust hints surfaced to clients like ChatGPT /
 * Claude). Mirrors the `ToolAnnotations` shape in the MCP spec. OpenAI's Apps
 * SDK requires `readOnlyHint`, `openWorldHint` and `destructiveHint` to be set
 * explicitly on every tool.
 */
export interface McpToolAnnotations {
  /** Human-friendly title for the tool. */
  title?: string;
  /** True when the tool only reads and never modifies state. */
  readOnlyHint?: boolean;
  /**
   * True when the tool may perform irreversible/destructive updates.
   * Meaningful only when `readOnlyHint` is false.
   */
  destructiveHint?: boolean;
  /**
   * True when repeating the call with the same arguments has no additional
   * effect. Meaningful only when `readOnlyHint` is false.
   */
  idempotentHint?: boolean;
  /**
   * True when the tool reaches an external ("open world") system — e.g. a
   * third-party enrichment provider or calendar — rather than only Ringee's
   * own database.
   */
  openWorldHint?: boolean;
}

export interface McpToolMeta {
  toolName: string;
  description?: string;
  zod?: ZodRawShape;
  annotations?: McpToolAnnotations;
}

export interface McpToolEntry {
  data: McpToolMeta;
  func: string | symbol;
}

export function McpTool(params: McpToolMeta) {
  return function (
    target: object,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor,
  ) {
    const existing: McpToolEntry[] =
      Reflect.getMetadata(MCP_TOOL_METADATA, target) || [];

    existing.push({ data: params, func: propertyKey });

    Reflect.defineMetadata(MCP_TOOL_METADATA, existing, target);
  };
}

export interface McpPromptMeta {
  promptName: string;
  description?: string;
  zod?: ZodRawShape;
}

export interface McpPromptEntry {
  data: McpPromptMeta;
  func: string | symbol;
}

export function McpPrompt(params: McpPromptMeta) {
  return function (
    target: object,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor,
  ) {
    const existing: McpPromptEntry[] =
      Reflect.getMetadata(MCP_PROMPT_METADATA, target) || [];

    existing.push({ data: params, func: propertyKey });

    Reflect.defineMetadata(MCP_PROMPT_METADATA, existing, target);
  };
}
