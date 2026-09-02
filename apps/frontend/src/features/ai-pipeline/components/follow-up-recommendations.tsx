'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  TableActionCell,
  TableActionHead
} from '@ringee/frontend-shared/components/ui/table/table-action-column';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import { PendingActionsTable } from '@/features/pending-actions/components/pending-actions-table';
import {
  PaginatedActions,
  PendingActionView
} from '@/features/pending-actions/types';
import {
  ActivationRow,
  ActivationSummary,
  RunPreview,
  allRows
} from '../types';
import {
  MOCK_PENDING_ACTION_COUNT,
  filterMockActions,
  isMockParam,
  mockActivationSummary,
  mockFollowUpActions,
  mockRunPreview,
  patchSummaryRow
} from '../mock-data';
import { MockBadge } from './mock-badge';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

const PIPELINE = 'follow_up_recommendations';

const RESULT_FILTERS: {
  key: string;
  filter?: string;
  status?: string;
}[] = [
  { key: 'pending', status: 'pending' },
  { key: 'high', filter: 'high_priority' },
  { key: 'due_today', filter: 'due_today' },
  { key: 'overdue', filter: 'overdue' },
  { key: 'ai', filter: 'ai_generated' },
  { key: 'rule', filter: 'rule_based' },
  { key: 'dismissed', status: 'dismissed' },
  { key: 'completed', status: 'completed' }
];

