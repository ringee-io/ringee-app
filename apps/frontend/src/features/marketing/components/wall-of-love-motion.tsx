'use client';

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import { ArrowUpRight, Heart, Pointer, X } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { MarketingLink as Link } from './marketing-link';
import {
  WallCard,
  type WallCardData,
  type WallCardLabels
} from './wall-of-love-card';
import { STAGE_BADGE, WallStageBackdrop } from './wall-of-love-stage';
import styles from './wall-of-love.module.css';

/** Resting the pointer on a home card this long opens the takeover… */
const DWELL_MS = 450;
/** …at most this often, so a visitor can still read and click the cards. */
const AUTO_OPEN_EVERY_MS = 120_000;
let lastAutoOpen = 0;

/** How far a card leans toward the pointer. */
const TILT_DEG = 7;

let reducedMotionQuery: MediaQueryList | undefined;
let finePointerQuery: MediaQueryList | undefined;

function reducedMotion(): boolean {
  reducedMotionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  return reducedMotionQuery.matches;
}

/** A mouse or trackpad: hover effects make no sense on touch. */
function finePointer(): boolean {
  finePointerQuery ??= window.matchMedia('(hover: hover) and (pointer: fine)');
  return finePointerQuery.matches;
}

/** Leans a card toward the pointer while the pointer is over it. */
function tilt(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse' || reducedMotion()) return;
  const item = event.currentTarget;
  const rect = item.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  item.style.transform = `perspective(800px) rotateX(${(-y * TILT_DEG).toFixed(2)}deg) rotateY(${(x * TILT_DEG).toFixed(2)}deg) scale(1.025)`;
}

/**
 * Columns for a wall of `count` cards from `sm` up; a short wall stays
 * centred instead of leaving columns empty. Below `sm` it is one column (or,
 * on the home page, a row to swipe).
 */
function columns(count: number): string {
  if (count === 1) return 'sm:mx-auto sm:max-w-sm';
  if (count === 2) return 'sm:mx-auto sm:max-w-2xl sm:columns-2';
  if (count === 3) return 'sm:mx-auto sm:max-w-4xl sm:columns-2 lg:columns-3';
  return 'sm:columns-2 lg:columns-3 xl:columns-4';
}

/** A card in CSS columns must not split across two of them. */
const MONOLITHIC = 'mb-5 break-inside-avoid';
const SM_MONOLITHIC = 'sm:mb-5 sm:w-auto sm:break-inside-avoid';

/**
 * One card on the wall: it leans toward the pointer, and while lit it shakes
 * (its glow is `WallGlow`'s). The tilt lives on this wrapper and the shake on
 * the layer inside, so the two never fight over one transform.
 */
function WallItem({
  card,
  labels,
  index,
  lit,
  wiggle,
  anchor = true,
  onEnter,
  onRest,
  onLeave,
  className
}: {
  card: WallCardData;
  labels: WallCardLabels;
  index: number;
  lit: boolean;
  wiggle?: boolean;
  /** Carries the entry's id, the anchor `/wall-of-love#<id>` points at. */
  anchor?: boolean;
  onEnter?: (index: number) => void;
  /** The pointer really moved over the card (not the page under it). */
  onRest?: (index: number, event: ReactPointerEvent<HTMLElement>) => void;
  onLeave?: (index: number) => void;
  className?: string;
}) {
  return (
    <div
      id={anchor ? card.entry.id : undefined}
      data-wall-item=''
      data-lit={lit ? '' : undefined}
      data-wiggle={wiggle ? '' : undefined}
      style={{ '--wiggle-delay': `${index * 90}ms` } as CSSProperties}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') onEnter?.(index);
      }}
      onPointerMove={(event) => {
        tilt(event);
        if (event.movementX !== 0 || event.movementY !== 0)
          onRest?.(index, event);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.transform = '';
        onLeave?.(index);
      }}
      className={cn(styles.item, className)}
    >
      <div className={styles.shake}>
        <WallCard card={card} labels={labels} />
      </div>
    </div>
  );
}

/** Cards that start below the fold rise in, a few at a time, as they arrive. */
function useReveal(
  gridRef: RefObject<HTMLElement | null>,
  { all, root }: { all?: boolean; root?: RefObject<HTMLElement | null> }
) {
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || reducedMotion()) return;
    const scrollRoot = root?.current ?? null;
    const fold = scrollRoot
      ? scrollRoot.getBoundingClientRect().bottom
      : window.innerHeight;
    // What is already on screen stays put; only what comes later animates.
    const items = Array.from(
      grid.querySelectorAll<HTMLElement>('[data-wall-item]')
    ).filter((item) => all || item.getBoundingClientRect().top > fold);
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let batch = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const item = entry.target as HTMLElement;
          item.style.setProperty(
            '--reveal-delay',
            `${Math.min(batch++, 6) * 80}ms`
          );
          item.dataset.reveal = 'shown';
          observer.unobserve(item);
        }
      },
      { root: scrollRoot, rootMargin: '0px 0px -6% 0px' }
    );
    for (const item of items) {
      item.dataset.reveal = 'pending';
      observer.observe(item);
    }
    return () => observer.disconnect();
  }, [gridRef, all, root]);
}

