"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import type { NavItem } from "../types";
import { useApi } from "./use.api";

/** Answers already asked for, per signed-in user and workspace. */
const answers = new Map<string, Promise<boolean>>();

/**
 * Whether the active workspace may open AI Voice Agents (AGENT-011), as the
 * API answers it. Every organization has the module; a personal workspace has
 * it only when the server says so (the personal pilot), so only a personal
 * workspace asks — once per signed-in user and workspace, false until the
 * answer arrives. UX only: `VoiceAgentAccessGuard` and the services are the
 * boundary. `enabled: false` (a mock preview) asks nothing.
 */
export function useVoiceAgentModuleAccess(enabled = true): boolean {
  const { userId, orgId, isLoaded } = useAuth();
  const api = useApi();
  const key =
    enabled && isLoaded && userId && !orgId ? `${userId}:personal` : null;
  const [answer, setAnswer] = useState<{ key: string; value: boolean } | null>(
    null,
  );

  useEffect(() => {
    if (!key) return;
    let active = true;
    let pending = answers.get(key);
    if (!pending) {
      pending = api
        .get<{ hasAccess?: boolean }>("/ai-voice-agents-access")
        .then((res) => res?.hasAccess === true)
        .catch(() => {
          // Fail closed, and ask again next time instead of caching a failure.
          answers.delete(key);
          return false;
        });
      answers.set(key, pending);
    }
    void pending.then((value) => {
      if (active) setAnswer({ key, value });
    });
    return () => {
      active = false;
    };
  }, [api, key]);

  if (isLoaded && orgId) return true;
  return key !== null && answer?.key === key && answer.value;
}

/**
 * Whether a navigation entry can be opened in the active workspace: anything
 * outside an organization-only module, an organization workspace, or — for an
 * entry a personal workspace may be granted — that grant.
 */
export function isNavItemAvailable(
  item: Pick<NavItem, "organizationOnly" | "personalAccess">,
  workspace: { hasOrg: boolean; voiceAgentAccess: boolean },
): boolean {
  if (!item.organizationOnly || workspace.hasOrg) return true;
  return (
    item.personalAccess === "ai_voice_agents" && workspace.voiceAgentAccess
  );
}
