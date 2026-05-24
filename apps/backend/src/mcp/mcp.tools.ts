import "reflect-metadata";
import { ZodRawShape } from "zod";

export const MCP_TOOL_METADATA = "MCP_TOOL";
export const MCP_PROMPT_METADATA = "MCP_PROMPT";

export interface McpToolMeta {
  toolName: string;
  description?: string;
  zod?: ZodRawShape;
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
