'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RingeeMark } from '@ringee/frontend-shared/components/ringee-mark';
import {
  Sheet,
  SheetContent
} from '@ringee/frontend-shared/components/ui/sheet';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useDialerStore } from '@/features/calls/store/dialer.store';
import { useRailSummary } from '../hooks/use-automation-data';
import { useVoiceAgentsRail } from '../store';
import { AutomationPanel } from './automation-panel';

/**
 * Above this width the open panel sits beside the page instead of over it.
 * The strip and the docked panel take about 544 px; from here the page keeps
 * about 640 px next to an expanded sidebar.
 */
const DOCK_MIN_WIDTH = 1440;
const PANEL_ID = 'voice-agents-panel';

/** The agents really working: green with a dot, or a muted zero. */
function OperationalCount({ count }: { count: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        count > 0
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {count > 0 ? (
        <span className='size-1.5 rounded-full bg-emerald-500' />
      ) : null}
      {count}
    </span>
  );
}

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
 * "Trigger AI Voice Agents": a strip down the whole right edge of the
 * dashboard, beside the header and the page (AGENT-018). Its tab carries the
 * vertical title and a counter of what is really working. Open, the tab stays
 * pressed under the Ringee mark and the panel docks to its right on wide
 * screens, slides over the page where docking would squeeze tables and
 * forms, and takes the whole screen on a phone.
 *
 * It shares the right edge with the quick dialer: one auxiliary surface at a
 * time. Closing the dialer only hides its keypad — the call engine lives in
 * the sidebar, so switching panels never ends or unmounts a call.
 */
export function VoiceAgentsRail() {
  const t = useTranslations('aiVoiceAgents.automations');
  const { userId, orgId, isLoaded } = useAuth();
  const workspaceKey =
    isLoaded && userId ? JSON.stringify([userId, orgId ?? null]) : null;
  const storedWorkspaceKey = useVoiceAgentsRail((state) => state.workspaceKey);
  const { enabled, summary, refresh } = useRailSummary(workspaceKey);
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
    hydrate(workspaceKey);
  }, [hydrate, workspaceKey]);

  // The quick dialer was just opened: it takes the edge back. Only the
  // dialer *opening* decides this — the rail opening first closes the dialer.
  const dialerWasOpen = useRef(quickDial);
  useEffect(() => {
    if (quickDial && !dialerWasOpen.current && open) setOpen(false);
    dialerWasOpen.current = quickDial;
  }, [quickDial, open, setOpen]);

  // Back from "Customize": the panel comes back where the person left it —
  // once the editor was reached and left, not on the render where "Customize"
  // set `resume` and the page has not navigated yet.
  const sawEditor = useRef(false);
  useEffect(() => {
    if (!resume) {
      sawEditor.current = false;
      return;
    }
    if (pathname.startsWith('/dashboard/ai-voice-agents/')) {
      sawEditor.current = true;
    } else if (sawEditor.current) {
      sawEditor.current = false;
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

  if (!enabled || !workspaceKey || storedWorkspaceKey !== workspaceKey)
    return null;

  const operational = summary?.operational ?? 0;
  const attention = (summary?.attention ?? 0) > 0;
  const label = t('railLabel', { count: operational });
  const docked = open && dockable;

  return (
    <>
      {/* Desktop: the strip, full height beside the header, and the docked
          panel to the right of its tab. */}
      <div
        className='sticky top-0 hidden h-svh shrink-0 md:flex'
        onKeyDown={(event) => {
          if (event.key === 'Escape' && docked) close();
        }}
      >
        <div className='bg-sidebar flex w-16 shrink-0 flex-col items-center border-l px-2 py-3'>
          <button
            ref={triggerRef}
            type='button'
            onClick={() => (open ? close() : openRail())}
            aria-expanded={open}
            aria-controls={PANEL_ID}
            aria-label={label}
            className={cn(
              'flex w-full flex-col items-center gap-3 rounded-xl border px-1 pt-3 pb-2.5 transition-colors outline-none',
              'focus-visible:ring-ring focus-visible:ring-2',
              // Pressed while open, a lighter fill than the hover of a closed tab.
              open
                ? 'bg-foreground/10 border-foreground/25 shadow-inner'
                : 'bg-background hover:bg-foreground/5 shadow-sm'
            )}
          >
            {/* The Ringee mark heads the tab, open or closed. */}
            <RingeeMark className='size-6' />
            <span className='text-base font-semibold tracking-wide whitespace-nowrap [writing-mode:vertical-rl]'>
              {t('title')}
            </span>
            {attention ? (
              <span
                aria-hidden
                className='size-2 rounded-full bg-amber-500'
                title={t('attentionHint')}
              />
            ) : null}
            <OperationalCount count={operational} />
          </button>
        </div>

        {docked ? (
          <aside
            id={PANEL_ID}
            aria-labelledby={`${PANEL_ID}-title`}
            className='bg-background animate-in fade-in-0 slide-in-from-right-4 w-[480px] border-l duration-200 motion-reduce:animate-none'
          >
            <AutomationPanel titleId={`${PANEL_ID}-title`} onClose={close} />
          </aside>
        ) : null}
      </div>

      {/* Narrower screens: the same panel over the page; phones: full screen. */}
      <Sheet
        open={open && !dockable}
        onOpenChange={(next) => (next ? openRail() : close())}
      >
        <SheetContent
          id={!docked ? PANEL_ID : undefined}
          side='right'
          className='w-full gap-0 p-0 sm:max-w-[480px] [&>button:last-child]:hidden'
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

      {/* Phones: a horizontal button instead of the vertical strip. */}
      <button
        ref={mobileTriggerRef}
        type='button'
        onClick={openRail}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={label}
        className='bg-background focus-visible:ring-ring fixed right-4 bottom-4 z-40 flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium shadow-lg outline-none focus-visible:ring-2 md:hidden'
      >
        {t('titleShort')}
        <OperationalCount count={operational} />
      </button>
    </>
  );
}
