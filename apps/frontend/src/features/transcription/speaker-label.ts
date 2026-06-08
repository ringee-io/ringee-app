import type { useTranslations } from 'next-intl';

/**
 * Human label for a transcript segment's speaker. Prefers the track (the agent
 * = outbound, the contact = inbound), falling back to a numeric speaker index
 * from diarization.
 */
export function speakerLabel(
  track: string | null | undefined,
  speaker: number | null | undefined,
  t: ReturnType<typeof useTranslations>
): string {
  if (track === 'outbound') return t('speaker.you');
  if (track === 'inbound') return t('speaker.contact');
  if (typeof speaker === 'number') {
    return speaker === 0 ? t('speaker.you') : t('speaker.contact');
  }
  return t('speaker.unknown');
}
