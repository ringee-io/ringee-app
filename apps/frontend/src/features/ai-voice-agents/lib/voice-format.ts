import type { VoiceAgentVoice } from '../types';

/**
 * Display helpers for the voice catalogue. The API sends codes; the picker
 * shows a flag, a country and a language, because "es-MX" tells a user nothing
 * about how the agent will sound.
 */

/** "MX" → 🇲🇽. Returns an empty string when the provider reported no region. */
export function flagEmoji(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return '';
  return String.fromCodePoint(
    ...[...countryCode.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))
  );
}

/** "MX" → "Mexico", in the viewer's own language. */
export function countryName(countryCode: string | null | undefined): string {
  if (!countryCode) return '';
  try {
    return (
      new Intl.DisplayNames(undefined, { type: 'region' }).of(countryCode) ??
      countryCode
    );
  } catch {
    return countryCode;
  }
}

/** "es" → "Spanish", in the viewer's own language. */
export function languageName(code: string, displayLocale?: string): string {
  try {
    return (
      new Intl.DisplayNames(displayLocale, { type: 'language' }).of(code) ??
      code
    );
  } catch {
    return code;
  }
}

/**
 * What sits next to a voice's name: 🇲🇽 Mexico · Female.
 *
 * The gender word is passed in rather than looked up here, because it is copy
 * and copy comes from `next-intl` — this file only knows how to join the two.
 */
export function voiceOrigin(
  voice: VoiceAgentVoice,
  genderLabel: string
): string {
  const country = countryName(voice.countryCode) || voice.accent;
  return [country, genderLabel].filter(Boolean).join(' · ');
}
