'use client';

import Image from 'next/image';
import { Maximize2, Play, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import type { WallImage, WallVideo } from '../content/wall-of-love';

// The interactive parts of a wall-of-love card. Each sits above the card's
// stretched link (`relative z-10`), so using it never opens the original.

/**
 * A quote clamped to a few lines, with a toggle to read the rest in place.
 * The toggle only shows when the clamp hides something.
 */
export function ExpandableText({
  children,
  lang,
  moreLabel,
  lessLabel,
  clampClassName = 'line-clamp-6',
  className
}: {
  children: ReactNode;
  lang: string;
  moreLabel: string;
  lessLabel: string;
  clampClassName?: string;
  className?: string;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const text = textRef.current;
    if (!text || expanded) return;
    const measure = () => setClamped(text.scrollHeight > text.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <div className={className}>
      <div
        ref={textRef}
        lang={lang}
        className={cn('whitespace-pre-line', !expanded && clampClassName)}
      >
        {children}
      </div>
      {clamped || expanded ? (
        <button
          type='button'
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className='relative z-10 mt-1 cursor-pointer rounded text-[12.5px] font-medium text-black/50 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:text-white/50 dark:hover:text-white'
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  );
}

/** The testimonial video playing now, so starting another one pauses it. */
let playingVideo: HTMLVideoElement | null = null;

/**
 * A video testimonial. Until someone presses play it is only its poster, an
 * optimized image, and the video itself downloads nothing. A portrait video
 * is framed at 4:5 so one clip does not take over a column; once it plays it
 * is shown whole.
 */
export function TestimonialVideo({
  video,
  playLabel,
  className
}: {
  video: WallVideo;
  playLabel: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const onPlay = () => {
      if (playingVideo && playingVideo !== element) playingVideo.pause();
      playingVideo = element;
    };
    element.addEventListener('play', onPlay);
    return () => {
      element.removeEventListener('play', onPlay);
      if (playingVideo === element) playingVideo = null;
    };
  }, []);

  const start = () => {
    setStarted(true);
    // Called inside the click, so the browser lets it play with sound.
    void videoRef.current?.play().catch(() => {
      /* Refused or unplayable: the native controls are there to retry. */
    });
  };

  return (
    <div
      className={cn('relative z-10 overflow-hidden bg-black', className)}
      style={{ aspectRatio: Math.max(video.width / video.height, 4 / 5) }}
    >
      <video
        ref={videoRef}
        src={video.src}
        preload='none'
        playsInline
        controls={started}
        aria-label={video.label}
        className={cn(
          'absolute inset-0 h-full w-full',
          started ? 'object-contain' : 'object-cover'
        )}
      />
      {started ? null : (
        <button
          type='button'
          onClick={start}
          className='group/play absolute inset-0 flex cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-emerald-400'
        >
          <Image
            src={video.poster}
            alt=''
            fill
            sizes='(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw'
            className='object-cover'
          />
          <span
            aria-hidden
            className='absolute inset-0 bg-black/10 transition-colors group-hover/play:bg-black/25'
          />
          <span className='relative flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-neutral-900 shadow-lg transition-transform group-hover/play:scale-105'>
            <Play className='ml-0.5 h-6 w-6 fill-current' aria-hidden />
          </span>
          <span className='sr-only'>{playLabel}</span>
        </button>
      )}
    </div>
  );
}

/**
 * A screenshot shown at most a phone screen tall, which opens whole in a
 * lightbox. A native modal `<dialog>` brings focus trapping, Escape and focus
 * return; the shared Radix dialog's scroll lock does not fit the marketing
 * layout, where `html` is the scroll container (see `ManualDialerPreview`).
 */
export function ScreenshotLightbox({
  image,
  title,
  openLabel,
  closeLabel
}: {
  image: WallImage;
  title: string;
  openLabel: string;
  closeLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreScroll = useRef<(() => void) | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      restoreScroll.current?.();
      restoreScroll.current = null;
    };
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('close', onClose);
      onClose();
    };
  }, []);

  const open = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // The marketing layout scrolls `html` with an `!important` rule, so only
    // an inline `!important` keeps the page still behind the lightbox.
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('overflow');
    const previousPriority = root.style.getPropertyPriority('overflow');
    root.style.setProperty('overflow', 'hidden', 'important');
    restoreScroll.current = () => {
      if (previous)
        root.style.setProperty('overflow', previous, previousPriority);
      else root.style.removeProperty('overflow');
    };
  };

  return (
    <>
      <button
        type='button'
        onClick={open}
        className='group/shot relative z-10 block w-full cursor-zoom-in overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500'
      >
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes='(min-width: 1280px) 300px, (min-width: 640px) 45vw, 80vw'
          className='h-auto max-h-80 w-full object-cover object-top'
        />
        <span className='absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm transition-colors group-hover/shot:bg-black/80'>
          <Maximize2 className='h-3 w-3' aria-hidden />
          {openLabel}
        </span>
      </button>

      <dialog
        ref={dialogRef}
        aria-label={title}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className='m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-2xl bg-transparent p-0 backdrop:bg-black/80 backdrop:backdrop-blur-sm'
      >
        <div className='sticky top-0 z-10 flex h-0 justify-end'>
          <button
            type='button'
            onClick={() => dialogRef.current?.close()}
            aria-label={closeLabel}
            className='mt-3 mr-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/65 text-white backdrop-blur-sm transition-colors hover:bg-black/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400'
          >
            <X className='h-4 w-4' aria-hidden />
          </button>
        </div>
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes='(min-width: 640px) 544px, 100vw'
          className='h-auto w-full rounded-2xl'
        />
      </dialog>
    </>
  );
}