/**
 * The glow behind the lit card. One layer per wall, a sibling of the columns
 * rather than a child of a card: anything that reaches past a card inside CSS
 * columns gets carried into the neighbouring column. It stays where it was
 * while it fades out, and `container` must be its positioned parent.
 */
function WallGlow({
  container,
  lit
}: {
  container: RefObject<HTMLElement | null>;
  lit: number | null;
}) {
  const [box, setBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const root = container.current;
    if (lit === null || !root) return;
    const item = root.querySelectorAll<HTMLElement>('[data-wall-item]')[lit];
    if (!item) return;
    const place = () => {
      const outer = root.getBoundingClientRect();
      const card = item.getBoundingClientRect();
      setBox({
        x: card.left - outer.left,
        y: card.top - outer.top,
        width: card.width,
        height: card.height
      });
    };
    place();
    // An expanded quote or a loaded image changes the card's size.
    const observer = new ResizeObserver(place);
    observer.observe(item);
    return () => observer.disconnect();
  }, [container, lit]);

  return (
    <div
      aria-hidden
      data-on={lit !== null && box ? '' : undefined}
      className={styles.glow}
      style={
        box
          ? {
              width: box.width,
              height: box.height,
              transform: `translate(${box.x}px, ${box.y}px)`
            }
          : undefined
      }
    >
      <span />
      <span />
      <span />
    </div>
  );
}

/**
 * The wall as masonry columns, every card reacting to the pointer. Used by
 * `/wall-of-love` and inside the takeover.
 */
export function WallGrid({
  cards,
  labels,
  revealAll,
  scrollRoot,
  anchors = true,
  className
}: {
  cards: WallCardData[];
  labels: WallCardLabels;
  /** Every card rises in, not only those below the fold (the takeover). */
  revealAll?: boolean;
  scrollRoot?: RefObject<HTMLElement | null>;
  anchors?: boolean;
  className?: string;
}) {
  const wallRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<number | null>(null);
  useReveal(gridRef, { all: revealAll, root: scrollRoot });

  return (
    <div ref={wallRef} className={cn('relative', className)}>
      <WallGlow container={wallRef} lit={lit} />
      <div
        ref={gridRef}
        className={cn('relative gap-5', columns(cards.length))}
      >
        {cards.map((card, index) => (
          <WallItem
            key={card.entry.id}
            card={card}
            labels={labels}
            index={index}
            lit={lit === index}
            anchor={anchors}
            onEnter={setLit}
            onLeave={(left) =>
              setLit((current) => (current === left ? null : current))
            }
            className={MONOLITHIC}
          />
        ))}
      </div>
    </div>
  );
}

export type WallTakeoverCopy = {
  badge: string;
  title: string;
  description: string;
  close: string;
  page: string;
};

/** Where the reveal starts, and how far it has to grow to cover the screen. */
type Origin = { x: number; y: number; radius: number };

function revealFrom(x: number, y: number): Origin {
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  return { x, y, radius: Math.ceil(radius) + 2 };
}

/**
 * The whole wall over the page, revealed in a circle from the pointer. A
 * native modal `<dialog>` brings the focus trap and focus return; Escape and
 * the close button play the reveal backwards first.
 */
