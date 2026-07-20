'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Progress } from '@ringee/frontend-shared/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  Play,
  ShieldAlert,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap
} from 'lucide-react';
import {
  ActivationRow,
  ActivationSummary,
  ObjectionInsight,
  ObjectionInsightsView,
  RunPreview,
  allRows,
  insightLabel
} from '../types';
const PIPELINE = 'objection_intelligence';

export function ObjectionIntelligence() {
  const api = useApi();
  const [summary, setSummary] = useState<ActivationSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<ObjectionInsightsView | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [selectedObjection, setSelectedObjection] = useState<string | null>(
    null
  );
  const [contextsOpen, setContextsOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
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
      const data = await api.get<ActivationSummary>(`/ai-pipeline/${PIPELINE}`);
      setSummary(data);
      const first = allRows(data)[0];
      setSelectedId((prev) => prev ?? first?.contextKey ?? null);
    } catch {
      // handled
    } finally {
      setLoadingSummary(false);
    }
  }, [api]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const loadResults = useCallback(async () => {
    if (!selectedRow) return;
    setLoadingResults(true);
    try {
      const data = await api.post<ObjectionInsightsView>(
        `/objection-insights/results`,
        { ...selectedRow.descriptor, contextType: selectedRow.contextType }
      );
      setView(data);
    } catch {
      setView(null);
    } finally {
      setLoadingResults(false);
    }
  }, [api, selectedRow]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const toggle = async (row: ActivationRow, enabled: boolean) => {
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
    setRunOpen(true);
    setRunMessage(null);
    setRunPreview(null);
    try {
      const preview = await api.post<RunPreview>(
        `/ai-pipeline/${PIPELINE}/run/preview`,
        { ...row.descriptor, contextType: row.contextType }
      );
      setRunPreview(preview);
    } catch {
      setRunMessage('Could not load run preview.');
    }
  };

  const confirmRun = async () => {
    if (!runContext) return;
    setRunBusy(true);
    setRunMessage(null);
    try {
      const res = await api.post<{ status: string; eligibleCount?: number }>(
        `/ai-pipeline/${PIPELINE}/run`,
        { ...runContext.descriptor, contextType: runContext.contextType }
      );
      if (res.status === 'already_running') {
        setRunMessage('A run is already in progress for this context.');
      } else {
        setRunMessage(
          `Analysis complete — ${res.eligibleCount ?? 0} calls analyzed cumulatively.`
        );
        await loadSummary();
        await loadResults();
      }
    } catch (e) {
      setRunMessage((e as Error)?.message ?? 'Run failed.');
    } finally {
      setRunBusy(false);
    }
  };

  const descriptorBody = () =>
    selectedRow
      ? { ...selectedRow.descriptor, contextType: selectedRow.contextType }
      : {};

  const saveResponse = async (insight: ObjectionInsight, response: string) => {
    await api.post(`/objection-insights/${insight.id}/save`, {
      ...descriptorBody(),
      response
    });
    await loadResults();
  };

  const insightAction = async (insight: ObjectionInsight, path: string) => {
    await api.post(
      `/objection-insights/${insight.id}/${path}`,
      descriptorBody()
    );
    await loadResults();
    await loadSummary();
  };

  // Per-objection trend delta: latest run count vs the run before it.
  const trendDelta = useMemo(() => {
    const map: Record<string, number> = {};
    const t = view?.trend ?? [];
    if (t.length >= 2) {
      const last = t[t.length - 1].counts;
      const prev = t[t.length - 2].counts;
      for (const key of Object.keys(last)) {
        map[key] = (last[key] ?? 0) - (prev[key] ?? 0);
      }
    }
    return map;
  }, [view]);

  const activeInsights = useMemo(
    () => (view?.insights ?? []).filter((i) => i.status !== 'dismissed'),
    [view]
  );

  // Keep a valid selected objection as the list changes.
  useEffect(() => {
    if (activeInsights.length === 0) {
      setSelectedObjection(null);
      return;
    }
    setSelectedObjection((prev) =>
      prev && activeInsights.some((i) => i.id === prev)
        ? prev
        : activeInsights[0].id
    );
  }, [activeInsights]);

  if (loadingSummary) {
    return <Skeleton className='h-96 w-full rounded-xl' />;
  }
  if (!summary) {
    return <p className='text-muted-foreground'>Could not load pipeline.</p>;
  }

  const confidence = view?.confidence ?? null;
  const showConverted = confidence === 'medium' || confidence === 'high';
  const selectedInsight =
    activeInsights.find((i) => i.id === selectedObjection) ?? null;
  const topBlocker = activeInsights[0] ?? null;
  const seriesFor = (type: string) =>
    (view?.trend ?? []).map((p) => p.counts[type] ?? 0);

  return (
    <div className='space-y-5'>
      {/* Console toolbar */}
      <div className='bg-card flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-1 flex-wrap items-center gap-3'>
          <div className='min-w-[220px] flex-1'>
            <Select
              value={selectedId ?? undefined}
              onValueChange={(v) => setSelectedId(v)}
            >
              <SelectTrigger className='h-9'>
                <SelectValue placeholder='Select a context' />
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
          {selectedRow && (
            <label className='text-muted-foreground flex items-center gap-2 text-xs'>
              <Switch
                checked={selectedRow.enabled}
                onCheckedChange={(v) => toggle(selectedRow, v)}
              />
              {selectedRow.enabled ? 'Enabled' : 'Disabled'}
            </label>
          )}
        </div>
        <div className='flex items-center gap-2'>
          {confidence && <ConfidenceBadge confidence={confidence} />}
          <Button
            size='sm'
            disabled={!selectedRow?.enabled}
            onClick={() => selectedRow && openRun(selectedRow)}
          >
            <Play className='mr-1 h-3.5 w-3.5' /> Run analysis
          </Button>
        </div>
      </div>

      <p className='text-muted-foreground flex items-start gap-1.5 text-xs'>
        <Info className='mt-0.5 h-3.5 w-3.5 shrink-0' />
        Each eligible call&apos;s complete transcript is analyzed once. Later
        runs process only new calls and recalculate cumulative insights; results
        from different contexts never mix.
      </p>

      {/* Contexts manager (de-emphasized) */}
      {rows.length > 1 && (
        <div className='rounded-xl border'>
          <button
            onClick={() => setContextsOpen((o) => !o)}
            className='hover:bg-muted/40 flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium'
          >
            <span>Manage all contexts ({rows.length})</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                contextsOpen && 'rotate-180'
              )}
            />
          </button>
          {contextsOpen && (
            <div className='space-y-1 border-t p-2'>
              {rows.map((r) => (
                <div
                  key={r.contextKey}
                  className='hover:bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm'
                >
                  <div className='flex items-center gap-2'>
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={(v) => toggle(r, v)}
                    />
                    <span className='font-medium'>{r.label}</span>
                  </div>
                  <div className='text-muted-foreground flex items-center gap-3 text-xs'>
                    <span>{r.newEligibleSinceLastRun} new</span>
                    <span className='hidden sm:inline'>
                      {r.lastRunAt
                        ? new Date(r.lastRunAt).toLocaleDateString()
                        : 'Never run'}
                    </span>
                    <span>{r.pendingActionCount} pending</span>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7'
                      disabled={!r.enabled}
                      onClick={() => openRun(r)}
                    >
                      <Play className='h-3 w-3' />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Run panel */}
      {runOpen && runContext && (
        <Card className='border-primary/40'>
          <CardContent className='space-y-3 p-4'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>
                Run analysis — {runContext.label}
              </span>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 w-7 p-0'
                onClick={() => setRunOpen(false)}
              >
                <X className='h-4 w-4' />
              </Button>
            </div>
            {runPreview ? (
              <>
                <div className='flex flex-wrap gap-5 text-sm'>
                  <Stat
                    label='Eligible calls'
                    value={runPreview.eligibleCount}
                  />
                  <Stat
                    label='New since last run'
                    value={runPreview.newEligibleSinceLastRun}
                  />
                  <div>
                    <div className='text-muted-foreground text-xs'>
                      Estimated confidence
                    </div>
                    <Badge variant='secondary' className='mt-0.5'>
                      {runPreview.estimatedConfidence}
                    </Badge>
                  </div>
                </div>
                {runPreview.lowData && (
                  <div className='flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800'>
                    <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                    This recommendation is based on limited data. Treat it as
                    directional until more calls are analyzed.
                  </div>
                )}
                {runPreview.isRunning && (
                  <div className='text-sm text-amber-700'>
                    A run is already in progress for this context.
                  </div>
                )}
              </>
            ) : (
              <Skeleton className='h-12 w-full' />
            )}
            {runMessage && <p className='text-sm'>{runMessage}</p>}
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
              Run now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI band */}
      {(view?.lastRunAt || activeInsights.length > 0) && (
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <KpiTile
            icon={<ShieldAlert className='h-4 w-4' />}
            label='Objections detected'
            value={`${activeInsights.length}`}
          />
          <KpiTile
            icon={<Target className='h-4 w-4' />}
            label='Eligible analyzed'
            value={`${view?.eligibleCount ?? 0}`}
          />
          <KpiTile
            icon={<ThumbsDown className='h-4 w-4' />}
            label='Top blocker'
            value={topBlocker ? insightLabel(topBlocker) : '—'}
            small
          />
          <KpiTile
            icon={<Sparkles className='h-4 w-4' />}
            label='New calls pending'
            value={`${selectedRow?.newEligibleSinceLastRun ?? 0}`}
            accent
          />
        </div>
      )}

      {/* Master-detail console */}
      {loadingResults ? (
        <Skeleton className='h-[420px] w-full rounded-xl' />
      ) : activeInsights.length === 0 ? (
        <EmptyResults enabled={!!selectedRow?.enabled} />
      ) : (
        <div className='grid gap-4 lg:grid-cols-[320px_1fr]'>
          {/* Leaderboard */}
          <div className='space-y-2'>
            <div className='text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase'>
              Objections — ranked by prevalence
            </div>
            {activeInsights.map((insight, idx) => (
              <ObjectionRow
                key={insight.id}
                rank={idx + 1}
                insight={insight}
                delta={trendDelta[insight.objectionType] ?? 0}
                selected={insight.id === selectedObjection}
                onSelect={() => setSelectedObjection(insight.id)}
              />
            ))}
          </div>

          {/* Detail */}
          <div>
            {selectedInsight ? (
              <ObjectionDetail
                key={selectedInsight.id}
                insight={selectedInsight}
                showConverted={showConverted}
                series={seriesFor(selectedInsight.objectionType)}
                onSave={(text) => saveResponse(selectedInsight, text)}
                onAddToScript={() =>
                  insightAction(selectedInsight, 'add-to-script')
                }
                onReview={() => insightAction(selectedInsight, 'review')}
                onDismiss={() => insightAction(selectedInsight, 'dismiss')}
              />
            ) : (
              <Card>
                <CardContent className='text-muted-foreground p-8 text-center text-sm'>
                  Select an objection to see the breakdown.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Leaderboard row ── */

function ObjectionRow({
  rank,
  insight,
  delta,
  selected,
  onSelect
}: {
  rank: number;
  insight: ObjectionInsight;
  delta: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-primary/20 ring-1'
          : 'hover:border-primary/40 hover:bg-muted/30'
      )}
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {rank}
          </span>
          <span className='truncate text-sm font-medium'>
            {insightLabel(insight)}
          </span>
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          {insight.dynamic && (
            <Badge
              variant='outline'
              className='gap-0.5 border-violet-300 px-1.5 text-[10px] text-violet-600'
            >
              <Zap className='h-2.5 w-2.5' /> AI
            </Badge>
          )}
          {insight.status === 'saved' && (
            <CheckCircle2 className='h-3.5 w-3.5 text-green-600' />
          )}
        </div>
      </div>
      <div className='mt-2 flex items-center gap-2'>
        <Progress
          value={Math.round(insight.appearanceRate * 100)}
          className='h-1.5 flex-1'
        />
        <span className='text-muted-foreground w-16 shrink-0 text-right text-xs'>
          {insight.count} calls
        </span>
      </div>
      {delta !== 0 && (
        <div
          className={cn(
            'mt-1 flex items-center gap-0.5 text-[11px]',
            delta > 0 ? 'text-amber-600' : 'text-green-600'
          )}
        >
          {delta > 0 ? (
            <ArrowUpRight className='h-3 w-3' />
          ) : (
            <ArrowDownRight className='h-3 w-3' />
          )}
          {Math.abs(delta)} since last run
        </div>
      )}
    </button>
  );
}

/* ── Detail panel ── */

function ObjectionDetail({
  insight,
  showConverted,
  series,
  onSave,
  onAddToScript,
  onReview,
  onDismiss
}: {
  insight: ObjectionInsight;
  showConverted: boolean;
  series: number[];
  onSave: (text: string) => Promise<void>;
  onAddToScript: () => Promise<void>;
  onReview: () => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(
    insight.savedResponse ?? insight.recommendedResponse ?? ''
  );
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      // handled
    } finally {
      setBusy(null);
    }
  };

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const hasAi =
    !!insight.recommendedResponse ||
    !!insight.underlyingObjection ||
    !!insight.winningPattern;

  return (
    <Card>
      <CardContent className='space-y-5 p-5'>
        {/* Header */}
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='space-y-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <h3 className='text-lg font-semibold'>{insightLabel(insight)}</h3>
              {insight.dynamic && (
                <Badge className='gap-1 bg-violet-100 text-violet-700 hover:bg-violet-100'>
                  <Sparkles className='h-3 w-3' /> Discovered by AI
                </Badge>
              )}
              {insight.status === 'saved' && (
                <Badge
                  variant='secondary'
                  className='gap-1 bg-green-100 text-green-700'
                >
                  <CheckCircle2 className='h-3 w-3' /> Saved
                </Badge>
              )}
            </div>
            <p className='text-muted-foreground text-sm'>
              Appeared in{' '}
              <span className='text-foreground font-semibold'>
                {insight.count}
              </span>{' '}
              calls · {pct(insight.appearanceRate)} of analyzed conversations
            </p>
          </div>
          {series.length >= 2 && (
            <div className='text-right'>
              <div className='text-muted-foreground mb-1 text-[11px]'>
                Trend across runs
              </div>
              <Sparkline series={series} />
            </div>
          )}
        </div>

        {/* Stat row */}
        <div className='flex flex-wrap gap-2'>
          <MiniStat label='Prevalence' value={pct(insight.appearanceRate)} />
          {showConverted && insight.convertedRate != null ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='bg-muted/50 flex cursor-default items-center gap-1.5 rounded-lg px-3 py-1.5'>
                    <div>
                      <div className='text-muted-foreground flex items-center gap-1 text-[11px]'>
                        Still converted <Info className='h-3 w-3' />
                      </div>
                      <div className='text-sm font-semibold'>
                        {pct(insight.convertedRate)}
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className='max-w-xs'>
                  Correlational: the share of calls where this objection
                  appeared and the call still converted. It is not a measure of
                  any single response.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            !insight.dynamic && (
              <MiniStat
                label='Still converted'
                value='—'
                hint='Hidden below medium confidence'
              />
            )
          )}
        </div>

        {!hasAi && (
          <div className='text-muted-foreground bg-muted/40 flex items-start gap-2 rounded-lg p-3 text-sm'>
            <Sparkles className='mt-0.5 h-4 w-4 shrink-0' />
            <span>
              Measured from your calls. Run analysis with AI enabled to surface
              what this objection really means, the winning and losing patterns,
              and a recommended response.
            </span>
          </div>
        )}

        {/* What they really mean */}
        {insight.underlyingObjection && (
          <div className='border-primary/40 bg-primary/5 rounded-lg border-l-2 p-3'>
            <div className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
              What they really mean
            </div>
            <p className='mt-1 text-sm'>{insight.underlyingObjection}</p>
          </div>
        )}

        {/* Win / lose patterns */}
        {(insight.winningPattern || insight.losingPattern) && (
          <div className='grid gap-3 sm:grid-cols-2'>
            {insight.winningPattern && (
              <PatternPanel
                tone='win'
                title='What works'
                value={insight.winningPattern}
              />
            )}
            {insight.losingPattern && (
              <PatternPanel
                tone='lose'
                title='What kills it'
                value={insight.losingPattern}
              />
            )}
          </div>
        )}

        {/* Examples */}
        {insight.examples && insight.examples.length > 0 && (
          <div className='space-y-1.5'>
            <div className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
              From your calls
            </div>
            {insight.examples.map((ex, i) => (
              <div
                key={i}
                className='bg-muted/40 flex items-start gap-2 rounded-lg p-2.5 text-xs'
              >
                <Badge
                  variant='outline'
                  className={cn(
                    'shrink-0',
                    ex.outcome === 'handled'
                      ? 'border-green-300 text-green-700'
                      : ex.outcome === 'killed'
                        ? 'border-red-300 text-red-700'
                        : 'text-muted-foreground'
                  )}
                >
                  {ex.outcome ?? 'example'}
                </Badge>
                <span className='text-muted-foreground italic'>
                  &ldquo;{ex.excerpt}&rdquo;
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Recommended response */}
        {hasAi && (
          <div className='space-y-2'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase'>
              <Sparkles className='h-3.5 w-3.5' />
              Recommended response — edit it to your voice
            </div>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className='resize-none text-sm'
            />
            <div className='flex flex-wrap gap-2'>
              <Button
                size='sm'
                disabled={busy !== null || !draft.trim()}
                onClick={() => run('save', () => onSave(draft.trim()))}
              >
                {busy === 'save' && (
                  <Loader2 className='mr-1 h-3 w-3 animate-spin' />
                )}
                Save response
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={busy !== null}
                onClick={() => run('script', onAddToScript)}
              >
                {busy === 'script' && (
                  <Loader2 className='mr-1 h-3 w-3 animate-spin' />
                )}
                Add to script
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={busy !== null}
                onClick={() => run('review', onReview)}
              >
                {busy === 'review' && (
                  <Loader2 className='mr-1 h-3 w-3 animate-spin' />
                )}
                Create review action
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className='text-muted-foreground ml-auto'
                disabled={busy !== null}
                onClick={() => run('dismiss', onDismiss)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── small building blocks ── */

function ConfidenceBadge({
  confidence
}: {
  confidence: 'low' | 'medium' | 'high';
}) {
  const styles: Record<string, string> = {
    low: 'border-amber-200 bg-amber-50 text-amber-700',
    medium: 'border-blue-200 bg-blue-50 text-blue-700',
    high: 'border-green-200 bg-green-50 text-green-700'
  };
  return (
    <span
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium capitalize',
        styles[confidence]
      )}
    >
      {confidence} confidence
    </span>
  );
}

function KpiTile({
  icon,
  label,
  value,
  small,
  accent
}: {
  icon: ReactNode;
  label: string;
  value: string;
  small?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        accent ? 'border-violet-200 bg-violet-50/50' : 'bg-card'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs',
          accent ? 'text-violet-600' : 'text-muted-foreground'
        )}
      >
        {icon}
        {label}
      </div>
      <div
        className={cn(
          'mt-1 font-semibold',
          small ? 'truncate text-base' : 'text-2xl'
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className='bg-muted/50 rounded-lg px-3 py-1.5' title={hint}>
      <div className='text-muted-foreground text-[11px]'>{label}</div>
      <div className='text-sm font-semibold'>{value}</div>
    </div>
  );
}

function PatternPanel({
  tone,
  title,
  value
}: {
  tone: 'win' | 'lose';
  title: string;
  value: string;
}) {
  const isWin = tone === 'win';
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isWin
          ? 'border-green-200 bg-green-50/60'
          : 'border-red-200 bg-red-50/60'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold',
          isWin ? 'text-green-700' : 'text-red-700'
        )}
      >
        {isWin ? (
          <ThumbsUp className='h-3.5 w-3.5' />
        ) : (
          <ThumbsDown className='h-3.5 w-3.5' />
        )}
        {title}
      </div>
      <p className='mt-1.5 text-sm'>{value}</p>
    </div>
  );
}

function Sparkline({ series }: { series: number[] }) {
  const w = 88;
  const h = 28;
  const max = Math.max(...series, 1);
  const min = Math.min(...series);
  const range = max - min || 1;
  const points = series.map((v, i) => {
    const x = series.length > 1 ? (i / (series.length - 1)) * w : 0;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  const path = points
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const last = points[points.length - 1];
  return (
    <svg width={w} height={h} className='text-primary inline-block'>
      <polyline
        points={path}
        fill='none'
        stroke='currentColor'
        strokeWidth={1.5}
        strokeLinejoin='round'
        strokeLinecap='round'
      />
      {last && <circle cx={last[0]} cy={last[1]} r={2.5} fill='currentColor' />}
    </svg>
  );
}

function EmptyResults({ enabled }: { enabled: boolean }) {
  return (
    <Card>
      <CardContent className='flex flex-col items-center gap-2 py-16 text-center'>
        <div className='bg-primary/10 text-primary flex h-14 w-14 items-center justify-center rounded-2xl'>
          <ShieldAlert className='h-7 w-7' />
        </div>
        <p className='text-base font-medium'>No objections analyzed yet</p>
        <p className='text-muted-foreground max-w-sm text-sm'>
          {enabled
            ? 'Run analysis once this context has enough eligible calls. Ringee will rank what blocks your prospects and even discover objections you have not predefined.'
            : 'Enable this context above, then run analysis to discover what blocks your prospects and how to respond.'}
        </p>
      </CardContent>
    </Card>
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
