'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { Container } from './primitives';
import styles from './feature-carousel.module.css';

export type FeatureCarouselGroup = {
  id: string;
  label: string;
  icon: ReactNode;
};

export type FeatureCarouselSlide = {
  id: string;
  group: string;
  card: ReactNode;
};

/**
 * Where a card snaps to: the track's start padding, the same distance as the
 * page's Container. Read from padding, whose computed value is always pixels.
 */
function edgeOf(track: HTMLElement): number {
  return parseFloat(getComputedStyle(track).paddingLeft) || 0;
}

/**
 * The moving part of the home feature carousel: a native scroll-snap track
 * (swipe, trackpad and arrow keys work without us), group chips that jump to
 * a group and follow the scroll, and previous/next buttons that move a
 * screenful at a time. The cards themselves are rendered on the server.
 */
export function FeatureCarouselTrack({
  groups,
  slides,
  labels,
  className
}: {
  groups: FeatureCarouselGroup[];
  slides: FeatureCarouselSlide[];
  labels: { track: string; groups: string; previous: string; next: string };
  className?: string;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const slideElements = useCallback(
    () =>
      Array.from(
        trackRef.current?.querySelectorAll<HTMLElement>('[data-slide]') ?? []
      ),
    []
  );

  const sync = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const x = track.scrollLeft;
    const end = x >= max - 4;
    setAtStart(x <= 4);
    setAtEnd(end);

    // The current card is the first one whose middle is past the snap line.
    // At the end of the track the last card counts, so the last group can be
    // current even though its first card never reaches the line.
    const items = slideElements();
    const line = x + edgeOf(track);
    const index = end
      ? items.length - 1
      : Math.max(
          0,
          items.findIndex((el) => el.offsetLeft + el.offsetWidth / 2 > line)
        );
    setCurrent(index);

    const thumb = thumbRef.current;
    if (thumb && track.scrollWidth > 0) {
      thumb.style.width = `${(track.clientWidth / track.scrollWidth) * 100}%`;
      thumb.style.left = `${(x / track.scrollWidth) * 100}%`;
    }
  }, [slideElements]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    sync();
    track.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(track);
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [sync]);

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    const target = slideElements()[index];
    if (!track || !target) return;
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    track.scrollTo({
      left: target.offsetLeft - edgeOf(track),
      behavior: reduce ? 'auto' : 'smooth'
    });
  };

  /** Previous/next move by the number of cards that fit on screen. */
  const page = (direction: 1 | -1) => {
    const track = trackRef.current;
    const [first, second] = slideElements();
    if (!track || !first) return;
    const step = second
      ? second.offsetLeft - first.offsetLeft
      : first.offsetWidth;
    const visible = Math.max(
      1,
      Math.floor((track.clientWidth - edgeOf(track)) / step)
    );
    scrollToIndex(
      Math.min(slides.length - 1, Math.max(0, current + direction * visible))
    );
  };

  const currentGroup = slides[current]?.group;
  const arrowClass =
    'border-border bg-background text-foreground inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border shadow-sm transition hover:border-foreground/30 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-35';

  return (
    <div className={className}>
      <Container>
        <nav
          aria-label={labels.groups}
          className='flex flex-wrap justify-center gap-2'
        >
          {groups.map((group) => {
            const active = group.id === currentGroup;
            return (
              <button
                key={group.id}
                type='button'
                aria-current={active ? 'true' : undefined}
                onClick={() =>
                  scrollToIndex(slides.findIndex((s) => s.group === group.id))
                }
                className={cn(
                  'focus-visible:ring-offset-background inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
              >
                {group.icon}
                {group.label}
              </button>
            );
          })}
        </nav>
      </Container>

      <div className={cn(styles.viewport, 'mt-6')}>
        <ul
          ref={trackRef}
          aria-label={labels.track}
          tabIndex={0}
          className={styles.track}
        >
          {slides.map((slide) => (
            <li key={slide.id} data-slide className={styles.slide}>
              {slide.card}
            </li>
          ))}
        </ul>
      </div>

      <Container className='flex items-center gap-6'>
        <div
          aria-hidden
          className='bg-border relative h-[3px] flex-1 overflow-hidden rounded-full'
        >
          <span
            ref={thumbRef}
            className='bg-foreground/70 absolute inset-y-0 left-0 w-1/4 rounded-full'
          />
        </div>
        <div className='flex gap-2'>
          <button
            type='button'
            aria-label={labels.previous}
            disabled={atStart}
            onClick={() => page(-1)}
            className={arrowClass}
          >
            <ArrowLeft className='h-5 w-5' aria-hidden />
          </button>
          <button
            type='button'
            aria-label={labels.next}
            disabled={atEnd}
            onClick={() => page(1)}
            className={arrowClass}
          >
            <ArrowRight className='h-5 w-5' aria-hidden />
          </button>
        </div>
      </Container>
    </div>
  );
}
