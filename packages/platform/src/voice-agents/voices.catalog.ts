import type { VoiceAgentVoice } from "./interfaces/voice-agent.provider";

/**
 * Voice curation.
 *
 * The provider offers thousands of voices across every model tier it has ever
 * shipped, which is a catalogue, not a picker. Ringee curates by policy rather
 * than by a hand-written allowlist: a hard-coded list of ids would drift out of
 * date silently, whereas a policy re-evaluates against whatever the provider
 * currently offers.
 *
 * The policy is: conversational model tiers only, one of the languages Ringee
 * supports, and a cap per locale so no single language floods the list.
 */

/** Provider TTS model tiers suitable for a real-time phone conversation. */
export const CURATED_VOICE_MODELS = ["Ultra"] as const;

/** Base languages Ringee offers voices in. */
export const CURATED_VOICE_LANGUAGES = [
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
] as const;

/** Upper bound per locale, so the picker stays scannable. */
export const CURATED_VOICES_PER_LOCALE = 8;

/** A voice exactly as a provider reports it, before curation. */
export interface RawProviderVoice {
  id: string;
  name?: string | null;
  label?: string | null;
  language?: string | null;
  accent?: string | null;
  gender?: string | null;
  provider?: string | null;
  model_id?: string | null;
  hosted?: boolean | null;
}

function normalizeGender(
  raw: string | null | undefined,
): VoiceAgentVoice["gender"] {
  const value = (raw ?? "").toLowerCase();
  if (value === "female") return "female";
  if (value === "male") return "male";
  return "unspecified";
}

/** "es-MX" → "es"; "es" → "es". */
export function baseLanguage(locale: string): string {
  return locale.split("-")[0]!.toLowerCase();
}

/**
 * A provider voice name is often "Carolina - Friendly Guide": the part before
 * the dash is the persona, which is what a user picks by. The rest is a
 * description and belongs in the subtitle.
 */
function splitName(raw: string): {
  displayName: string;
  suffix: string | null;
} {
  const [first, ...rest] = raw.split(" - ");
  const displayName = (first ?? raw).trim();
  const suffix = rest.length ? rest.join(" - ").trim() : null;
  return { displayName: displayName || raw.trim(), suffix };
}

/**
 * Applies the curation policy to a provider's full voice list.
 *
 * Ordering is stable and deterministic — locale, then display name — because
 * the list is rendered as a picker and a shifting order looks like a bug.
 */
export function curateVoices(raw: RawProviderVoice[]): VoiceAgentVoice[] {
  const models = new Set<string>(CURATED_VOICE_MODELS);
  const languages = new Set<string>(CURATED_VOICE_LANGUAGES);

  const eligible = raw.filter((voice) => {
    if (!voice.id || !voice.name) return false;
    if (voice.hosted === false) return false;
    if (!voice.model_id || !models.has(voice.model_id)) return false;
    const language = voice.language ? baseLanguage(voice.language) : null;
    return !!language && languages.has(language);
  });

  const mapped: VoiceAgentVoice[] = eligible.map((voice) => {
    const { displayName, suffix } = splitName(voice.name!);
    const locale = voice.language!;
    return {
      id: voice.id,
      displayName,
      description: voice.label?.trim() || suffix,
      language: baseLanguage(locale),
      locale: locale.includes("-") ? locale : null,
      accent: voice.accent?.trim() || null,
      gender: normalizeGender(voice.gender),
    };
  });

  mapped.sort((a, b) => {
    const localeCompare = (a.locale ?? a.language).localeCompare(
      b.locale ?? b.language,
    );
    return localeCompare !== 0
      ? localeCompare
      : a.displayName.localeCompare(b.displayName);
  });

  const perLocale = new Map<string, number>();
  return mapped.filter((voice) => {
    const key = voice.locale ?? voice.language;
    const taken = perLocale.get(key) ?? 0;
    if (taken >= CURATED_VOICES_PER_LOCALE) return false;
    perLocale.set(key, taken + 1);
    return true;
  });
}
