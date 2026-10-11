'use client';

import { useEffect, useState } from 'react';
import { CreateOrganization, useOrganizationList } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  Building2,
  Loader2,
  Lock,
  Plus,
  RotateCw,
  Sparkles
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { OrganizationUpgradePanel } from '@ringee/frontend-shared/components/organization-upgrade-panel';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { cn } from '@ringee/frontend-shared/lib/utils';

/** Where a workspace switch or a new organization lands: on the tab itself. */
const CAMPAIGNS_TAB_URL = '/dashboard/call?tab=campaigns';

export interface UnlockOrganization {
  id: string;
  name: string;
  imageUrl: string | null;
}

/**
 * What unlocking campaigns takes for this user: creating the organization
 * they already pay for, switching to one they already belong to, or buying
 * the Organization plan. Until both are known it offers nothing — a checkout
 * shown for a moment to someone who has a plan is one they can click.
 */
export function UnlockCampaignsContent({
  loading,
  failed,
  onRetry,
  hasSubscription,
  organizations,
  switchingTo,
  onCreateOrganization,
  onSwitch
}: {
  loading: boolean;
  /** Whether a plan is already paid for could not be read. */
  failed: boolean;
  onRetry: () => void;
  /** A plan paid for and not used yet by an organization. */
  hasSubscription: boolean;
  organizations: UnlockOrganization[];
  switchingTo: string | null;
  onCreateOrganization: () => void;
  onSwitch: (organizationId: string) => void;
}) {
  const t = useTranslations('calls.myDay.campaigns.unlock');
  const tCampaigns = useTranslations('calls.myDay.campaigns');
  const tSwitcher = useTranslations('organizations.switcher');

  if (failed) {
    return (
      <div className='flex flex-col items-center gap-3 text-center'>
        <p className='text-sm font-medium'>{t('checkFailed')}</p>
        <Button variant='outline' size='sm' onClick={onRetry}>
          <RotateCw />
          {tCampaigns('retry')}
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-5 w-2/3' />
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  }

  if (hasSubscription) {
    return (
      <div className='space-y-4'>
        <div>
          <h3 className='flex items-center gap-2 text-base font-semibold'>
            <Sparkles className='size-4 text-emerald-500' />
            {t('readyTitle')}
          </h3>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('readyDescription')}
          </p>
        </div>
        <Button
          size='lg'
          className='w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 font-semibold text-white'
          onClick={onCreateOrganization}
        >
          <Plus />
          {tSwitcher('createOrganization')}
        </Button>
      </div>
    );
  }

  if (organizations.length > 0) {
    return (
      <div className='space-y-4'>
        <div>
          <h3 className='flex items-center gap-2 text-base font-semibold'>
            <Building2 className='size-4 text-emerald-500' />
            {t('switchTitle')}
          </h3>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('switchDescription')}
          </p>
        </div>
        <div className='space-y-2'>
          {organizations.map((organization) => (
            <Button
              key={organization.id}
              variant='outline'
              className='h-auto w-full justify-start gap-2.5 py-2'
              disabled={switchingTo !== null}
              onClick={() => onSwitch(organization.id)}
            >
              {organization.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={organization.imageUrl}
                  alt=''
                  className='size-6 rounded-sm object-cover'
                />
              ) : (
                <Building2 className='size-4' />
              )}
              <span className='min-w-0 flex-1 truncate text-left'>
                {t('switchTo', { name: organization.name })}
              </span>
              {switchingTo === organization.id ? (
                <Loader2 className='animate-spin' />
              ) : (
                <ArrowRight className='text-muted-foreground' />
              )}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <OrganizationUpgradePanel
      title={t('title')}
      description={t('description')}
    />
  );
}

/**
 * The Campaigns tab in a personal workspace. Campaigns need an organization
 * (CMP-001), so instead of a dead tab this is the way to one.
 */
export function UnlockCampaignsButton({ className }: { className?: string }) {
  const tTabs = useTranslations('calls.myDay.tabs');
  const tSwitcher = useTranslations('organizations.switcher');
  const api = useApi();
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true }
  });
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  // `null` = not known yet. A read that fails stays unknown: it must never
  // pass for "no plan" and offer a second checkout to someone already paying.
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [subscriptionFailed, setSubscriptionFailed] = useState(false);
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ hasAvailable?: boolean }>('/subscriptions/available')
      .then((res) => {
        if (cancelled) return;
        if (typeof res?.hasAvailable === 'boolean') {
          setHasSubscription(res.hasAvailable);
        } else {
          setSubscriptionFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSubscriptionFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, subscriptionAttempt]);

  const switchTo = async (organizationId: string) => {
    setSwitchingTo(organizationId);
    try {
      await setActive?.({ organization: organizationId });
      // A full load, as the workspace switcher does: every workspace-scoped
      // store starts over in the organization.
      window.location.assign(CAMPAIGNS_TAB_URL);
    } catch {
      setSwitchingTo(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type='button'
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-4 text-sm font-medium whitespace-nowrap text-emerald-700 transition-colors outline-none dark:text-emerald-300',
              'hover:bg-background/70 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              'data-[state=open]:bg-background data-[state=open]:shadow-sm',
              className
            )}
          >
            <Lock className='size-3.5' />
            {tTabs('unlockCampaigns')}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align='end'
          sideOffset={8}
          className='border-border/50 bg-background w-[min(360px,calc(100vw-2rem))] rounded-xl border p-6 shadow-2xl'
        >
          <UnlockCampaignsContent
            loading={
              hasSubscription === null || !isLoaded || userMemberships.isLoading
            }
            failed={subscriptionFailed}
            onRetry={() => {
              setSubscriptionFailed(false);
              setSubscriptionAttempt((attempt) => attempt + 1);
            }}
            hasSubscription={hasSubscription === true}
            organizations={(userMemberships.data ?? []).map(
              ({ organization }) => ({
                id: organization.id,
                name: organization.name,
                imageUrl: organization.imageUrl || null
              })
            )}
            switchingTo={switchingTo}
            onCreateOrganization={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
            onSwitch={(organizationId) => void switchTo(organizationId)}
          />
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className='border-none bg-transparent p-0 shadow-none sm:max-w-[425px]'>
          <DialogHeader className='sr-only'>
            <DialogTitle>{tSwitcher('createOrganization')}</DialogTitle>
          </DialogHeader>
          <CreateOrganization afterCreateOrganizationUrl={CAMPAIGNS_TAB_URL} />
        </DialogContent>
      </Dialog>
    </>
  );
}
