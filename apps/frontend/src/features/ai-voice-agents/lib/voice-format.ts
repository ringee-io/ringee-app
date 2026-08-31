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
export function languageName(code: string): string {
  try {
    return (
      new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

const GENDER_LABELS: Record<VoiceAgentVoice['gender'], string> = {
  female: 'Female',
  male: 'Male',
  unspecified: 'Neutral'
};

export function genderLabel(gender: VoiceAgentVoice['gender']): string {
  return GENDER_LABELS[gender] ?? GENDER_LABELS.unspecified;
}

/** What sits next to a voice's name: 🇲🇽 Mexico · Female. */
export function voiceOrigin(voice: VoiceAgentVoice): string {
  const country = countryName(voice.countryCode) || voice.accent;
  return [country, genderLabel(voice.gender)].filter(Boolean).join(' · ');
}
