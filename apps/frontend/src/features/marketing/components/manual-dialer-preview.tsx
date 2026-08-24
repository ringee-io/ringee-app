'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const VIDEO_SRC = '/assets/manual-dialer-simple-usage.mp4';

/**
 * Intrinsic size of the capture (3642 × 2160). Used both to reserve the frame
 * before metadata lands and to cap the panel width against the viewport
 * height, so the clip is never letterboxed on short screens.
 */
const VIDEO_RATIO = 3642 / 2160;

/** Vertical space the header + panel padding take away from the video. */
const CHROME_HEIGHT = '11rem';

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ManualDialerPreviewProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Product preview for the Manual Dialer, opened from the atmospheric banner.
 *
 * Hand-rolled rather than built on the shared Radix dialog: the marketing
 * layout forces `html { overflow-y: auto !important }` so `html` (not `body`)
 * stays the scroll container, which Radix's scroll lock does not account for.
 * Same portal/Escape/scroll-lock shape as the marketing navbar's mobile menu.
 */
export function ManualDialerPreview({
  open,
  onClose
}: ManualDialerPreviewProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Escape closes from anywhere, including when focus has drifted out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Scroll lock. The marketing layout declares the `html` overflow rules with
  // `!important`, so a plain inline style would be ignored — only an inline
  // `!important` outranks it.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('overflow');
    const previousPriority = root.style.getPropertyPriority('overflow');
    root.style.setProperty('overflow', 'hidden', 'important');
    return () => {
      if (previous)
        root.style.setProperty('overflow', previous, previousPriority);
      else root.style.removeProperty('overflow');
    };
  }, [open]);

  // Move focus into the dialog on open and hand it back to the trigger on
  // close, so keyboard users land back on the banner they activated.
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => trigger?.focus?.();
  }, [open]);

  // `autoPlay` covers the mount, but the element is recreated on every open;
  // rewind and kick playback explicitly so a reopen always starts clean.
  // Pausing on unmount keeps a decoded stream from lingering in the background.
  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {
      /* Autoplay can still be refused; the clip is muted so this is rare. */
    });
    return () => {
      video.pause();
      video.currentTime = 0;
    };
  }, [open]);

  // Keep Tab inside the panel while the dialog owns the screen.
  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      // `mousedown` rather than `click`: a drag that starts inside the video
      // and ends on the backdrop should not count as an outside click.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      className='animate-in fade-in-0 fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md duration-200 sm:p-6'
    >
      <div
        ref={panelRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={{
          // Narrow the panel on short viewports so the clip stays fully
          // visible at its native ratio instead of picking up black bars.
          maxWidth: `min(72rem, calc((100dvh - ${CHROME_HEIGHT}) * ${VIDEO_RATIO}))`
        }}
        className='animate-in fade-in-0 zoom-in-95 relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0B0C0B] shadow-[0_40px_120px_-24px_rgba(0,0,0,0.9)] duration-300 ease-out'
      >
        {/* Green hairline, the same accent the navbar uses. */}
        <div
          aria-hidden
          className='pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent'
        />

        <div className='flex items-start justify-between gap-6 px-5 pt-5 pb-4 sm:px-6 sm:pt-6'>
          <div className='min-w-0'>
            <h2
              id={titleId}
              className='text-base font-semibold tracking-tight text-white sm:text-lg'
            >
              Manual Dialer
            </h2>
            <p id={descriptionId} className='mt-1 text-sm text-white/55'>
              Call any number instantly from Ringee.
            </p>
          </div>

          <button
            ref={closeRef}
            type='button'
            onClick={onClose}
            aria-label='Close preview'
            className='inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-white/60 transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:outline-none'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='px-3 pb-3 sm:px-6 sm:pb-6'>
          <div
            style={{ aspectRatio: `${VIDEO_RATIO}` }}
            className='overflow-hidden rounded-xl border border-white/10 bg-black'
          >
            <video
              ref={videoRef}
              src={VIDEO_SRC}
              autoPlay
              muted
              loop
              playsInline
              preload='auto'
              aria-label='Screen recording of the Ringee manual dialer placing a call'
              className='h-full w-full object-contain'
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
