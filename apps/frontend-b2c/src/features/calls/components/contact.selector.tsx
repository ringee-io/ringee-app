'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@ringee/frontend-shared/components/ui/card';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { UserPlus2, ChevronDown, ChevronUp } from 'lucide-react';
import { useContactsStore } from '../store/contact.selector.store';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import ContactForm from '@/features/contact/components/contact.form';

interface Props {
  number: string;
  onSelectNumber: (phone: string) => void;
  useMock?: boolean;
}

export function ContactSelector({ number, onSelectNumber, useMock }: Props) {
  const api = useApi();
  const {
    matches,
    selectedContact,
    selectContact,
    fetchContacts,
    loadMore,
    status,
    hasMore,
    total,
    isFetchingMore
  } = useContactsStore();

  const [openModal, setOpenModal] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch - skip if using mock mode
  useEffect(() => {
    if (useMock) return;
    const delay = setTimeout(() => fetchContacts(api, number, 1), 400);
    return () => clearTimeout(delay);
  }, [number, useMock]);

  // Observe bottom of list for infinite scroll
  useEffect(() => {
    if (!showAll || !loaderRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isFetchingMore) {
          loadMore(api, number);
        }
      },
      { threshold: 1.0 }
    );

    const current = loaderRef.current;
    observer.observe(current);

    return () => {
      if (current) observer.unobserve(current);
    };
  }, [showAll, loaderRef.current, hasMore, number, isFetchingMore]);

  const isLoading = status === 'loading';
  const noResults = status === 'success' && matches.length === 0;
  const visibleContacts = showAll ? matches : matches.slice(0, 1);

  return (
    <div className='mb-4 min-h-[70px] w-full space-y-2 text-center'>
      {selectedContact && (
        <div
          className='bg-muted/40 hover:bg-accent/40 cursor-pointer rounded-lg px-4 py-2 transition'
          onClick={() => onSelectNumber(selectedContact.phone)}
        >
          <p className='text-base font-medium'>{selectedContact.name}</p>
          <p className='text-muted-foreground text-sm'>
            {selectedContact.phone}
          </p>
        </div>
      )}

      {/* Initial loading */}
      {isLoading && matches.length === 0 && (
        <div className='space-y-2'>
          <Skeleton className='mx-auto h-4 w-3/4' />
          <Skeleton className='mx-auto h-4 w-1/2' />
        </div>
      )}

      {/* List with infinite scroll */}
      {!isLoading && matches.length > 1 && (
        <>
          {showAll && (
            <Card className='border-border/40 bg-muted/20 max-h-48 overflow-y-auto rounded-xl p-2'>
              {visibleContacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    selectContact(c);
                    onSelectNumber(c.phone);
                    setShowAll(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors',
                    'hover:bg-accent/40',
                    selectedContact?.id === c.id && 'bg-accent/60'
                  )}
                >
                  <span className='font-medium'>{c.name}</span>
                  <span className='text-muted-foreground text-sm'>
                    {c.phone}
                  </span>
                </button>
              ))}

              {/* Infinite loader */}
              {hasMore && (
                <div ref={loaderRef} className='py-3'>
                  <Skeleton className='mx-auto h-8 w-full' />
                </div>
              )}
            </Card>
          )}

          {/* Toggle button */}
        </>
      )}

      <button
        onClick={() => total > 1 && setShowAll(!showAll)}
        className='text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 text-xs transition'
      >
        {total === 1 ? '1 contact match 👆' : null}

        {total > 1 ? `${total} contacts match` : null}

        {total > 1 &&
          (showAll ? (
            <ChevronUp className='h-4 w-4' />
          ) : (
            <ChevronDown className='h-4 w-4' />
          ))}
      </button>

      {/* No results */}
      {((!isLoading && noResults) || status === 'idle') && (
        <div className='flex flex-col items-center py-2'>
          <p className='text-muted-foreground mb-2 text-sm'>
            No contacts found
          </p>

          <Dialog open={openModal} onOpenChange={setOpenModal} modal>
            <DialogTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                className='flex items-center gap-2'
              >
                <UserPlus2 className='h-4 w-4' />
                Add contact
              </Button>
            </DialogTrigger>

            <DialogContent
              onInteractOutside={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => e.preventDefault()}
            >
              <ContactForm
                initialData={
                  {
                    phoneNumber: number
                  } as never
                }
                pageTitle='Add contact'
                className='md:grid-cols-1'
                onSaved={() => {
                  setOpenModal(false);
                  fetchContacts(api, number, 1).catch(() => {
                    console.error('Failed to fetch contacts');
                  });
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