export function FollowUpRecommendations() {
  const api = useApi();
  const t = useTranslations('ai.followUp');
  const tCommon = useTranslations('common');
  // `?mock=1` renders the demo dataset and keeps every mutation local.
  const searchParams = useSearchParams();
  const mock = isMockParam(searchParams.get('mock'));
  // Demo actions per context, mutated in place so complete/dismiss/snooze stick
  // while the user moves between filters and contexts.
  const [mockActions, setMockActions] = useState<
    Record<string, PendingActionView[]>
  >({});
  const [summary, setSummary] = useState<ActivationSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState('pending');
  const [results, setResults] = useState<PaginatedActions | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [runPreview, setRunPreview] = useState<RunPreview | null>(null);
  const [runContext, setRunContext] = useState<ActivationRow | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  const rows = useMemo(() => (summary ? allRows(summary) : []), [summary]);
  const selectedRow = useMemo(
    () => rows.find((r) => r.contextKey === selectedId) ?? null,
    [rows, selectedId]
  );

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const data = mock
        ? mockActivationSummary(PIPELINE)
        : await api.get<ActivationSummary>(`/ai-pipeline/${PIPELINE}`);
      setSummary(data);
      // Default to the first available context (org-first inside an org, else
      // personal for freelancers). personal is null inside an organization.
      const first = allRows(data)[0];
      setSelectedId((prev) => prev ?? first?.contextKey ?? null);
    } catch {
      // handled
    } finally {
      setLoadingSummary(false);
    }
  }, [mock]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Seed the demo action set the first time a context is opened, and again once
  // a demo run gives a never-run context its first results.
  useEffect(() => {
    if (!mock || !selectedRow) return;
    setMockActions((prev) => {
      const existing = prev[selectedRow.contextKey];
      if (existing && (existing.length > 0 || !selectedRow.lastRunAt)) {
        return prev;
      }
      return {
        ...prev,
        [selectedRow.contextKey]: mockFollowUpActions(selectedRow)
      };
    });
  }, [mock, selectedRow]);

  const loadResults = useCallback(async () => {
    if (!selectedRow || mock) return;
    setLoadingResults(true);
    try {
      const f = RESULT_FILTERS.find((x) => x.key === resultFilter);
      const data = await api.post<PaginatedActions & { contextKey: string }>(
        `/ai-pipeline/${PIPELINE}/results`,
        {
          ...selectedRow.descriptor,
          contextType: selectedRow.contextType,
          filter: f?.filter,
          status: f?.status
        }
      );
      setResults(data);
    } catch {
      setResults(null);
    } finally {
      setLoadingResults(false);
    }
  }, [selectedRow, resultFilter, mock]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const toggle = async (row: ActivationRow, enabled: boolean) => {
    if (mock) {
      setSummary((prev) =>
        prev ? patchSummaryRow(prev, row.contextKey, { enabled }) : prev
      );
      return;
    }
    try {
      await api.post(`/ai-pipeline/${PIPELINE}/activation`, {
        ...row.descriptor,
        contextType: row.contextType,
        enabled
      });
      await loadSummary();
    } catch {
      // handled
    }
  };

  const openRun = async (row: ActivationRow) => {
    setRunContext(row);
    setRunMessage(null);
    setRunPreview(null);
    if (mock) {
      setRunPreview(mockRunPreview(row));
      return;
    }
    try {
      const preview = await api.post<RunPreview>(
        `/ai-pipeline/${PIPELINE}/run/preview`,
        { ...row.descriptor, contextType: row.contextType }
      );
      setRunPreview(preview);
    } catch {
      setRunMessage(t('run.previewFailed'));
    }
  };

  const confirmRun = async () => {
    if (!runContext) return;
    if (mock) {
      setRunBusy(true);
      setRunMessage(null);
      await new Promise((r) => setTimeout(r, 700));
      setRunMessage(
        t('run.complete', { count: runPreview?.eligibleCount ?? 0 })
      );
      setSummary((prev) =>
        prev
          ? patchSummaryRow(prev, runContext.contextKey, {
              lastRunAt: new Date().toISOString(),
              newEligibleSinceLastRun: 0,
              pendingActionCount: MOCK_PENDING_ACTION_COUNT
            })
          : prev
      );
      setRunBusy(false);
      return;
    }
    setRunBusy(true);
    setRunMessage(null);
    try {
      const res = await api.post<{ status: string; eligibleCount?: number }>(
        `/ai-pipeline/${PIPELINE}/run`,
        { ...runContext.descriptor, contextType: runContext.contextType }
      );
      if (res.status === 'already_running') {
        setRunMessage(t('run.alreadyRunning'));
      } else {
        setRunMessage(t('run.complete', { count: res.eligibleCount ?? 0 }));
        await loadSummary();
        await loadResults();
      }
    } catch (e) {
      setRunMessage((e as Error)?.message ?? t('run.failed'));
    } finally {
      setRunBusy(false);
    }
  };

  const mutate = async (path: string) => {
    try {
      await api.post(path);
      await loadResults();
      await loadSummary();
    } catch {
      // handled
    }
  };

  /** Complete / dismiss / snooze — local in demo mode, POST otherwise. */
  const actOnAction = (
    id: string,
    action: 'complete' | 'dismiss' | 'snooze'
  ) => {
    if (!mock) {
      mutate(`/pending-actions/${id}/${action}`);
      return;
    }
    const now = new Date();
    const patch: Partial<PendingActionView> =
      action === 'complete'
        ? { status: 'completed', completedAt: now.toISOString() }
        : action === 'dismiss'
          ? { status: 'dismissed' }
          : {
              status: 'snoozed',
              snoozedUntil: new Date(
                now.getTime() + 24 * 3600_000
              ).toISOString()
            };
    setMockActions((prev) => {
      const key = selectedRow?.contextKey;
      if (!key || !prev[key]) return prev;
      return {
        ...prev,
        [key]: prev[key].map((a) => (a.id === id ? { ...a, ...patch } : a))
      };
    });
  };

  // In demo mode the results table reads from the local action set so that
  // filter chips and row actions stay consistent without a backend.
  const displayedResults: PaginatedActions | null = mock
    ? filterMockActions(
        (selectedRow && mockActions[selectedRow.contextKey]) ?? [],
        resultFilter
      )
    : results;

  if (loadingSummary) {
    return <Skeleton className='h-96 w-full' />;
  }
  if (!summary) {
    return <p className='text-muted-foreground'>{t('loadFailed')}</p>;
  }

  return (
    <div className='space-y-6'>
      {/* Context selector */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='max-w-md'>
          <label className='text-sm font-medium'>{t('context')}</label>
          <Select
            value={selectedId ?? undefined}
            onValueChange={(v) => setSelectedId(v)}
          >
            <SelectTrigger className='mt-1'>
              <SelectValue placeholder={t('selectContext')} />
            </SelectTrigger>
            <SelectContent>
              {rows.map((r) => (
                <SelectItem key={r.contextKey} value={r.contextKey}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {mock && <MockBadge />}
      </div>

      <p className='text-muted-foreground text-sm'>{t('contextDescription')}</p>

      {/* Activation table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('activation.title')}</CardTitle>
          <CardDescription>{t('activation.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('context')}</TableHead>
                <TableHead>{t('activation.enabled')}</TableHead>
                <TableHead className='hidden sm:table-cell'>
                  {t('activation.newEligible')}
                </TableHead>
                <TableHead className='hidden md:table-cell'>
                  {t('activation.lastRun')}
                </TableHead>
                <TableHead className='hidden sm:table-cell'>
                  {t('activation.pending')}
                </TableHead>
                <TableActionHead>
                  <span className='sr-only'>{tCommon('actions')}</span>
                </TableActionHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.contextKey}
                  className={cn(
                    'cursor-pointer',
                    r.contextKey === selectedId && 'bg-muted/50'
                  )}
                  onClick={() => setSelectedId(r.contextKey)}
                >
                  <TableCell className='font-medium'>{r.label}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={(v) => toggle(r, v)}
                    />
                  </TableCell>
                  <TableCell className='hidden sm:table-cell'>
                    {r.newEligibleSinceLastRun}
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    {r.lastRunAt
                      ? new Date(r.lastRunAt).toLocaleString()
                      : t('never')}
                  </TableCell>
                  <TableCell className='hidden sm:table-cell'>
                    {r.pendingActionCount}
                  </TableCell>
                  <TableActionCell onClick={(e) => e.stopPropagation()}>
                    <TableRowActions
                      label={tCommon('openActions')}
                      menuLabel={tCommon('actions')}
                    >
                      <DropdownMenuItem
                        disabled={!r.enabled}
                        onClick={() => openRun(r)}
                      >
                        <Play className='h-4 w-4' />
                        {t('run.analysis')}
                      </DropdownMenuItem>
                    </TableRowActions>
                  </TableActionCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Run preview */}
      {runContext && (
        <Card className='border-primary/40'>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('run.title', { context: runContext.label })}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {runPreview ? (
              <>
                <div className='flex flex-wrap gap-4 text-sm'>
                  <Stat
                    label={t('run.eligibleCalls')}
                    value={runPreview.eligibleCount}
                  />
                  <Stat
                    label={t('run.newSinceLastRun')}
                    value={runPreview.newEligibleSinceLastRun}
                  />
                  <div>
                    <div className='text-muted-foreground text-xs'>
                      {t('run.estimatedConfidence')}
                    </div>
                    <Badge variant='secondary' className='mt-0.5'>
                      {runPreview.estimatedConfidence}
                    </Badge>
                  </div>
                </div>
                {runPreview.lowData && (
                  <div className='flex items-center gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-700'>
                    <AlertTriangle className='h-4 w-4' />
                    {t('run.lowData')}
                  </div>
                )}
                {runPreview.isRunning && (
                  <div className='text-sm text-amber-700'>
                    {t('run.alreadyRunning')}
                  </div>
                )}
              </>
            ) : (
              <Skeleton className='h-12 w-full' />
            )}
            {runMessage && <p className='text-sm'>{runMessage}</p>}
            <div className='flex gap-2'>
              <Button
                size='sm'
                onClick={confirmRun}
                disabled={runBusy || runPreview?.isRunning}
              >
                {runBusy ? (
                  <Loader2 className='mr-1 h-4 w-4 animate-spin' />
                ) : (
                  <Play className='mr-1 h-4 w-4' />
                )}
                {t('run.now')}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => {
                  setRunContext(null);
                  setRunPreview(null);
                  setRunMessage(null);
                }}
              >
                {t('close')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results for selected context */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('results.title', { context: selectedRow?.label ?? '' })}
          </CardTitle>
          <CardDescription>{t('results.description')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-wrap gap-2'>
            {RESULT_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setResultFilter(f.key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  resultFilter === f.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted'
                )}
              >
                {t(`results.filters.${f.key}`)}
              </button>
            ))}
          </div>

          {loadingResults ? (
            <div className='space-y-2'>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : (displayedResults?.data.length ?? 0) === 0 ? (
            <p className='text-muted-foreground py-8 text-center text-sm'>
              {t('results.empty')}
            </p>
          ) : (
            <PendingActionsTable
              actions={displayedResults!.data}
              showContext={false}
              onComplete={(id) => actOnAction(id, 'complete')}
              onDismiss={(id) => actOnAction(id, 'dismiss')}
              onSnooze={(id) => actOnAction(id, 'snooze')}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='text-lg font-semibold'>{value}</div>
    </div>
  );
}
