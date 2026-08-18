'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconGift, IconX } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { OfferActionDialog } from './offer-action-dialog';
import { useOffers } from '../hooks/use-offers';
import type { Offer, OfferPlacement } from '../api';
import { useOffersApi } from '../api';

/**
 * Renders whichever offer the backend picked for a placement.
 *
 * Deliberately generic: this component knows about titles, a CTA and a dismiss
 * button — never about reviews, call counts or reward maths. Swapping the
 * running promotion is a data change with no edit here.
 */
export function OfferBanner({
  placement = 'TOP_BANNER',
  className
}: {
  placement?: OfferPlacement;
  className?: string;
}) {
  // One slot today. Rendering a list is what makes rotation a later UI change.
  const { offers, loading, replace, remove } = useOffers(placement, 1);
  const offer = offers[0];

  if (loading || !offer) return null;

  return (
    <OfferBannerRow
      key={offer.id}
      offer={offer}
      className={className}
      onUpdated={replace}
      onDismissed={() => remove(offer.id)}
    />
  );
}

/**
 * The headline amount. `potentialAmount` is what the user can still earn, so it
 * is the number worth advertising; `amount` is the fallback for flat rewards.
 */
function formatReward(reward: Offer['reward']) {
  const amount = reward.potentialAmount || reward.amount;
  if (reward.type !== 'CREDIT' || !amount) return null;

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: reward.currency || 'USD',
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
    }).format(amount);
  } catch {
    // Unknown currency code: better a plain number than a blank banner.
    return `${amount} ${reward.currency}`;
  }
}

/** Coarse on purpose — a banner is context, not a countdown clock. */
function formatDeadline(endsAt: string | null) {
  if (!endsAt) return null;

  const remaining = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(remaining) || remaining <= 0) return null;

  const days = Math.floor(remaining / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;

  const hours = Math.floor(remaining / 3_600_000);
  return hours >= 1 ? `${hours}h left` : 'Ends today';
}

function OfferBannerRow({
  offer,
  className,
  onUpdated,
  onDismissed
}: {
  offer: Offer;
  className?: string;
  onUpdated: (offer: Offer) => void;
  onDismissed: () => void;
}) {
  const api = useOffersApi();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const impressionSent = useRef(false);

  // Fired on render, not on fetch: the funnel should count banners the user
  // actually saw.
  useEffect(() => {
    if (impressionSent.current) return;
    impressionSent.current = true;
    api.track(offer.slug, 'impression').catch(() => undefined);
  }, [api, offer.slug]);

  const pending =
    offer.participation?.status === 'SUBMITTED' ||
    offer.participation?.status === 'PENDING_APPROVAL';

  const reward = formatReward(offer.reward);
  const deadline = formatDeadline(offer.endsAt);

  const handleCta = () => {
    api.track(offer.slug, 'clicked').catch(() => undefined);

    if (offer.action.type === 'INTERNAL_ACTION' && offer.action.href) {
      router.push(offer.action.href);
      return;
    }
    setDialogOpen(true);
  };

  // Local only, by design: closing the banner means "not now", so the offer is
  // back on the next reload. It disappears for good when it is redeemed or
  // pulled from the catalogue. See `hiddenUntilReload` in use-offers.
  const handleDismiss = () => onDismissed();

  return (
    <>
      <div
        className={cn(
          'bg-primary/[0.04] border-border/60 flex items-center gap-3 border-b px-4 py-2.5',
          className
        )}
        role='region'
        aria-label={offer.title}
      >
        <span
          aria-hidden
          className='bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md'
        >
          <IconGift className='size-4' />
        </span>

        <div className='flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5'>
          <p className='truncate text-sm font-medium'>{offer.title}</p>

          {reward && (
            <span className='text-primary text-sm font-semibold'>{reward}</span>
          )}

          {offer.description && (
            <p className='text-muted-foreground hidden truncate text-xs md:block'>
              {offer.description}
            </p>
          )}

          {deadline && (
            <span className='text-muted-foreground hidden text-xs whitespace-nowrap sm:inline'>
              · {deadline}
            </span>
          )}
        </div>

        {pending ? (
          <span className='text-muted-foreground shrink-0 text-xs font-medium'>
            {offer.requiresApproval ? 'Under review' : 'Submitted'}
          </span>
        ) : (
          <Button size='sm' className='h-7 shrink-0 px-3' onClick={handleCta}>
            {offer.cta.label}
          </Button>
        )}

        {offer.dismissible && (
          <Button
            variant='ghost'
            size='icon'
            className='text-muted-foreground hover:text-foreground size-7 shrink-0'
            aria-label='Hide offer for now'
            onClick={handleDismiss}
          >
            <IconX className='size-4' />
          </Button>
        )}
      </div>

      <OfferActionDialog
        offer={offer}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCompleted={onUpdated}
      />
    </>
  );
}
