import { Injectable, Logger } from "@nestjs/common";
import type { VoiceAgentLlmProvider } from "./interfaces/voice-agent.provider";

export interface LlmCredentialCheck {
  valid: boolean;
  /** Safe to show the user. Never contains any part of the credential. */
  reason?: string;
}

/**
 * Checks a bring-your-own-key credential before Ringee hands it to the voice
 * provider, so a typo surfaces while the user is looking at the form instead
 * of as a failed call later.
 *
 * The check is a cheap, read-only call to the model provider's own list
 * endpoint. The key is never logged, never persisted here, and never returned.
 */
@Injectable()
export class LlmCredentialVerifier {
  private readonly logger = new Logger(LlmCredentialVerifier.name);

  async verify(
    provider: VoiceAgentLlmProvider,
    apiKey: string,
  ): Promise<LlmCredentialCheck> {
    if (provider === "ringee") {
      return { valid: true };
    }
    if (!apiKey.trim()) {
      return { valid: false, reason: "The API key is empty." };
    }

    try {
      const response = await this.probe(provider, apiKey.trim());
      if (response.ok) return { valid: true };
      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: "The provider rejected this API key." };
      }
      return {
        valid: false,
        reason: `The provider returned ${response.status} while verifying the key.`,
      };
    } catch (error) {
      // A network failure is not a bad key: say so rather than telling the
      // user their credential is wrong.
      this.logger.warn(
        `Could not reach ${provider} to verify a credential: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        valid: false,
        reason: "Could not reach the provider to verify the key. Try again.",
      };
    }
  }

  private probe(
    provider: Exclude<VoiceAgentLlmProvider, "ringee">,
    apiKey: string,
  ): Promise<Response> {
    switch (provider) {
      case "openai":
        return fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      case "anthropic":
        return fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
      case "google":
        return fetch(
          "https://generativelanguage.googleapis.com/v1beta/models",
          { headers: { "x-goog-api-key": apiKey } },
        );
    }
  }
}
