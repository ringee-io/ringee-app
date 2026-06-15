'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { ClipboardCheck } from 'lucide-react';
import { PendingActionsTable } from './pending-actions-table';
import { PaginatedActions } from '../types';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'high_priority', label: 'High priority' },
  { key: 'due_today', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'lead_followups', label: 'Lead follow-ups' },
  { key: 'script_reviews', label: 'Script reviews' },
  { key: 'objection_responses', label: 'Objection responses' },
  { key: 'crm_updates', label: 'CRM updates' },
  { key: 'ai_generated', label: 'AI generated' },
  { key: 'rule_based', label: 'Rule-based' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'organization', label: 'Organization calls' },
  { key: 'personal', label: 'Personal calls' }
];

export function PendingActionsList() {
  const api = useApi();
  const [filter, setFilter] = useState('all');
  const [result, setResult] = useState<PaginatedActions | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<PaginatedActions>(
        `/pending-actions?filter=${filter}`
      );
      setResult(data);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [filter]);

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
      <div className='flex flex-wrap gap-2'>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              filter === f.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted'
            )}
          >
            {f.label}
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
              <h3 className='text-lg font-semibold'>
                You&apos;re all caught up
              </h3>
              <p className='text-muted-foreground mt-1 text-sm'>
                New next-best-actions from your calls will show up here.
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
