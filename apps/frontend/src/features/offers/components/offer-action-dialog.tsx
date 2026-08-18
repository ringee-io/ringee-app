'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { IconExternalLink } from '@tabler/icons-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { useOffersApi, type Offer } from '../api';

/**
 * The generic action surface. It renders whatever the offer's `action` block
 * describes — a labelled field for a URL submission, a plain confirm for a CTA
 * — so a new action type is a backend concern, not a new component here.
 *
 * All copy comes from the offer, and the only thing sent back is the field the
 * offer asked for.
 */
export function OfferActionDialog({
  offer,
  open,
  onOpenChange,
  onCompleted
}: {
  offer: Offer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (updated: Offer) => void;
}) {
  const api = useOffersApi();
  const [value, setValue] = useState('');
  const [visited, setVisited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const field = offer.action.field ?? 'value';
  const needsInput = offer.action.type === 'EXTERNAL_URL_SUBMISSION';

  const submit = async () => {
    if (needsInput && !value.trim()) return;
    setSubmitting(true);
    try {
      const updated = await api.submit(
        offer.slug,
        needsInput ? { [field]: value.trim() } : {}
      );
      onCompleted(updated);
      onOpenChange(false);
      setValue('');
      setVisited(false);
      toast.success(
        updated.requiresApproval
          ? 'Submitted — we’ll review it shortly.'
          : 'Done! Your reward has been added.'
      );
    } catch (error) {
      // The server owns every rule (domain, duplicates, eligibility, limits),
      // so its message is the one worth showing.
      toast.error(
        error instanceof Error ? error.message : 'Could not submit this offer.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{offer.title}</DialogTitle>
          {offer.description && (
            <DialogDescription>{offer.description}</DialogDescription>
          )}
        </DialogHeader>

        {/* Where the user actually performs the action. Generic: whatever the
            offer put in `href`, opened in a new tab so the dialog survives. */}
        {offer.action.href && (
          <Button variant='outline' asChild className='w-full'>
            <a
              href={offer.action.href}
              target='_blank'
              rel='noopener noreferrer'
              onClick={() => setVisited(true)}
            >
              <IconExternalLink className='size-4' />
              {offer.action.hrefLabel ?? 'Open link'}
            </a>
          </Button>
        )}

        {/* "Where do I find that?" — answered with a screenshot the offer
            supplies, so this stays a layout concern and not a Trustpilot one.
            A plain <img>: the source may be an arbitrary external URL, which
            next/image would reject unless the host is whitelisted. */}
        {offer.action.helpImage && (
          <figure className='bg-muted/40 overflow-hidden rounded-md border'>
            <img
              src={offer.action.helpImage}
              alt={offer.action.helpImageAlt ?? 'How to find the link'}
              loading='lazy'
              className='block h-auto w-full'
            />
          </figure>
        )}

        {needsInput && (
          <div className='grid gap-2'>
            <Label htmlFor={`offer-${offer.id}-${field}`}>
              {offer.action.fieldLabel ?? 'Value'}
            </Label>
            <Input
              id={`offer-${offer.id}-${field}`}
              value={value}
              autoFocus={!offer.action.href || visited}
              placeholder={offer.action.fieldPlaceholder ?? undefined}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
            {offer.action.helpText && (
              <p className='text-muted-foreground text-xs'>
                {offer.action.helpText}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant='ghost'
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || (needsInput && !value.trim())}
          >
            {submitting
              ? 'Submitting…'
              : (offer.action.submitLabel ?? offer.cta.label)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
