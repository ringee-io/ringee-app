'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
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
  AlertDialogTitle
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
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
  Settings,
  Loader2,
  AlertTriangle,
  MoreHorizontal,
  RotateCw,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { AgentSessionDialog } from '@/features/dialer/components/agent-session-dialog';
import type { Campaign, CampaignStatus } from '../types/campaign.types';
import { useCampaignSummary } from '../hooks/use-campaign-summary';
import { CampaignLeadsTab } from './campaign-leads-tab';
import { CampaignDispositionsTab } from './campaign-dispositions-tab';
import { CampaignSettingsTab } from './campaign-settings-tab';
import { CampaignAnalytics } from './campaign-analytics';
import { CampaignMembersTab } from './campaign-members-tab';
import { CampaignStatusBadge } from './campaign-status-badge';
import { CampaignKpis } from './campaign-kpis';
import {
  CampaignReadiness,
  canActivate,
  type ReadinessTarget
} from './campaign-readiness';

const TAB_KEYS = ['leads', 'results', 'team', 'settings'] as const;
type TabKey = (typeof TAB_KEYS)[number];

/** Indexes match `Date.getDay()`; labels come from `common.weekdaysShort`. */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

interface Props {
  campaignId: string;
}

export function CampaignDetail({ campaignId }: Props) {
  const api = useApi();
  const t = useTranslations('campaigns');
  const tCommon = useTranslations('common');
  // Members get read-only access; only admins can manage the campaign. The
  // server enforces the same split — this only decides what to show.
  const { isOrgAdmin } = useOrgRole();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [transitioning, setTransitioning] = useState<CampaignStatus | null>(
    null
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [dispositionCount, setDispositionCount] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  // The tab lives in the URL (shallow — no server round trip), so a reload or
  // a shared link lands on the same view.
  const [tabParam, setTabParam] = useQueryState(
    'tab',
    parseAsStringLiteral(TAB_KEYS).withDefault('leads')
  );
  // `?session=open` starts the page with the calling session up — a link
  // from elsewhere that means "go call this campaign".
  const [sessionParam, setSessionParam] = useQueryState('session');

  const isActive = campaign?.status === 'active';
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    refresh: refreshSummary
  } = useCampaignSummary(campaignId, { live: isActive && !sessionOpen });

  const loadCampaign = useCallback(async () => {
    try {
      const data = await api.get<Campaign>(`/campaigns/${campaignId}`);
      setCampaign(data);
      setAccessDenied(false);
      setLoadFailed(false);
    } catch (err: any) {
      // A 403 means the user isn't an admin and isn't assigned to this campaign.
      if (err?.status === 403) setAccessDenied(true);
      else if (err?.status !== 404) setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [api, campaignId]);

  useEffect(() => {
    setLoading(true);
    void loadCampaign();
  }, [loadCampaign]);

  // A draft's readiness needs its disposition and member counts before any
  // tab that reports them has been opened.
  const isDraft = campaign?.status === 'draft';
  useEffect(() => {
    if (!isDraft || !isOrgAdmin) return;
    let cancelled = false;
    api
      .get<unknown[]>(`/campaigns/${campaignId}/dispositions`)
      .then((rows) => !cancelled && setDispositionCount(rows.length))
      .catch(() => {});
    api
      .get<unknown[]>(`/campaigns/${campaignId}/members`)
      .then((rows) => !cancelled && setMemberCount(rows.length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, campaignId, isDraft, isOrgAdmin]);

  useEffect(() => {
    if (sessionParam !== 'open' || !campaign) return;
    if (campaign.status === 'active') setSessionOpen(true);
    void setSessionParam(null);
  }, [sessionParam, campaign, setSessionParam]);

  const tab: TabKey =
    tabParam === 'settings' && !isOrgAdmin ? 'leads' : tabParam;
  const setTab = (next: TabKey) =>
    void setTabParam(next === 'leads' ? null : next);

  function goTo(target: ReadinessTarget) {
    if (target === 'dispositions') {
      setTab('settings');
      // The dispositions card sits under the settings form.
      setTimeout(() => {
        document
          .getElementById('campaign-dispositions')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return;
    }
    setTab(target);
  }

  async function transitionStatus(newStatus: CampaignStatus) {
    setTransitioning(newStatus);
    setActionError(null);
    try {
      await api.patch(`/campaigns/${campaignId}/status`, { status: newStatus });
      await Promise.all([loadCampaign(), refreshSummary()]);
      const verb =
        newStatus === 'active'
          ? 'activated'
          : newStatus === 'paused'
            ? 'paused'
            : newStatus === 'completed'
              ? 'completed'
              : 'updated';
      toast.success(t(`detail.toasts.${verb}`));
    } catch (err: any) {
      const message = err?.message || t('detail.toasts.statusError');
      setActionError(message);
      toast.error(message);
    } finally {
      setTransitioning(null);
      setConfirmComplete(false);
    }
  }

  const refreshAll = useCallback(() => {
    void loadCampaign();
    void refreshSummary();
  }, [loadCampaign, refreshSummary]);

  if (loading) {
    return (
      <div className='space-y-6'>
        <div className='space-y-2'>
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-8 w-72' />
          <Skeleton className='h-4 w-96' />
        </div>
        <Skeleton className='h-36 w-full rounded-xl' />
        <Skeleton className='h-[400px] w-full rounded-xl' />
      </div>
    );
  }

  if (!campaign) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center py-16 text-center'>
          <h3 className='text-lg font-semibold'>
            {accessDenied
              ? t('detail.noAccess.title')
              : loadFailed
                ? t('detail.loadError.title')
                : t('detail.notFound.title')}
          </h3>
          <p className='text-muted-foreground mt-1 max-w-sm text-sm'>
            {accessDenied
              ? t('detail.noAccess.description')
              : loadFailed
                ? t('detail.loadError.description')
                : t('detail.notFound.description')}
          </p>
          <div className='mt-4 flex gap-2'>
            {loadFailed ? (
              <Button
                onClick={() => {
                  setLoading(true);
                  void loadCampaign();
                }}
              >
                <RotateCw className='mr-2 h-4 w-4' />
                {t('detail.loadError.retry')}
              </Button>
            ) : null}
            <Button variant='outline' asChild>
              <Link href='/dashboard/campaigns'>{t('detail.back')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const leadCount = campaign._count?.leads ?? 0;
  const isPaused = campaign.status === 'paused';
  const isCompleted = campaign.status === 'completed';
  const ready = canActivate(leadCount, dispositionCount);

  const workDays = [...(campaign.workDays ?? [])].sort((a, b) => a - b);
  const contiguous =
    workDays.length >= 3 &&
    workDays.every((d, i) => i === 0 || d === workDays[i - 1] + 1);
  const dayLabel = (d: number) => tCommon(`weekdaysShort.${DAY_KEYS[d]}`);
  const daysText =
    workDays.length === 7
      ? t('detail.config.everyDay')
      : contiguous
        ? `${dayLabel(workDays[0])}–${dayLabel(workDays[workDays.length - 1])}`
        : workDays.map(dayLabel).join(', ');
  const configParts = [
    t(`modes.${campaign.dialerMode}`),
    t('detail.config.attempts', { count: campaign.maxAttempts }),
    daysText
      ? `${daysText} ${minutesToTime(campaign.workStartMin)}–${minutesToTime(
          campaign.workEndMin
        )}`
      : null,
    campaign.timezone.replace(/_/g, ' ')
  ].filter(Boolean);

  const primaryAction = isActive ? (
    <Button
      size='lg'
      onClick={() => setSessionOpen(true)}
      className='bg-emerald-600 text-white hover:bg-emerald-700'
    >
      <Phone className='mr-2 h-4 w-4' />
      {t('detail.startCalling')}
    </Button>
  ) : isPaused && isOrgAdmin ? (
    <Button
      size='lg'
      onClick={() => transitionStatus('active')}
      disabled={transitioning !== null}
    >
      {transitioning === 'active' ? (
        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
      ) : (
        <Play className='mr-2 h-4 w-4' />
      )}
      {t('detail.resume')}
    </Button>
  ) : isDraft && isOrgAdmin ? (
    <span
      title={ready ? undefined : t('detail.activateBlocked')}
      className='inline-flex'
    >
      <Button
        size='lg'
        onClick={() => transitionStatus('active')}
        disabled={transitioning !== null || !ready}
      >
        {transitioning === 'active' ? (
          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
        ) : (
          <Play className='mr-2 h-4 w-4' />
        )}
        {t('detail.activate')}
      </Button>
    </span>
  ) : isCompleted ? (
    <Button size='lg' variant='outline' onClick={() => setTab('results')}>
      <BarChart3 className='mr-2 h-4 w-4' />
      {t('detail.viewResults')}
    </Button>
  ) : null;

  return (
    <div className='space-y-6'>
      {/* Header — what this campaign is, and the one thing to do next */}
      <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
        <div className='min-w-0 space-y-1.5'>
          <Link
            href='/dashboard/campaigns'
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm'
          >
            <ArrowLeft className='h-3.5 w-3.5' />
            {t('detail.backShort')}
          </Link>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-2xl font-bold tracking-tight break-words'>
              {campaign.name}
            </h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          {campaign.description && (
            <p className='text-muted-foreground max-w-3xl text-sm'>
              {campaign.description}
            </p>
          )}
          <p className='text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs'>
            {configParts.join(' · ')}
            {isOrgAdmin && !isCompleted ? (
              <>
                <span aria-hidden>·</span>
                <button
                  type='button'
                  onClick={() => setTab('settings')}
                  className='text-foreground font-medium underline-offset-2 hover:underline'
                >
                  {t('detail.config.edit')}
                </button>
              </>
            ) : null}
          </p>
        </div>

        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          {isOrgAdmin && (isActive || isPaused) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='outline'
                  size='icon'
                  className='h-10 w-10'
                  aria-label={t('detail.moreActions')}
                  title={t('detail.moreActions')}
                >
                  <MoreHorizontal className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                <DropdownMenuItem onClick={() => setTab('settings')}>
                  <Settings className='h-4 w-4' />
                  {t('detail.config.editLong')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() => setConfirmComplete(true)}
                >
                  <CheckCircle2 className='h-4 w-4' />
                  {t('detail.completeEllipsis')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {isOrgAdmin && isActive ? (
            <Button
              variant='outline'
              size='lg'
              onClick={() => transitionStatus('paused')}
              disabled={transitioning !== null}
            >
              {transitioning === 'paused' ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Pause className='mr-2 h-4 w-4' />
              )}
              {t('detail.pause')}
            </Button>
          ) : null}
          {primaryAction}
        </div>
      </div>

      {/* Action error (e.g. failed activation due to missing leads / number) */}
      {actionError && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>{t('detail.actionError')}</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {isPaused && !isOrgAdmin ? (
        <Alert>
          <Info className='h-4 w-4' />
          <AlertTitle>{t('detail.pausedNotice.title')}</AlertTitle>
          <AlertDescription>
            {t('detail.pausedNotice.description')}
          </AlertDescription>
        </Alert>
      ) : null}

      {isDraft ? (
        isOrgAdmin ? (
          <CampaignReadiness
            campaign={campaign}
            leadCount={leadCount}
            dispositionCount={dispositionCount}
            memberCount={memberCount}
            onGoTo={goTo}
          />
        ) : (
          <Alert>
            <Info className='h-4 w-4' />
            <AlertTitle>{t('detail.draftNotice.title')}</AlertTitle>
            <AlertDescription>
              {t('detail.draftNotice.description')}
            </AlertDescription>
          </Alert>
        )
      ) : (
        <CampaignKpis
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          leadCount={leadCount}
          onRetry={() => void refreshSummary()}
        />
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        {/* The tab strip is wider than a phone. The grid wrapper gives the
            scroller an automatic minimum size of 0 so it scrolls on its own
            instead of stretching the page. */}
        <div className='grid'>
          <div className='overflow-x-auto'>
            <TabsList>
              <TabsTrigger value='leads'>
                <Users className='mr-2 h-4 w-4' />
                {t('detail.tabs.leads')}
              </TabsTrigger>
              <TabsTrigger value='results'>
                <BarChart3 className='mr-2 h-4 w-4' />
                {t('detail.tabs.results')}
              </TabsTrigger>
              <TabsTrigger value='team'>
                <UserPlus className='mr-2 h-4 w-4' />
                {t('detail.tabs.team')}
              </TabsTrigger>
              {isOrgAdmin && (
                <TabsTrigger value='settings'>
                  <Settings className='mr-2 h-4 w-4' />
                  {t('detail.tabs.settings')}
                </TabsTrigger>
              )}
            </TabsList>
          </div>
        </div>

        <TabsContent value='leads' className='mt-4'>
          <CampaignLeadsTab
            campaignId={campaignId}
            campaignStatus={campaign.status}
            canManage={isOrgAdmin}
            statusCounts={summary?.leadsByStatus}
            onLeadsChanged={refreshAll}
          />
        </TabsContent>

        <TabsContent value='results' className='mt-4'>
          <CampaignAnalytics campaignId={campaignId} />
        </TabsContent>

        <TabsContent value='team' className='mt-4'>
          <CampaignMembersTab
            campaignId={campaignId}
            campaignStatus={campaign.status}
            canManage={isOrgAdmin}
            onCountChange={setMemberCount}
          />
        </TabsContent>

        {isOrgAdmin && (
          <TabsContent value='settings' className='mt-4 space-y-6'>
            <CampaignSettingsTab campaign={campaign} onUpdated={refreshAll} />
            <div id='campaign-dispositions' className='scroll-mt-4'>
              <CampaignDispositionsTab
                campaignId={campaignId}
                canManage={isOrgAdmin}
                onCountChange={setDispositionCount}
              />
            </div>
          </TabsContent>
        )}
      </Tabs>

      <AlertDialog
        open={confirmComplete}
        onOpenChange={(open) => !open && setConfirmComplete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('detail.completeDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('detail.completeDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transitioning === 'completed'}>
              {t('detail.completeDialog.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={transitioning === 'completed'}
              onClick={(event) => {
                event.preventDefault();
                void transitionStatus('completed');
              }}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {transitioning === 'completed' && (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              )}
              {t('detail.completeDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AgentSessionDialog
        campaignId={campaignId}
        campaignName={campaign.name}
        open={sessionOpen}
        onClose={() => {
          setSessionOpen(false);
          refreshAll();
        }}
      />
    </div>
  );
}
