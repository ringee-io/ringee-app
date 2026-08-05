'use client';

import { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Drawer } from 'vaul';
import { IconX } from '@tabler/icons-react';
import { useIsMobile } from '@ringee/frontend-shared/hooks/use-mobile';
import { useJourneyCopy } from '../lib/copy';
import { ThreadDetail } from './thread-detail';
import type { JourneyThread } from '../lib/threads';
import type { JourneyOverview } from '../types';

/**
 * The thread drawer.
 *
 * Desktop is a **non-modal** right-hand sheet: no overlay, no scroll lock, no
 * focus trap. That is the whole requirement — exploring the map is not a
 * decision that deserves a blocking modal, and clicking a second thread should
 * swap the contents rather than force a close-then-reopen. Radix `Dialog` with
 * `modal={false}` and no `Dialog.Overlay` gives exactly that.
 *
 * Mobile is a `vaul` bottom sheet at 55%/96% snap points with a sticky footer,
 * because on a phone the sheet IS the screen and the platform convention is a
 * dimmed background. That is not a "blocking modal for exploration"; it is how
 * a bottom sheet works everywhere else on the device.
 *
 * Selection lives in the URL (`?node=`), so refresh keeps it and Back closes it.
 */
export function NodeDrawer({
  thread,
  data,
  onClose,
  onClaim,
  claimingNodeId
}: {
  thread: JourneyThread | null;
  data: JourneyOverview;
  onClose: () => void;
  onClaim: (nodeId: string) => void;
  claimingNodeId: string | null;
}) {
  const { t, dynamic } = useJourneyCopy();
  const isMobile = useIsMobile();

  /**
   * Focus restoration.
   *
   * Non-modal Radix does not manage focus, so the node that opened the drawer is
   * remembered here and refocused on close. Without it, closing with Escape
   * would drop focus to the document body and a keyboard user would lose their
   * place on the map.
   */
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (thread && !opener.current) {
      opener.current = document.activeElement as HTMLElement | null;
    }
    if (!thread && opener.current) {
      opener.current.focus?.();
      opener.current = null;
    }
  }, [thread]);

  if (!thread) return null;

  const title = dynamic(`track.${thread.track.id}.name`, thread.track.id);

  if (isMobile) {
    return (
      <Drawer.Root
        open
        onOpenChange={(open) => !open && onClose()}
        snapPoints={[0.55, 0.96]}
        fadeFromIndex={0}
        activeSnapPoint={undefined}
      >
        <Drawer.Portal>
          <Drawer.Overlay className='fixed inset-0 z-50 bg-black/40' />
          <Drawer.Content
            aria-describedby={undefined}
            className='bg-background fixed inset-x-0 bottom-0 z-50 flex max-h-[96vh] flex-col rounded-t-2xl border-t outline-none'
          >
            <Drawer.Title className='sr-only'>{title}</Drawer.Title>
            <div
              aria-hidden='true'
              className='bg-muted-foreground/30 mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full'
            />
            <div className='min-h-0 flex-1 overflow-y-auto p-4'>
              <ThreadDetail
                thread={thread}
                data={data}
                onClaim={onClaim}
                claimingNodeId={claimingNodeId}
              />
            </div>
            {/* Sticky close, above the home indicator. */}
            <div className='bg-background border-border shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'>
              <Drawer.Close className='bg-muted hover:bg-muted/80 focus-visible:ring-ring w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'>
                {t('drawer.close')}
              </Drawer.Close>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog.Root
      open
      // The map stays visible, scrollable and clickable behind this.
      modal={false}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Portal>
        {/* Deliberately no Dialog.Overlay: an overlay would make it blocking. */}
        <Dialog.Content
          aria-describedby={undefined}
          onInteractOutside={(event) => {
            // Clicking another thread re-targets the drawer instead of closing
            // it; clicking empty canvas closes. Both are handled by the page,
            // so the default outside-close is suppressed here.
            event.preventDefault();
          }}
          className='bg-background border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right fixed inset-y-0 right-0 z-50 flex w-[min(440px,38vw)] min-w-[320px] flex-col border-l shadow-xl duration-200 motion-reduce:animate-none'
        >
          <div className='flex shrink-0 items-start justify-end p-3 pb-0'>
            <Dialog.Close
              aria-label={t('drawer.close')}
              className='text-muted-foreground hover:bg-muted focus-visible:ring-ring rounded-lg p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none'
            >
              <IconX className='size-4' />
            </Dialog.Close>
          </div>
          <Dialog.Title className='sr-only'>{title}</Dialog.Title>
          <div className='min-h-0 flex-1 overflow-y-auto px-5 pb-6'>
            <ThreadDetail
              thread={thread}
              data={data}
              onClaim={onClaim}
              claimingNodeId={claimingNodeId}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
