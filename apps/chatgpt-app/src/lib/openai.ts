"use client";

import { useEffect, useState } from "react";

/**
 * Bridge to the ChatGPT Apps SDK runtime.
 *
 * When a component is rendered inside ChatGPT it runs in an iframe with a
 * `window.openai` global that carries the tool output, theme, display mode and
 * helpers to call tools / send follow-up messages. Outside ChatGPT (our local
 * gallery) the global is absent, so every hook accepts a fallback so the same
 * components render standalone for design review.
 *
 * See: https://developers.openai.com/apps-sdk
 */

export type DisplayMode = "inline" | "pip" | "fullscreen";
export type ColorScheme = "light" | "dark";

export interface OpenAiGlobals {
  toolInput?: unknown;
  toolOutput?: unknown;
  widgetState?: unknown;
  theme?: ColorScheme;
  displayMode?: DisplayMode;
  maxHeight?: number;
  locale?: string;
}

export interface OpenAiApi extends OpenAiGlobals {
  callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  sendFollowupMessage?: (args: { prompt: string }) => Promise<void>;
  requestDisplayMode?: (args: { mode: DisplayMode }) => Promise<void>;
  setWidgetState?: (state: unknown) => Promise<void>;
}

declare global {
  interface Window {
    openai?: OpenAiApi;
  }
}

const SET_GLOBALS_EVENT = "openai:set_globals";

function readGlobal<K extends keyof OpenAiApi>(key: K): OpenAiApi[K] | undefined {
  if (typeof window === "undefined") return undefined;
  return window.openai?.[key];
}

/** Subscribe to a single `window.openai` global with SSR-safe fallback. */
function useOpenAiGlobal<K extends keyof OpenAiApi>(
  key: K,
): OpenAiApi[K] | undefined {
  const [value, setValue] = useState<OpenAiApi[K] | undefined>(undefined);

  useEffect(() => {
    setValue(readGlobal(key));
    const onUpdate = () => setValue(readGlobal(key));
    window.addEventListener(SET_GLOBALS_EVENT, onUpdate);
    return () => window.removeEventListener(SET_GLOBALS_EVENT, onUpdate);
  }, [key]);

  return value;
}

/** Read the tool output rendered into this component, or `fallback` standalone. */
export function useToolOutput<T>(fallback: T): T {
  const output = useOpenAiGlobal("toolOutput") as T | undefined;
  return output ?? fallback;
}

/** True when running embedded inside ChatGPT. */
export function useIsEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => setEmbedded(typeof window !== "undefined" && !!window.openai), []);
  return embedded;
}

export function useColorScheme(): ColorScheme {
  return useOpenAiGlobal("theme") ?? "light";
}

export function useDisplayMode(): DisplayMode {
  return useOpenAiGlobal("displayMode") ?? "inline";
}

/** Ask ChatGPT to run a follow-up turn (e.g. "reveal this lead"). No-op standalone. */
export async function sendFollowup(prompt: string): Promise<void> {
  if (typeof window === "undefined" || !window.openai?.sendFollowupMessage) return;
  await window.openai.sendFollowupMessage({ prompt });
}

/** Call a tool directly through the host. No-op standalone. */
export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  if (typeof window === "undefined" || !window.openai?.callTool) return undefined;
  return window.openai.callTool(name, args);
}
