'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AudioLines } from 'lucide-react';
import {
  Sheet,
  SheetContent
} from '@ringee/frontend-shared/components/ui/sheet';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useDialerStore } from '@/features/calls/store/dialer.store';
import { useRailSummary } from '../hooks/use-automation-data';
import { useVoiceAgentsRail } from '../store';
import { AutomationPanel } from './automation-panel';

/** Above this width the open panel sits beside the page instead of over it. */
const DOCK_MIN_WIDTH = 1280;
const PANEL_ID = 'voice-agents-panel';

function useDockable(): boolean {
  const [dockable, setDockable] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${DOCK_MIN_WIDTH}px)`);
    const update = () => setDockable(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return dockable;
}

/**
 * "Ringee IA Voice Agents": the rail on the right edge of the dashboard
 * (AGENT-018). Closed, it is a 48 px bar with a counter of what is really
 * working. Open, it docks beside the page on wide screens, slides over it
 * where docking would squeeze tables and forms, and takes the whole screen on
 * a phone.
 *
 * It shares the right edge with the quick dialer: one auxiliary surface at a
 * time. Closing the dialer only hides its keypad — the call engine lives in
 * the sidebar, so switching panels never ends or unmounts a call.
 */
export function VoiceAgentsRail() {
  const t = useTranslations('aiVoiceAgents.automations');
  const { enabled, summary, refresh } = useRailSummary();
  const open = useVoiceAgentsRail((state) => state.open);
  const resume = useVoiceAgentsRail((state) => state.resume);
  const setOpen = useVoiceAgentsRail((state) => state.setOpen);
  const setResume = useVoiceAgentsRail((state) => state.setResume);
  const hydrate = useVoiceAgentsRail((state) => state.hydrate);
  const quickDial = useDialerStore((state) => state.quickDial);
  const setQuickDial = useDialerStore((state) => state.setQuickDial);
  const pathname = usePathname();
  const dockable = useDockable();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // The quick dialer was just opened: it takes the edge back. Only the
  // dialer *opening* decides this — the rail opening first closes the dialer.
  const dialerWasOpen = useRef(quickDial);
  useEffect(() => {
    if (quickDial && !dialerWasOpen.current && open) setOpen(false);
    dialerWasOpen.current = quickDial;
  }, [quickDial, open, setOpen]);

  // Back from "Customize": the panel comes back where the person left it.
  useEffect(() => {
    if (resume && !pathname.startsWith('/dashboard/ai-voice-agents/')) {
      setResume(false);
      setOpen(true);
    }
  }, [pathname, resume, setOpen, setResume]);

  const openRail = () => {
    if (quickDial) setQuickDial(false);
    setOpen(true);
  };

  const close = useCallback(() => {
    setOpen(false);
    void refresh();
    // Focus goes back to whichever trigger opened the panel.
    window.setTimeout(() => {
      (triggerRef.current?.offsetParent
        ? triggerRef.current
        : mobileTriggerRef.current
      )?.focus();
    }, 0);
  }, [refresh, setOpen]);

  if (!enabled) return null;

  const operational = summary?.operational ?? 0;
  const attention = (summary?.attention ?? 0) > 0;
  const label = t('railLabel', { count: operational });
  const docked = open && dockable;

  return (
    <>
      {/* Desktop: the closed rail, or the docked panel in its place. */}
      {docked ? (
        <aside
          id={PANEL_ID}
          aria-labelledby={`${PANEL_ID}-title`}
          className='bg-background hidden h-[calc(100dvh-52px)] w-[376px] shrink-0 border-l md:block'
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
        >
          <AutomationPanel titleId={`${PANEL_ID}-title`} onClose={close} />
        </aside>
      ) : (
        <button
          ref={triggerRef}
          type='button'
          onClick={openRail}
          aria-expanded={open}
          aria-controls={PANEL_ID}
          aria-label={label}
          className={cn(
            'group hidden h-[calc(100dvh-52px)] w-12 shrink-0 flex-col items-center gap-3 border-l py-4 md:flex',
            'hover:bg-muted/60 focus-visible:ring-ring transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset'
          )}
        >
          <span className='relative'>
            <AudioLines className='text-muted-foreground group-hover:text-foreground size-5' />
            {operational > 0 ? (
              <span
                aria-hidden
                className='absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500'
              />
            ) : null}
          </span>
          <span className='text-muted-foreground group-hover:text-foreground rotate-180 text-xs font-medium tracking-wide whitespace-nowrap [writing-mode:vertical-rl]'>
            {t('title')}
          </span>
          <span className='mt-auto flex flex-col items-center gap-1.5'>
            {attention ? (
              <span
                aria-hidden
                className='size-2 rounded-full bg-amber-500'
                title={t('attentionHint')}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                operational > 0
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {operational}
            </span>
          </span>
        </button>
      )}

      {/* Narrower screens: the same panel over the page; phones: full screen. */}
      <Sheet
        open={open && !dockable}
        onOpenChange={(next) => (next ? openRail() : close())}
      >
        <SheetContent
          id={!docked ? PANEL_ID : undefined}
          side='right'
          className='w-full gap-0 p-0 sm:max-w-[392px] [&>button:last-child]:hidden'
        >
          {open && !dockable ? (
            <AutomationPanel
              titleId={`${PANEL_ID}-sheet-title`}
              onClose={close}
              inSheet
            />
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Phones: a horizontal button instead of the vertical rail. */}
      <button
        ref={mobileTriggerRef}
        type='button'
        onClick={openRail}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={label}
        className='bg-background focus-visible:ring-ring fixed right-4 bottom-4 z-40 flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium shadow-lg outline-none focus-visible:ring-2 md:hidden'
      >
        <span className='relative'>
          <AudioLines className='size-4' />
          {operational > 0 ? (
            <span
              aria-hidden
              className='absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500'
            />
          ) : null}
        </span>
        {t('titleShort')}
        <span className='bg-muted rounded-full px-1.5 text-xs tabular-nums'>
          {operational}
        </span>
      </button>
    </>
  );
}
