'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { MemberFilter } from '@ringee/frontend-shared/components/member-filter';
import { useTranslations } from 'next-intl';
import { ClipboardCheck } from 'lucide-react';
import { PendingActionsTable } from './pending-actions-table';
import { PaginatedActions } from '../types';

const FILTER_KEYS = [
  'all',
  'high_priority',
  'due_today',
  'overdue',
  'lead_followups',
  'script_reviews',
  'objection_responses',
  'crm_updates',
  'ai_generated',
  'rule_based',
  'campaign',
  'organization',
  'personal'
] as const;

export function PendingActionsList() {
  const api = useApi();
  const tScope = useTranslations('common.scope');
  const t = useTranslations('ai.pendingActions');
  const { isOrgAdmin, hasOrg } = useOrgRole();
  const [filter, setFilter] = useState('all');
  // Admin-only scope: 'mine' (default) or 'all' (+ optional member narrowing).
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [result, setResult] = useState<PaginatedActions | null>(null);
  const [loading, setLoading] = useState(true);

  // Context chips only make sense for the workspace the user is actually in.
  const visibleFilters = FILTER_KEYS.filter((key) => {
    if (key === 'personal') return !hasOrg;
    if (key === 'organization') return hasOrg;
    return true;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter });
      if (isOrgAdmin) {
        if (memberId) params.set('memberId', memberId);
        else params.set('scope', scope);
      }
      const data = await api.get<PaginatedActions>(
        `/pending-actions?${params.toString()}`
      );
      setResult(data);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [filter, isOrgAdmin, scope, memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const mutate = async (path: string) => {
    try {
      await api.post(path);
      await load();
    } catch {
      // handled
    }
  };

  const actions = result?.data ?? [];

  return (
    <div className='space-y-4'>
      {isOrgAdmin && (
        <div className='flex flex-wrap items-center gap-2'>
          <div className='inline-flex rounded-md border p-0.5'>
            {(['mine', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setScope(s);
                  if (s === 'mine') setMemberId(null);
                }}
                className={cn(
                  'rounded px-3 py-1 text-sm transition-colors',
                  scope === s && !memberId
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                {tScope(s)}
              </button>
            ))}
          </div>
          {scope === 'all' && (
            <MemberFilter value={memberId} onChange={(id) => setMemberId(id)} />
          )}
        </div>
      )}

      <div className='flex flex-wrap gap-2'>
        {visibleFilters.map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              filter === key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted'
            )}
          >
            {t(`filters.${key}`)}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className='pt-6'>
          {loading ? (
            <div className='space-y-2'>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : actions.length === 0 ? (
            <div className='flex flex-col items-center py-12 text-center'>
              <ClipboardCheck className='text-muted-foreground mb-4 h-12 w-12' />
              <h3 className='text-lg font-semibold'>{t('empty.title')}</h3>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t('empty.description')}
              </p>
            </div>
          ) : (
            <PendingActionsTable
              actions={actions}
              onComplete={(id) => mutate(`/pending-actions/${id}/complete`)}
              onDismiss={(id) => mutate(`/pending-actions/${id}/dismiss`)}
              onSnooze={(id) => mutate(`/pending-actions/${id}/snooze`)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
