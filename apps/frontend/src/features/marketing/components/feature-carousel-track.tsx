'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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
  content: ReactNode;
};

/**
 * Where a card snaps to: the track's start padding, the same distance as the
 * page's Container. Read from padding, whose computed value is always pixels.
 */
function edgeOf(track: HTMLElement): number {
  return parseFloat(getComputedStyle(track).paddingLeft) || 0;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The moving part of the home feature carousel: a native scroll-snap track
 * (swipe, trackpad and arrow keys work without us), group chips that jump to
 * a group and follow the scroll, and previous/next buttons that move a
 * screenful at a time. The cards themselves are rendered on the server.
 *
 * Motion is opt-in: the carousel arms its entrance and the cards' scenes only
 * when the viewer allows motion and the section is still below the fold, so
 * nothing already on screen blinks out.
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
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const chipsRef = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [pill, setPill] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

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

  /** Slides the dark pill under the current group's chip. */
  const placePill = useCallback(() => {
    const chip = chipsRef.current?.querySelector<HTMLElement>(
      '[aria-current="true"]'
    );
    if (!chip) return;
    const next = {
      x: chip.offsetLeft,
      y: chip.offsetTop,
      w: chip.offsetWidth,
      h: chip.offsetHeight
    };
    setPill((prev) =>
      prev &&
      prev.x === next.x &&
      prev.y === next.y &&
      prev.w === next.w &&
      prev.h === next.h
        ? prev
        : next
    );
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    const onResize = () => {
      onScroll();
      placePill();
    };
    sync();
    track.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(onResize);
    observer.observe(track);
    if (chipsRef.current) observer.observe(chipsRef.current);
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [sync, placePill]);

  const currentGroup = slides[current]?.group;
  useEffect(placePill, [currentGroup, placePill]);

  // The entrance, then each card's scene the first time it is on screen.
  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track || prefersReducedMotion()) return;
    if (!('IntersectionObserver' in window)) return;

    const box = root.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;
    root.dataset.armed = '';

    const scenes = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.55) continue;
          (entry.target as HTMLElement).dataset.play = '';
          scenes.unobserve(entry.target);
        }
      },
      { root: track, threshold: 0.55 }
    );
    let wait: ReturnType<typeof setTimeout> | undefined;
    const entrance = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        root.dataset.shown = '';
        entrance.disconnect();
        // Scenes start once the cards have risen into place.
        wait = setTimeout(
          () => slideElements().forEach((el) => scenes.observe(el)),
          450
        );
      },
      { threshold: 0.2 }
    );
    entrance.observe(track);
    return () => {
      clearTimeout(wait);
      entrance.disconnect();
      scenes.disconnect();
    };
  }, [slideElements]);

  const scrollToSlide = (target: HTMLElement | undefined) => {
    const track = trackRef.current;
    if (!track || !target) return;
    track.scrollTo({
      left: target.offsetLeft - edgeOf(track),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    });
  };

  /**
   * Next brings the first card that is not fully on screen to the snap line;
   * previous goes back about a screen and lands on a card's start. Cards are
   * not one width, so this is measured, not counted.
   */
  const page = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const items = slideElements();
    const edge = edgeOf(track);
    const x = track.scrollLeft;
    if (direction === 1) {
      const right = x + track.clientWidth;
      const next = items.find(
        (el) =>
          el.offsetLeft + el.offsetWidth > right + 1 &&
          el.offsetLeft - edge > x + 1
      );
      scrollToSlide(next ?? items[items.length - 1]);
    } else {
      const target = x - (track.clientWidth - edge);
      const previous = items.find((el) => el.offsetLeft - edge >= target - 1);
      scrollToSlide(previous ?? items[0]);
    }
  };

  const arrowClass =
    'border-border bg-background text-foreground inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border shadow-sm transition hover:border-foreground/30 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-35';

  return (
    <div ref={rootRef} className={cn(styles.root, className)}>
      <Container>
        <nav
          ref={chipsRef}
          aria-label={labels.groups}
          className={cn(styles.chips, 'flex flex-wrap justify-center gap-2')}
        >
          {pill ? (
            <span
              aria-hidden
              className={styles.indicator}
              style={{
                width: pill.w,
                height: pill.h,
                transform: `translate(${pill.x}px, ${pill.y}px)`
              }}
            />
          ) : null}
          {groups.map((group) => {
            const active = group.id === currentGroup;
            return (
              <button
                key={group.id}
                type='button'
                aria-current={active ? 'true' : undefined}
                onClick={() =>
                  scrollToSlide(
                    slideElements()[
                      slides.findIndex((slide) => slide.group === group.id)
                    ]
                  )
                }
                className={cn(
                  'focus-visible:ring-offset-background relative inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:h-10 sm:px-4 sm:text-sm',
                  active
                    ? cn(
                        'border-foreground text-background',
                        pill ? 'bg-transparent' : 'bg-foreground'
                      )
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
          {slides.map((slide, index) => (
            <li
              key={slide.id}
              data-slide
              className={styles.slide}
              style={{ '--i': index } as CSSProperties}
            >
              {slide.content}
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
            className='bg-foreground/70 absolute inset-y-0 left-0 w-1/4 rounded-full transition-[left] duration-150'
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
