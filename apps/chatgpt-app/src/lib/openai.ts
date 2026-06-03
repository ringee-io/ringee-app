"use client";

import { useSyncExternalStore } from "react";

/**
 * Bridge to the ChatGPT Apps SDK runtime.
 *
 * When a component is rendered inside ChatGPT it runs in an iframe with a
 * `window.openai` global that carries the tool output, theme, display mode and
 * helpers to call tools / send follow-up messages. Outside ChatGPT (our local
 * gallery) the global is absent, so the hooks degrade gracefully and the
 * components render standalone for design review.
 *
 * Reads use `useSyncExternalStore` so the very first paint already reflects the
 * host globals (no flash of fallback/mock data) and re-render when the host
 * dispatches `openai:set_globals`.
 *
 * See: https://developers.openai.com/apps-sdk
 */

export type DisplayMode = "inline" | "pip" | "fullscreen";
export type ColorScheme = "light" | "dark";

export interface OpenAiGlobals {
  toolInput?: unknown;
  toolOutput?: unknown;
  /** Widget-only result data (never seen by the model). */
  toolResponseMetadata?: unknown;
  widgetState?: unknown;
  theme?: ColorScheme;
  displayMode?: DisplayMode;
  maxHeight?: number;
  locale?: string;
}

/** Result shape returned by `window.openai.callTool`. */
export interface CallToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface OpenAiApi extends OpenAiGlobals {
  callTool?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResult>;
  // NOTE: the Apps SDK method is `sendFollowUpMessage` (camelCase U + M).
  // The previous `sendFollowupMessage` spelling silently no-op'd every button.
  sendFollowUpMessage?: (args: { prompt: string }) => Promise<void>;
  requestDisplayMode?: (args: { mode: DisplayMode }) => Promise<void>;
  setWidgetState?: (state: unknown) => Promise<void>;
}

declare global {
  interface Window {
    openai?: OpenAiApi;
  }
}

const SET_GLOBALS_EVENT = "openai:set_globals";

/** Subscribe to host global changes. Stable reference for useSyncExternalStore. */
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SET_GLOBALS_EVENT, onChange);
  return () => window.removeEventListener(SET_GLOBALS_EVENT, onChange);
}

function readGlobal<K extends keyof OpenAiApi>(
  key: K,
): OpenAiApi[K] | undefined {
  if (typeof window === "undefined") return undefined;
  return window.openai?.[key];
}

/** Subscribe to a single `window.openai` global with SSR-safe fallback. */
function useOpenAiGlobal<K extends keyof OpenAiApi>(
  key: K,
): OpenAiApi[K] | undefined {
  return useSyncExternalStore(
    subscribe,
    () => readGlobal(key),
    () => undefined,
  );
}

/** Raw tool output (the tool's `structuredContent`), or `undefined` until ready. */
export function useToolOutputRaw<T>(): T | undefined {
  return useOpenAiGlobal("toolOutput") as T | undefined;
}

/** Read the tool output rendered into this component, or `fallback` standalone. */
export function useToolOutput<T>(fallback: T): T {
  return useToolOutputRaw<T>() ?? fallback;
}

/** True when running embedded inside ChatGPT (synchronous, no flash). */
export function useIsEmbedded(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== "undefined" && !!window.openai,
    () => false,
  );
}

export function useColorScheme(): ColorScheme {
  return useOpenAiGlobal("theme") ?? "light";
}

export function useDisplayMode(): DisplayMode {
  return useOpenAiGlobal("displayMode") ?? "inline";
}

/** Ask ChatGPT to run a follow-up turn (e.g. "reveal this lead"). No-op standalone. */
export async function sendFollowup(prompt: string): Promise<void> {
  if (typeof window === "undefined" || !window.openai?.sendFollowUpMessage)
    return;
  await window.openai.sendFollowUpMessage({ prompt });
}

/** Call a tool directly through the host. Returns undefined standalone. */
export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallToolResult | undefined> {
  if (typeof window === "undefined" || !window.openai?.callTool)
    return undefined;
  return window.openai.callTool(name, args);
}

/**
 * Call a tool and return its parsed data (the `structuredContent`, or the JSON
 * in the text content as a fallback). Used for in-widget interactions like
 * paginating a list without a round-trip through the model. Returns `null` when
 * the host can't run tools (standalone) or the call failed.
 */
export async function callToolData<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T | null> {
  const res = await callTool(name, args);
  if (!res || res.isError) return null;
  if (res.structuredContent != null) return res.structuredContent as T;
  const text = res.content?.find((c) => c.type === "text" && c.text)?.text;
  if (text) {
    try {
      return JSON.parse(text) as T;
    } catch {
      /* not JSON */
    }
  }
  return null;
}
