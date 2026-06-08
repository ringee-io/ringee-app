import type { useTranslations } from 'next-intl';

/**
 * Human label for a transcript segment's speaker. Prefers the track (the agent
 * = inbound, the contact = outbound), falling back to a numeric speaker index
 * from diarization.
 */
export function speakerLabel(
  track: string | null | undefined,
  speaker: number | null | undefined,
  t: ReturnType<typeof useTranslations>
): string {
  if (track === 'inbound') return t('speaker.you');
  if (track === 'outbound') return t('speaker.contact');
  if (typeof speaker === 'number') {
    return speaker === 0 ? t('speaker.contact') : t('speaker.you');
  }
  return t('speaker.unknown');
}
