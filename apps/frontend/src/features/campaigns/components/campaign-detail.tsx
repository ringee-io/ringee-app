'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader
} from '@ringee/frontend-shared/components/ui/card';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import {
  ArrowLeft,
  Play,
  Pause,
  CheckCircle2,
  Users,
  UserPlus,
  Phone,
  BarChart3,
  ListChecks,
  Settings,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import type { Campaign, CampaignStatus } from '../types/campaign.types';
import { CampaignLeadsTab } from './campaign-leads-tab';
import { CampaignDispositionsTab } from './campaign-dispositions-tab';
import { CampaignSettingsTab } from './campaign-settings-tab';
import { CampaignAnalytics } from './campaign-analytics';
import { CampaignMembersTab } from './campaign-members-tab';

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  active: 'bg-green-100 text-green-700 border-green-300',
  paused: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  completed: 'bg-blue-100 text-blue-700 border-blue-300'
};

interface Props {
  campaignId: string;
}

export function CampaignDetail({ campaignId }: Props) {
  const api = useApi();
  const router = useRouter();
  // Members get read-only access; only admins can manage the campaign.
  const { isOrgAdmin } = useOrgRole();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    loadCampaign();
  }, [campaignId]);

  async function loadCampaign() {
    setLoading(true);
    try {
      const data = await api.get<Campaign>(`/campaigns/${campaignId}`);
      setCampaign(data);
      setAccessDenied(false);
    } catch (err: any) {
      // A 403 means the user isn't an admin and isn't assigned to this campaign.
      if (err?.status === 403) setAccessDenied(true);
    } finally {
      setLoading(false);
    }
  }

  async function transitionStatus(newStatus: CampaignStatus) {
    setTransitioning(true);
    setActionError(null);
    try {
      await api.patch(`/campaigns/${campaignId}/status`, { status: newStatus });
      await loadCampaign();
      const verb =
        newStatus === 'active'
          ? 'activated'
          : newStatus === 'paused'
            ? 'paused'
            : newStatus === 'completed'
              ? 'completed'
              : 'updated';
      toast.success(`Campaign ${verb}.`);
    } catch (err: any) {
      const message =
        err?.message ||
        'Could not update the campaign status. Please try again.';
      setActionError(message);
      toast.error(message);
    } finally {
      setTransitioning(false);
    }
  }

  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-4 w-96' />
        <Skeleton className='h-[400px] w-full' />
      </div>
    );
  }

  if (!campaign) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center py-16 text-center'>
          <h3 className='text-lg font-semibold'>
            {accessDenied
              ? "You don't have access to this campaign"
              : 'Campaign not found'}
          </h3>
          <p className='text-muted-foreground mt-1 max-w-sm text-sm'>
            {accessDenied
              ? 'Only organization admins and assigned members can open this campaign. Ask an admin to add you to it.'
              : 'This campaign may have been deleted or the link is incorrect.'}
          </p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => router.push('/dashboard/campaigns')}
          >
            Back to Campaigns
          </Button>
        </CardContent>
      </Card>
    );
  }

  const leadCount = campaign._count?.leads ?? 0;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-center gap-3'>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => router.push('/dashboard/campaigns')}
          >
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <div>
            <div className='flex items-center gap-2'>
              <h1 className='text-2xl font-bold'>{campaign.name}</h1>
              <Badge
                variant='outline'
                className={STATUS_COLORS[campaign.status]}
              >
                {campaign.status}
              </Badge>
            </div>
            {campaign.description && (
              <p className='text-muted-foreground text-sm'>
                {campaign.description}
              </p>
            )}
          </div>
        </div>

        <div className='flex items-center gap-2'>
          {isOrgAdmin && campaign.status === 'draft' && (
            <Button
              onClick={() => transitionStatus('active')}
              disabled={transitioning}
            >
              {transitioning ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Play className='mr-2 h-4 w-4' />
              )}
              Activate
            </Button>
          )}
          {isOrgAdmin && campaign.status === 'active' && (
            <>
              <Button
                variant='outline'
                onClick={() => transitionStatus('paused')}
                disabled={transitioning}
              >
                {transitioning ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <Pause className='mr-2 h-4 w-4' />
                )}
                Pause
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant='outline' disabled={transitioning}>
                    <CheckCircle2 className='mr-2 h-4 w-4' />
                    Complete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Complete Campaign?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Once this campaign is marked as completed, it cannot be
                      reactivated, edited, or have new leads added. All active
                      agent sessions will end and no further calls will be made.
                      This action is irreversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => transitionStatus('completed')}
                    >
                      {transitioning && (
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      )}
                      Yes, Complete Campaign
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {isOrgAdmin && campaign.status === 'paused' && (
            <>
              <Button
                onClick={() => transitionStatus('active')}
                disabled={transitioning}
              >
                {transitioning ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <Play className='mr-2 h-4 w-4' />
                )}
                Resume
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant='outline' disabled={transitioning}>
                    <CheckCircle2 className='mr-2 h-4 w-4' />
                    Complete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Complete Campaign?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Once this campaign is marked as completed, it cannot be
                      reactivated, edited, or have new leads added. All active
                      agent sessions will end and no further calls will be made.
                      This action is irreversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => transitionStatus('completed')}
                    >
                      {transitioning && (
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      )}
                      Yes, Complete Campaign
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {(campaign.status === 'active' || campaign.status === 'paused') && (
            <Button
              variant='default'
              onClick={() => router.push(`/dashboard/dialer/${campaign.id}`)}
            >
              <Phone className='mr-2 h-4 w-4' />
              Open Dialer
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Action error (e.g. failed activation due to missing leads / number) */}
      {actionError && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>Action could not be completed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Proactive guidance: a draft with no leads can't be activated. */}
      {campaign.status === 'draft' && leadCount === 0 && !actionError && (
        <Alert>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>This campaign isn&apos;t ready yet</AlertTitle>
          <AlertDescription>
            Import at least one lead from the Leads tab before activating.
            You&apos;ll also need a phone number (or caller ID) the campaign can
            dial from.
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Stats */}
      <div className='grid gap-4 sm:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Total Leads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{leadCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Dialer Mode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold capitalize'>
              {campaign.dialerMode}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Max Attempts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{campaign.maxAttempts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Timezone</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='text-lg font-bold'>
              {campaign.timezone.replace(/_/g, ' ')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue='leads'>
        <TabsList>
          <TabsTrigger value='leads'>
            <Users className='mr-2 h-4 w-4' />
            Leads
          </TabsTrigger>
          <TabsTrigger value='members'>
            <UserPlus className='mr-2 h-4 w-4' />
            Members
          </TabsTrigger>
          <TabsTrigger value='dispositions'>
            <ListChecks className='mr-2 h-4 w-4' />
            Dispositions
          </TabsTrigger>
          <TabsTrigger value='analytics'>
            <BarChart3 className='mr-2 h-4 w-4' />
            Analytics
          </TabsTrigger>
          {isOrgAdmin && (
            <TabsTrigger value='settings'>
              <Settings className='mr-2 h-4 w-4' />
              Settings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value='leads' className='mt-4'>
          <CampaignLeadsTab
            campaignId={campaignId}
            campaignStatus={campaign.status}
            canManage={isOrgAdmin}
            onLeadsChanged={loadCampaign}
          />
        </TabsContent>

        <TabsContent value='members' className='mt-4'>
          <CampaignMembersTab
            campaignId={campaignId}
            campaignStatus={campaign.status}
            canManage={isOrgAdmin}
          />
        </TabsContent>

        <TabsContent value='dispositions' className='mt-4'>
          <CampaignDispositionsTab
            campaignId={campaignId}
            canManage={isOrgAdmin}
          />
        </TabsContent>

        <TabsContent value='analytics' className='mt-4'>
          <CampaignAnalytics campaignId={campaignId} />
        </TabsContent>

        {isOrgAdmin && (
          <TabsContent value='settings' className='mt-4'>
            <CampaignSettingsTab campaign={campaign} onUpdated={loadCampaign} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
