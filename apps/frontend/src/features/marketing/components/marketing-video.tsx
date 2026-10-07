'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { MARKETING_VIDEOS, type MarketingVideoId } from '../content/videos';

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean };
};

/**
 * A product video from `content/videos.ts`. It plays muted and looping once at
 * least half of it has stayed on screen for a moment, pauses once it has
 * scrolled away and resumes when it comes back — unless the viewer paused it.
 * Nothing downloads before that. Viewers who ask for reduced motion or to save
 * data get the poster and press play themselves; the native controls give
 * everyone sound and full screen.
 */
export function MarketingVideo({
  id,
  className
}: {
  id: MarketingVideoId;
  className?: string;
}) {
  const { src, version, label } = MARKETING_VIDEOS[id];
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const saveData = (navigator as NavigatorWithConnection).connection
      ?.saveData;
    if (
      saveData ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    // A browser starts a video on its own only while it is muted. Set the
    // property: React does not render `muted` into the server HTML.
    video.muted = true;

    let onScreen = false;
    let pausedByViewer = false;
    // Off screen or in a background tab a pause is ours or the browser's; on
    // screen only the viewer can pause.
    const onPause = () => {
      if (onScreen && !document.hidden) pausedByViewer = true;
    };
    const onPlay = () => {
      pausedByViewer = false;
    };

    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        clearTimeout(startTimer);
        if (entry.intersectionRatio >= 0.5) {
          // Start once it has stayed on screen for a moment, so a page
          // scrolled straight past downloads nothing.
          startTimer = setTimeout(() => {
            if (pausedByViewer) return;
            void video.play().catch(() => {
              /* Autoplay refused (e.g. low-power mode): the poster stays. */
            });
          }, 300);
        } else if (!entry.isIntersecting) {
          video.pause();
        }
      },
      { threshold: [0, 0.5] }
    );

    observer.observe(video);
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    return () => {
      clearTimeout(startTimer);
      observer.disconnect();
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
    };
  }, []);

  const query = `?v=${version}`;

  return (
    <div
      className={cn(
        'border-border/70 aspect-video overflow-hidden rounded-2xl border bg-black shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)]',
        className
      )}
    >
      <video
        ref={videoRef}
        poster={`${src}-poster.jpg${query}`}
        preload='none'
        controls
        loop
        playsInline
        aria-label={label}
        className='h-full w-full object-cover'
      >
        {/* The first source a browser can play wins: 720p on phones, then the
            smaller WebM, then the MP4 every browser decodes. */}
        <source
          src={`${src}-720p.mp4${query}`}
          type='video/mp4'
          media='(max-width: 767px)'
        />
        <source
          src={`${src}.webm${query}`}
          type='video/webm; codecs="vp9, opus"'
        />
        <source src={`${src}.mp4${query}`} type='video/mp4' />
      </video>
    </div>
  );
}
