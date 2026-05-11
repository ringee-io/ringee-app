'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  MoreVertical,
  PlugZap,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Users,
  User,
} from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { CrmConnectionSummary, CrmProviderType } from '../types/crm';
import { PROVIDER_META } from '../types/crm';

interface Props {
  connection: CrmConnectionSummary;
  onDisconnect: (id: string) => Promise<void>;
  onForget: (id: string) => Promise<void>;
  onReconnect: (
    provider: CrmProviderType,
    scope: 'personal' | 'organization',
  ) => void | Promise<void>;
  onViewHistory: (id: string) => void;
  onManage: (id: string) => void;
  onSync?: (id: string) => Promise<void>;
  syncing?: boolean;
  disconnecting?: boolean;
}

function statusBadge(status: CrmConnectionSummary['status'], t: (key: string) => string) {
  switch (status) {
    case 'active':
      return (
        <Badge
          variant="outline"
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
        >
          <CheckCircle2 className="mr-1 h-3 w-3" /> {t('status.active')}
        </Badge>
      );
    case 'error':
      return (
        <Badge
          variant="outline"
          className="border-amber-500/30 bg-amber-500/10 text-amber-500"
        >
          <AlertCircle className="mr-1 h-3 w-3" /> {t('status.error')}
        </Badge>
      );
    case 'revoked':
      return (
        <Badge
          variant="outline"
          className="border-red-500/30 bg-red-500/10 text-red-500"
        >
          <ShieldAlert className="mr-1 h-3 w-3" /> {t('status.revoked')}
        </Badge>
      );
    case 'disconnected':
      return (
        <Badge
          variant="outline"
          className="border-muted-foreground/30 bg-muted text-muted-foreground"
        >
          {t('status.disconnected')}
        </Badge>
      );
  }
}

function formatRelative(date: string | null, t: (key: string, values?: Record<string, unknown>) => string): string {
  if (!date) return t('lastSyncNever');
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('lastSyncJustNow');
  if (mins < 60) return t('lastSyncMinutesAgo', { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('lastSyncHoursAgo', { n: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t('lastSyncDaysAgo', { n: days });
  return d.toLocaleDateString();
}

export function CrmConnectionCard({
  connection,
  onDisconnect,
  onForget,
  onReconnect,
  onViewHistory,
  onManage,
  onSync,
  syncing,
  disconnecting,
}: Props) {
  const t = useTranslations('crm');
  const meta = PROVIDER_META[connection.provider];
  const needsReconnect =
    connection.status === 'error' || connection.status === 'revoked';

  return (
    <div className="group relative flex flex-col gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/20">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border p-2',
              meta.color,
            )}
          >
            <Image
              src={meta.logo}
              alt={`${meta.name} logo`}
              width={28}
              height={28}
              className={cn(
                'h-6 w-6 object-contain',
                meta.logoDarkInvert && 'dark:invert',
              )}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{meta.name}</h3>
              {statusBadge(connection.status, t)}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {connection.accountName ?? connection.accountId}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onViewHistory(connection.id)}>
              <Clock className="mr-2 h-4 w-4" />
              {t('actions.viewSyncHistory')}
            </DropdownMenuItem>
            {needsReconnect && (
              <DropdownMenuItem
                onClick={() =>
                  onReconnect(connection.provider, connection.scope)
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('actions.reconnect')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {connection.status !== 'disconnected' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-amber-600 focus:text-amber-600"
                  >
                    <PlugZap className="mr-2 h-4 w-4" />
                    {t('disconnect')}
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('dialogs.disconnectTitle', { provider: meta.name })}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('dialogs.disconnectDescription')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDisconnect(connection.id)}
                    >
                      {t('disconnect')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('actions.forgetConnection')}
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('dialogs.forgetTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('dialogs.forgetDescription', { provider: meta.name })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onForget(connection.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('actions.forget')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Scope + last sync */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5">
          {connection.scope === 'organization' ? (
            <>
              <Users className="h-3 w-3" /> {t('scope.organization')}
            </>
          ) : (
            <>
              <User className="h-3 w-3" /> {t('scope.personal')}
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {t('lastSyncAt', { time: formatRelative(connection.lastSyncAt, t) })}
        </span>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label={t('stats.synced')} value={connection.done} tone="success" />
        <Stat label={t('stats.pending')} value={connection.pending} tone="muted" />
        <Stat label={t('stats.failed')} value={connection.failed} tone="danger" />
        <Stat
          label={t('stats.review')}
          value={connection.needsResolution}
          tone="warning"
        />
      </div>

      {/* Sync + Manage buttons */}
      <div className="flex gap-2">
        {onSync && connection.status === 'active' && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={syncing}
                  onClick={() => onSync(connection.id)}
                >
                  {syncing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t('actions.syncNow')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-center">
                {t('actions.syncNowTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onManage(connection.id)}
        >
          {t('connections.manageConnection')}
        </Button>
      </div>

      {/* Error hint */}
      {needsReconnect && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              {connection.status === 'revoked'
                ? t('errors.revokedError')
                : t('errors.connectionError')}
            </p>
            {connection.lastErrorCode && (
              <p className="mt-0.5 text-muted-foreground">
                {t('errors.errorCode', { code: connection.lastErrorCode })}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0"
            disabled={disconnecting}
            onClick={() =>
              onReconnect(connection.provider, connection.scope)
            }
          >
            {disconnecting ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            {t('actions.reconnect')}
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'danger' | 'warning' | 'muted';
}) {
  const toneClass = {
    success: 'text-emerald-500',
    danger: 'text-red-500',
    warning: 'text-amber-500',
    muted: 'text-foreground',
  }[tone];
  return (
    <div className="rounded-md border bg-background p-2.5 text-center">
      <p className={cn('text-lg font-semibold leading-none', toneClass)}>
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
