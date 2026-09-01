'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useVoiceAgentApi } from '../api';

/**
 * Plays a sample of a voice before the user commits to it.
 *
 * One audio element for the whole picker, so pressing play on a second voice
 * stops the first instead of talking over it. Rendered samples are kept for the
 * life of the page — the audio never changes, and the provider bills each
 * render.
 */
export function useVoicePreview() {
  const t = useTranslations('aiVoiceAgents.voice');
  const api = useVoiceAgentApi();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef(new Map<string, string>());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.addEventListener('ended', () => setPlayingId(null));
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlayingId(null);
  }, []);

  const play = useCallback(
    async (voiceId: string) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (playingId === voiceId) {
        stop();
        return;
      }

      audio.pause();
      setPlayingId(null);
      setLoadingId(voiceId);
      try {
        let src = cacheRef.current.get(voiceId);
        if (!src) {
          const preview = await api.previewVoice(voiceId);
          src = `data:${preview.contentType};base64,${preview.audioBase64}`;
          cacheRef.current.set(voiceId, src);
        }
        audio.src = src;
        await audio.play();
        setPlayingId(voiceId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('previewError'));
      } finally {
        setLoadingId(null);
      }
    },
    [api, playingId, stop, t]
  );

  return { play, stop, playingId, loadingId };
}