function WallTakeover({
  origin,
  cards,
  labels,
  copy,
  onClosed
}: {
  /** Where the reveal starts. Set to open, the takeover reports when closed. */
  origin: Origin | null;
  cards: WallCardData[];
  labels: WallCardLabels;
  copy: WallTakeoverCopy;
  onClosed: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const restoreScroll = useRef<(() => void) | null>(null);
  const [state, setState] = useState<'closed' | 'opening' | 'open' | 'closing'>(
    'closed'
  );
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!origin || !dialog || dialog.open) return;
    dialog.showModal();
    // The marketing layout scrolls `html` with an `!important` rule, so only
    // an inline `!important` keeps the page still behind the takeover.
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('overflow');
    const previousPriority = root.style.getPropertyPriority('overflow');
    root.style.setProperty('overflow', 'hidden', 'important');
    restoreScroll.current = () => {
      if (previous)
        root.style.setProperty('overflow', previous, previousPriority);
      else root.style.removeProperty('overflow');
    };
    setState('opening');
    // Two frames: the closed circle has to be painted before it can grow.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setState('open'));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [origin]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      restoreScroll.current?.();
      restoreScroll.current = null;
      setState('closed');
      onClosed();
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [onClosed]);

  // Leaving the page with the takeover open must not leave it unscrollable.
  useEffect(() => () => restoreScroll.current?.(), []);

  const close = useCallback(() => {
    setState((current) =>
      current === 'closed' || current === 'closing' ? current : 'closing'
    );
  }, []);

  useEffect(() => {
    if (state !== 'closing') return;
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    const finish = () => dialog?.close();
    if (!panel || reducedMotion()) {
      finish();
      return;
    }
    const onEnd = (event: TransitionEvent) => {
      if (event.target === panel && event.propertyName === 'clip-path')
        finish();
    };
    panel.addEventListener('transitionend', onEnd);
    const fallback = setTimeout(finish, 700);
    return () => {
      panel.removeEventListener('transitionend', onEnd);
      clearTimeout(fallback);
    };
  }, [state]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-state={state}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      style={
        {
          '--x': `${origin?.x ?? 0}px`,
          '--y': `${origin?.y ?? 0}px`,
          '--r': `${origin?.radius ?? 0}px`
        } as CSSProperties
      }
      className={styles.takeover}
    >
      <div ref={panelRef} className={cn(styles.panel, styles.stage)}>
        <WallStageBackdrop />
        <div
          ref={scrollerRef}
          className='absolute inset-0 overflow-y-auto overscroll-contain'
        >
          <div className='sticky top-0 z-20 flex h-0 justify-end'>
            <button
              type='button'
              onClick={close}
              aria-label={copy.close}
              className='mt-4 mr-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-black/10 bg-white/70 text-neutral-900 backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:mt-6 sm:mr-6 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20'
            >
              <X className='h-5 w-5' aria-hidden />
            </button>
          </div>
          <div className='mx-auto w-full max-w-6xl px-6 pt-16 pb-20 lg:px-8'>
            <header className='mx-auto max-w-2xl text-center'>
              <p className={STAGE_BADGE}>
                <Heart
                  aria-hidden
                  className={cn(
                    'h-3.5 w-3.5 fill-pink-400 text-pink-400',
                    styles.beat
                  )}
                />
                {copy.badge}
              </p>
              <h2
                id={titleId}
                className='mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl'
              >
                {copy.title}
              </h2>
              <p className='text-muted-foreground mt-4 text-lg text-pretty'>
                {copy.description}
              </p>
            </header>
            {state === 'closed' ? null : (
              <WallGrid
                cards={cards}
                labels={labels}
                revealAll
                scrollRoot={scrollerRef}
                anchors={false}
                className='mt-12'
              />
            )}
            <div className='mt-10 flex justify-center'>
              <Link
                href='/wall-of-love'
                className='bg-foreground text-background inline-flex h-12 items-center gap-2 rounded-xl px-6 text-sm font-semibold shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 active:scale-[0.98]'
              >
                {copy.page}
                <ArrowUpRight className='h-4 w-4' aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/**
 * The home page's share of the wall. The cards wiggle when they first come
 * into view, then a hand visits them one at a time to show they react. Resting
 * the pointer on a card shakes it, lights it and, once every two minutes,
 * opens the whole wall over the page. Clicks still open each original. On
 * touch screens it is a row to swipe; with reduced motion, a still wall.
 */
export function WallShowcase({
  cards,
  allCards,
  labels,
  takeover,
  className
}: {
  cards: WallCardData[];
  /** Everything on the wall, for the takeover. */
  allCards: WallCardData[];
  labels: WallCardLabels;
  takeover: WallTakeoverCopy;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoveringRef = useRef(false);
  const wiggledRef = useRef(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [visited, setVisited] = useState<number | null>(null);
  const [wiggle, setWiggle] = useState(false);
  const [inView, setInView] = useState(false);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const takeoverOpen = origin !== null;

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 }
    );
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  // The first time the wall comes into view, every card wiggles once.
  useEffect(() => {
    if (!inView || wiggledRef.current || reducedMotion()) return;
    wiggledRef.current = true;
    setWiggle(true);
    const timer = setTimeout(() => setWiggle(false), 600 + cards.length * 90);
    return () => {
      clearTimeout(timer);
      setWiggle(false);
    };
  }, [inView, cards.length]);

  // The hand's rounds: fly in to a card, light it, let go, pick another.
  useEffect(() => {
    const root = rootRef.current;
    const grid = gridRef.current;
    const hand = handRef.current;
    if (!inView || takeoverOpen || !root || !grid || !hand) return;
    if (reducedMotion() || !finePointer()) return;

    let cancelled = false;
    let frame = 0;
    let last = -1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (run: () => void, ms: number) => {
      timers.push(setTimeout(run, ms));
    };

    const round = () => {
      if (cancelled) return;
      if (hoveringRef.current) {
        later(round, 1200);
        return;
      }
      const items = grid.querySelectorAll<HTMLElement>('[data-wall-item]');
      if (items.length === 0) return;
      let index = Math.floor(Math.random() * items.length);
      if (items.length > 1 && index === last)
        index = (index + 1) % items.length;
      last = index;

      // The hand is positioned against the root, which may be wider than a
      // short, centred grid.
      const box = root.getBoundingClientRect();
      const card = items[index].getBoundingClientRect();
      const toX = card.left - box.left + card.width * 0.7;
      const toY = card.top - box.top + Math.min(card.height * 0.35, 90);
      const fromX = toX + 150;
      const fromY = toY - 170;
      const start = performance.now();
      let lit = false;
      hand.style.transition = '';

      const step = (now: number) => {
        if (cancelled) return;
        // A person arrived: the demonstration steps aside mid-flight.
        if (hoveringRef.current) {
          setVisited(null);
          later(round, 1200);
          return;
        }
        const progress = Math.min((now - start) / 850, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const x = fromX + (toX - fromX) * eased;
        const y = fromY + (toY - fromY) * eased;
        hand.style.opacity = String(Math.min(progress * 4, 1));
        hand.style.transform = `translate(${x}px, ${y}px) rotate(${-32 * (1 - eased)}deg)`;
        if (progress > 0.55 && !lit) {
          lit = true;
          setVisited(index);
        }
        if (progress < 1) {
          frame = requestAnimationFrame(step);
          return;
        }
        // A little press, as if it clicked.
        hand.style.transform = `translate(${toX}px, ${toY}px) scale(0.9)`;
        later(() => {
          hand.style.transition = 'opacity 0.6s ease-out';
          hand.style.opacity = '0';
          setVisited(null);
          later(round, 1800);
        }, 1400);
      };
      frame = requestAnimationFrame(step);
    };

    later(round, 1100);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      hand.style.opacity = '0';
      setVisited(null);
    };
  }, [inView, takeoverOpen]);

  const cancelDwell = useCallback(() => {
    clearTimeout(dwellRef.current);
    dwellRef.current = undefined;
  }, []);

  // Scrolling moves the page under a still pointer: that is not resting on a
  // card, so the next real movement has to arm the dwell again.
  useEffect(() => {
    window.addEventListener('scroll', cancelDwell, { passive: true });
    return () => {
      window.removeEventListener('scroll', cancelDwell);
      cancelDwell();
    };
  }, [cancelDwell]);

  const onRest = (_index: number, event: ReactPointerEvent<HTMLElement>) => {
    cancelDwell();
    if (takeoverOpen || reducedMotion() || !finePointer()) return;
    if (Date.now() - lastAutoOpen < AUTO_OPEN_EVERY_MS) return;
    const { clientX, clientY } = event;
    dwellRef.current = setTimeout(() => {
      dwellRef.current = undefined;
      lastAutoOpen = Date.now();
      setOrigin(revealFrom(clientX, clientY));
    }, DWELL_MS);
  };

  const onClosed = useCallback(() => {
    setOrigin(null);
    setHovered(null);
  }, []);

  const lit = hovered ?? visited;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <WallGlow container={rootRef} lit={lit} />
      <div
        ref={gridRef}
        onPointerEnter={() => {
          hoveringRef.current = true;
          const hand = handRef.current;
          if (hand) {
            hand.style.transition = 'opacity 0.3s ease-out';
            hand.style.opacity = '0';
          }
        }}
        onPointerLeave={() => {
          hoveringRef.current = false;
          cancelDwell();
        }}
        className={cn(
          // A row to swipe on phones, masonry columns from `sm` up.
          'relative -mx-6 flex snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6 pt-2 pb-6 sm:mx-0 sm:block sm:gap-5 sm:overflow-visible sm:px-0 sm:pt-0 sm:pb-0',
          columns(cards.length)
        )}
      >
        {cards.map((card, index) => (
          <WallItem
            key={card.entry.id}
            card={card}
            labels={labels}
            index={index}
            lit={lit === index}
            wiggle={wiggle}
            onEnter={(entered) => {
              setHovered(entered);
              setVisited(null);
            }}
            onRest={onRest}
            onLeave={(left) => {
              setHovered((current) => (current === left ? null : current));
              cancelDwell();
            }}
            className={cn('w-[82%] shrink-0 snap-center', SM_MONOLITHIC)}
          />
        ))}
      </div>

      <div
        ref={handRef}
        aria-hidden
        className={cn(styles.hand, 'hidden sm:block')}
      >
        <Pointer
          className='h-10 w-10 fill-white text-neutral-900'
          strokeWidth={1.4}
        />
      </div>

      <WallTakeover
        origin={origin}
        cards={allCards}
        labels={labels}
        copy={takeover}
        onClosed={onClosed}
      />
    </div>
  );
}
