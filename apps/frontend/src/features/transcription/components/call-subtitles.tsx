'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { CallTranscriptionView, TranscriptSegmentView } from '../types';

type Side = 'you' | 'contact';

interface Props {
  /** The live transcription view (segments + livePartial). */
  data: CallTranscriptionView | null;
  /** Whether captions are toggled on. */
  show: boolean;
  /**
   * Milliseconds a finished line stays on screen after the speaker goes quiet.
   * Live partials never auto-hide while audio keeps flowing.
   */
  holdMs?: number;
}

/**
 * Cinema-style live captions overlaid on top of everything. The contact's words
 * read at the bottom (classic subtitle position) and your own words at the top,
 * so a call reads like a two-sided conversation. Rendered through a portal to
 * escape the (transformed) call modal and pin to the viewport.
 */
export function CallSubtitles({ data, show, holdMs = 6000 }: Props) {
  const t = useTranslations('transcription');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const segments = data?.realtime?.segments ?? [];
  const partial = data?.livePartial ?? null;
  const partialSide: Side | null = partial ? sideOf(partial.track, null) : null;

  const lastYou = useMemo(() => latestForSide(segments, 'you'), [segments]);
  const lastContact = useMemo(
    () => latestForSide(segments, 'contact'),
    [segments]
  );

  const youLive = partialSide === 'you' && !!partial?.text;
  const contactLive = partialSide === 'contact' && !!partial?.text;
  const youText = youLive ? partial!.text : lastYou?.text;
  const contactText = contactLive ? partial!.text : lastContact?.text;

  const youVisible = useHoldVisible(youText, youLive, holdMs);
  const contactVisible = useHoldVisible(contactText, contactLive, holdMs);

  if (!mounted || !show) return null;

  return createPortal(
    <div className='pointer-events-none fixed inset-0 z-[100]'>
      <div className='absolute inset-x-0 top-6 flex justify-center px-4 md:top-8'>
        <Caption
          side='you'
          label={t('speaker.you')}
          text={youText}
          live={youLive}
          visible={youVisible}
        />
      </div>
      <div className='absolute inset-x-0 bottom-8 flex justify-center px-4 md:bottom-10'>
        <Caption
          side='contact'
          label={t('speaker.contact')}
          text={contactText}
          live={contactLive}
          visible={contactVisible}
        />
      </div>
    </div>,
    document.body
  );
}

function Caption({
  side,
  label,
  text,
  live,
  visible
}: {
  side: Side;
  label: string;
  text: string | undefined;
  live: boolean;
  visible: boolean;
}) {
  if (!text) return null;
  return (
    <div
      className={cn(
        'max-w-3xl rounded-2xl bg-black/75 px-5 py-3 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur-sm transition-all duration-300',
        side === 'you' ? 'slide-in-from-top-2' : 'slide-in-from-bottom-2',
        visible
          ? 'animate-in fade-in-0 opacity-100'
          : 'pointer-events-none translate-y-1 opacity-0'
      )}
    >
      <span
        className={cn(
          'mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase',
          side === 'you' ? 'text-emerald-400' : 'text-sky-400'
        )}
      >
        {live && (
          <span className='inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current' />
        )}
        {label}
      </span>
      <p
        className={cn(
          'line-clamp-3 text-lg leading-snug font-medium text-white drop-shadow-md md:text-2xl',
          live && 'text-white/85'
        )}
      >
        {text}
      </p>
    </div>
  );
}

/**
 * Keeps a caption visible while it's live, then fades it out `holdMs` after the
 * last change so the screen clears during silence.
 */
function useHoldVisible(
  text: string | undefined,
  live: boolean,
  holdMs: number
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!text) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (live) return;
    const id = setTimeout(() => setVisible(false), holdMs);
    return () => clearTimeout(id);
  }, [text, live, holdMs]);

  return visible && !!text;
}

function latestForSide(
  segments: TranscriptSegmentView[],
  side: Side
): TranscriptSegmentView | undefined {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (sideOf(segments[i].track, segments[i].speaker) === side) {
      return segments[i];
    }
  }
  return undefined;
}

/** Map a segment's track / diarization speaker to a screen side. */
function sideOf(
  track: string | null | undefined,
  speaker: number | null | undefined
): Side {
  if (track === 'inbound') return 'you';
  if (track === 'outbound') return 'contact';
  if (typeof speaker === 'number') {
    return speaker === 0 ? 'contact' : 'you';
  }
  return 'contact';
}
