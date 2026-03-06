'use client';

import { Check, ChevronsUpDown, GalleryVerticalEnd, Plus, Settings, Sparkles, CheckCircle2, ShieldCheck, Zap, User } from 'lucide-react';
import * as React from 'react';
import { useOrganization, useOrganizationList } from '@clerk/nextjs';
import { CreateOrganization, OrganizationProfile } from '@clerk/nextjs';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from './ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from './ui/popover';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { useRouter } from 'next/navigation';
import { useApi } from '../hooks/use.api';

// Mock data for demo/development purposes
const mockOrganization = {
  id: 'org_mock_123',
  name: 'Acme Corp',
  imageUrl: '/acme-corp.jpeg'
};

const mockMemberships = [
  {
    organization: {
      id: 'org_mock_123',
      name: 'Acme Corp',
      imageUrl: '/acme-corp.jpeg'
    },
    role: 'org:admin'
  },
  {
    organization: {
      id: 'org_mock_456',
      name: 'Acme Corp',
      imageUrl: ''
    },
    role: 'org:member'
  }
];

export function OrgSwitcher({ useMock }: { useMock?: boolean }) {
  // Use real Clerk hooks only when not in mock mode
  const clerkOrg = useOrganization();
  const clerkOrgList = useOrganizationList({
    userMemberships: {
      infinite: true
    }
  });

  // Determine which data to use based on useMock
  const activeOrganization = useMock ? mockOrganization : clerkOrg.organization;
  const isOrgLoaded = useMock ? true : clerkOrg.isLoaded;
  const membership = useMock ? { role: 'org:admin' } : clerkOrg.membership;
  const userMemberships = useMock
    ? { data: mockMemberships }
    : clerkOrgList.userMemberships;
  const isMembershipsLoaded = useMock ? true : clerkOrgList.isLoaded;
  const setActive = useMock
    ? ({ organization }: { organization: string | null }) => {
      console.log('[Mock] Setting active org:', organization);
    }
    : clerkOrgList.setActive;

  const router = useRouter();
  const api = useApi();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isManageOpen, setIsManageOpen] = React.useState(false);
  const [isUpgradePopoverOpen, setIsUpgradePopoverOpen] = React.useState(false);
  const [isUpgradeCreateOpen, setIsUpgradeCreateOpen] = React.useState(false);
  const [hasAvailableSubscription, setHasAvailableSubscription] = React.useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = React.useState(useMock ? false : true);
  const [isProceedingToUpgrade, setIsProceedingToUpgrade] = React.useState(false);
  const [isSwitchingOrg, setIsSwitchingOrg] = React.useState(false);

  React.useEffect(() => {
    if (useMock) return;

    const checkSubscription = async () => {
      try {
        const response = await api.get<{ hasAvailable: boolean }>('/subscriptions/available');
        setHasAvailableSubscription(response.hasAvailable);
      } catch (error) {
        console.error('Error checking subscription:', error);
        setHasAvailableSubscription(false);
      } finally {
        setIsLoadingSubscription(false);
      }
    };
    checkSubscription();
  }, [api, useMock]);

  if (!isOrgLoaded || !isMembershipsLoaded || isLoadingSubscription) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size='lg' className='animate-pulse'>
            <div className='bg-sidebar-accent flex aspect-square size-8 items-center justify-center rounded-lg' />
            <div className='flex flex-col gap-0.5 leading-none'>
              <div className='bg-sidebar-accent h-4 w-20 rounded' />
              <div className='bg-sidebar-accent h-3 w-16 rounded' />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const isAdmin = membership?.role === 'org:admin';
  const hasOrgs = userMemberships.data && userMemberships.data.length > 0;

  const handleProceedToUpgrade = async () => {
    setIsProceedingToUpgrade(true);
    try {
      const response = await api.post<{ url: string }>('/stripe/checkout/organization');
      if (response.url) {
        window.location.href = response.url;
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
    } finally {
      setIsUpgradePopoverOpen(false);
      setIsProceedingToUpgrade(false);
    }
  };

  const handleCreateOrg = () => {
    setIsUpgradeCreateOpen(true);
  };

  const handleSetOrg = async (org: string | null) => {
    setIsSwitchingOrg(true);
    try {
      await setActive?.({ organization: org });
      // const url = new URL(window.location.href);
      // url.searchParams.delete('memberId');
      // url.searchParams.delete('memberName');
      // const cleanUrl = url.searchParams.toString()
      //   ? `${url.pathname}?${url.searchParams.toString()}`
      //   : url.pathname;
      // router.replace(cleanUrl);
      // router.refresh();

      window.location.reload();
    } finally {
      setIsSwitchingOrg(false);
    }
  };

  // Has subscription but no org yet - show Create Organization button
  if (hasAvailableSubscription) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size='lg'
            onClick={handleCreateOrg}
            className={cn(
              'group relative flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 font-semibold',
              'transition-all duration-300 ease-out',
              'bg-gradient-to-r from-emerald-500/10 via-teal-400/10 to-cyan-400/10',
              'hover:from-emerald-500/20 hover:via-teal-400/20 hover:to-cyan-400/20',
              'backdrop-blur-md',
              'border border-emerald-500/20',
              'text-emerald-700 dark:text-emerald-300',
              'shadow-[0_0_18px_-4px_rgba(45,212,191,0.2)]',
              'hover:shadow-[0_0_25px_-4px_rgba(45,212,191,0.4)]',
              'cursor-pointer'
            )}
          >
            <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500/30 transition-colors'>
              <Plus className='size-4' />
            </div>
            <div className='flex flex-col gap-0.5 leading-none'>
              <span className='font-semibold'>Create new Organization</span>
              <span className='text-xs opacity-80'>Subscription Ready</span>
            </div>
          </SidebarMenuButton>

          <Dialog open={isUpgradeCreateOpen} onOpenChange={setIsUpgradeCreateOpen}>
            <DialogContent className='sm:max-w-[425px] p-0 border-none bg-transparent shadow-none'>
              <DialogHeader className='sr-only'>
                <DialogTitle>Create Organization</DialogTitle>
              </DialogHeader>
              <CreateOrganization afterCreateOrganizationUrl='/' />
            </DialogContent>
          </Dialog>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!hasOrgs) {
    // No subscription - show upgrade popover
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <Popover open={isUpgradePopoverOpen} onOpenChange={setIsUpgradePopoverOpen}>
            <PopoverTrigger asChild>
              <SidebarMenuButton
                size='lg'

                className={cn(
                  'group relative flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 font-semibold',
                  'transition-all duration-300 ease-out',
                  'bg-gradient-to-r from-emerald-500/10 via-teal-400/10 to-cyan-400/10',
                  'hover:from-emerald-500/20 hover:via-teal-400/20 hover:to-cyan-400/20',
                  'backdrop-blur-md',
                  'border border-emerald-500/20',
                  'text-emerald-700 dark:text-emerald-300',
                  'shadow-[0_0_18px_-4px_rgba(45,212,191,0.2)]',
                  'hover:shadow-[0_0_25px_-4px_rgba(45,212,191,0.4)]',
                  'cursor-pointer'
                )}
              >
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500/30 transition-colors'>
                  <Sparkles className='size-4' />
                </div>
                <div className='flex flex-col gap-0.5 leading-none'>
                  <span className='font-semibold'>Upgrade to Organization</span>
                  <span className='text-xs opacity-80'>Unlock Pro Features</span>
                </div>
              </SidebarMenuButton>
            </PopoverTrigger>
            <PopoverContent
              align='start'
              sideOffset={10}
              className='border-border/50 bg-background w-[360px] rounded-xl border p-6 shadow-2xl'
            >
              <div className='space-y-5'>
                {/* Header */}
                <div>
                  <h3 className='flex items-center gap-2 text-base font-semibold'>
                    <Sparkles className='h-4 w-4 text-emerald-500' />
                    Upgrade to Organization
                  </h3>
                  <p className='text-muted-foreground text-sm mt-1'>
                    Unlock professional power for your team with advanced features.
                  </p>
                </div>

                {/* Features */}
                <div className="space-y-2.5">
                  {[
                    "Unlimited team members",
                    "Cheaper rates per minute",
                    "Virtual numbers included",
                    "Advanced analytics"
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Pricing Highlight */}
                <div className="rounded-lg bg-muted/50 p-3 flex items-center justify-between border border-border/50">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pricing</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">$20</span>
                      <span className="text-xs text-muted-foreground">/month</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-1 rounded-full">
                      Pro Plan
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <Button
                  onClick={handleProceedToUpgrade}
                  size='lg'
                  disabled={isProceedingToUpgrade}
                  className={cn(
                    'w-full font-semibold transition-all duration-300',
                    'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-white border-0',
                    'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.02] hover:brightness-110'
                  )}
                >
                  <Zap className="mr-2 h-4 w-4 fill-white" />
                  Proceed to upgrade
                </Button>

                {/* Footer */}
                <div className='text-muted-foreground flex items-center justify-between border-t pt-3 text-[10px]'>
                  <div className='flex items-center gap-1'>
                    <ShieldCheck className='h-3 w-3 text-emerald-500' />
                    Secure by Stripe
                  </div>
                  <div className='flex items-center gap-1'>
                    <CheckCircle2 className='h-3 w-3 text-emerald-500' />
                    Cancel anytime
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              disabled={isSwitchingOrg}
            >
              <div className='bg-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg'>
                {isSwitchingOrg ? (
                  <div className='size-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
                ) : activeOrganization?.imageUrl ? (
                  <img
                    src={activeOrganization.imageUrl}
                    alt={activeOrganization.name}
                    className='size-8 rounded-lg object-cover'
                  />
                ) : (
                  <GalleryVerticalEnd className='size-4' />
                )}
              </div>
              <div className='flex flex-col gap-0.5 leading-none'>
                <span className='font-semibold'>
                  {isSwitchingOrg ? 'Switching...' : activeOrganization?.name || 'My Personal'}
                </span>
                <span className='text-xs text-muted-foreground'>
                  Organization
                </span>
              </div>
              <ChevronsUpDown className='ml-auto' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-[--radix-dropdown-menu-trigger-width]'
            align='start'
          >
            <DropdownMenuItem
              onSelect={() => handleSetOrg(null)}
              className='gap-2 p-2'
            >
              <div className='flex size-6 items-center justify-center rounded-sm border'>
                <User className='size-4 shrink-0' />
              </div>
              My Personal
              {!activeOrganization && (
                <Check className='ml-auto' />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className='text-xs text-muted-foreground'>
              Organizations
            </DropdownMenuLabel>
            {userMemberships.data?.map((mem) => (
              <DropdownMenuItem
                key={mem.organization.id}
                onSelect={() => handleSetOrg(mem.organization.id)}
                className='gap-2 p-2'
              >
                <div className='flex size-6 items-center justify-center rounded-sm border'>
                  {mem.organization.imageUrl ? (
                    <img
                      src={mem.organization.imageUrl}
                      alt={mem.organization.name}
                      className='size-6 rounded-sm object-cover'
                    />
                  ) : (
                    <GalleryVerticalEnd className='size-4 shrink-0' />
                  )}
                </div>
                {mem.organization.name}
                {activeOrganization?.id === mem.organization.id && (
                  <Check className='ml-auto' />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {isAdmin && (
              <>
                <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
                  <DialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setIsManageOpen(true);
                      }}
                      className='gap-2 p-2'
                    >
                      <div className='flex size-6 items-center justify-center rounded-md border bg-background'>
                        <Settings className='size-4' />
                      </div>
                      <div className='font-medium text-muted-foreground'>
                        Manage Organization
                      </div>
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <DialogContent className='sm:max-w-[900px] p-0 border-none bg-transparent shadow-none max-h-[85vh] overflow-y-auto'>
                    <DialogHeader className='sr-only'>
                      <DialogTitle>Manage Organization</DialogTitle>
                    </DialogHeader>
                    <OrganizationProfile />
                  </DialogContent>
                </Dialog>
                <DropdownMenuSeparator />
              </>
            )}
            {hasAvailableSubscription ? (
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setIsCreateOpen(true);
                    }}
                    className='gap-2 p-2'
                  >
                    <div className='flex size-6 items-center justify-center rounded-md border bg-background'>
                      <Plus className='size-4' />
                    </div>
                    <div className='font-medium text-muted-foreground'>
                      Create Organization
                    </div>
                  </DropdownMenuItem>
                </DialogTrigger>
                <DialogContent className='sm:max-w-[425px] p-0 border-none bg-transparent shadow-none'>
                  <DialogHeader className='sr-only'>
                    <DialogTitle>Create Organization</DialogTitle>
                  </DialogHeader>
                  <CreateOrganization afterCreateOrganizationUrl='/' />
                </DialogContent>
              </Dialog>
            ) : (
              <>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setIsUpgradePopoverOpen(true);
                  }}
                  className='gap-2 p-2'
                >
                  <div className='flex size-6 items-center justify-center rounded-md border bg-background'>
                    <Plus className='size-4' />
                  </div>
                  <div className='font-medium text-muted-foreground'>
                    Create Organization
                  </div>
                </DropdownMenuItem>
                <Dialog open={isUpgradePopoverOpen} onOpenChange={setIsUpgradePopoverOpen}>
                  <DialogContent className='sm:max-w-[400px] p-6'>
                    <DialogHeader className='sr-only'>
                      <DialogTitle>Subscription Required</DialogTitle>
                    </DialogHeader>
                    <div className='space-y-5'>
                      <div>
                        <h3 className='flex items-center gap-2 text-base font-semibold'>
                          <Sparkles className='h-4 w-4 text-emerald-500' />
                          Subscription Required
                        </h3>
                        <p className='text-muted-foreground text-sm mt-1'>
                          You need an active subscription to create another organization.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {[
                          "Unlimited team members",
                          "Cheaper rates per minute",
                          "Virtual numbers included",
                          "Advanced analytics"
                        ].map((feature, i) => (
                          <div key={i} className="flex items-center gap-2.5 text-sm">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                            </div>
                            <span className="text-muted-foreground">{feature}</span>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-lg bg-muted/50 p-3 flex items-center justify-between border border-border/50">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pricing</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-foreground">$20</span>
                            <span className="text-xs text-muted-foreground">/month per org</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-1 rounded-full">
                            Pro Plan
                          </span>
                        </div>
                      </div>

                      <Button
                        onClick={handleProceedToUpgrade}
                        size='lg'
                        disabled={isProceedingToUpgrade}
                        className={cn(
                          'w-full font-semibold transition-all duration-300',
                          'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-white border-0',
                          'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.02] hover:brightness-110'
                        )}
                      >
                        <Zap className="mr-2 h-4 w-4 fill-white" />
                        Subscribe Now
                      </Button>

                      <div className='text-muted-foreground flex items-center justify-between border-t pt-3 text-[10px]'>
                        <div className='flex items-center gap-1'>
                          <ShieldCheck className='h-3 w-3 text-emerald-500' />
                          Secure by Stripe
                        </div>
                        <div className='flex items-center gap-1'>
                          <CheckCircle2 className='h-3 w-3 text-emerald-500' />
                          Cancel anytime
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
