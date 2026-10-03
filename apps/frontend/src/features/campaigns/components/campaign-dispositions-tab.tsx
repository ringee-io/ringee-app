'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useEnumLabels } from '@/features/call-detail/lib/labels';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import {
  DispositionPicker,
  DispositionSwatch,
  type CampaignDispositionSet
} from '@/features/dispositions';

interface Props {
  campaignId: string;
  /** Org admins (and freelancers) can change the set; members only read it. */
  canManage?: boolean;
  /** Told how many dispositions the dialer shows after every load. */
  onCountChange?: (count: number) => void;
}

/**
 * The dispositions this campaign's dialer shows, in order (DISP-004): the
 * workspace dispositions picked for it, the ones it was created with before
 * workspace dispositions existed, or — with neither — the workspace's default
 * set. An admin picks and orders them; the dispositions themselves are edited
 * in Settings → Dispositions.
 */
export function CampaignDispositionsTab({
  campaignId,
  canManage = false,
  onCountChange
}: Props) {
  const api = useApi();
  const t = useTranslations('campaigns.dispositions');
  const labels = useEnumLabels();
  const [set, setSet] = useState<CampaignDispositionSet | null>(null);
  const [failed, setFailed] = useState(false);
  /** The ids being edited, in order; null while just showing the set. */
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const show = useCallback(
    (next: CampaignDispositionSet) => {
      setSet(next);
      onCountChange?.(next.dispositions.length);
    },
    [onCountChange]
  );

  const load = useCallback(async () => {
    setFailed(false);
    try {
      show(
        await api.get<CampaignDispositionSet>(
          `/campaigns/${campaignId}/disposition-set`
        )
      );
    } catch {
      setFailed(true);
    }
  }, [api, campaignId, show]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing() {
    // A campaign already on its own pick starts from it; otherwise from
    // nothing, which the picker shows as the workspace's defaults.
    setDraft(set?.mode === 'campaign' ? set.dispositions.map((d) => d.id) : []);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      show(
        await api.put<CampaignDispositionSet>(
          `/campaigns/${campaignId}/disposition-set`,
          { dispositionIds: draft }
        )
      );
      setDraft(null);
      toast.success(t('toasts.saved'));
    } catch (error) {
      toast.error(describeApiError(error, t('toasts.saveError')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          {canManage && set && !draft ? (
            <Button size='sm' variant='outline' onClick={startEditing}>
              {set.mode === 'legacy' ? t('switchToWorkspace') : t('edit')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {failed ? (
          <div role='alert' className='space-y-3 rounded-lg border p-4'>
            <p className='text-sm'>{t('loadError')}</p>
            <Button variant='outline' size='sm' onClick={() => void load()}>
              {t('retry')}
            </Button>
          </div>
        ) : !set ? (
          <div className='space-y-2'>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : draft ? (
          <>
            {set.mode === 'legacy' ? (
              <p className='text-muted-foreground text-xs'>
                {t('legacySwitchNote')}
              </p>
            ) : null}
            <DispositionPicker
              value={draft}
              onChange={setDraft}
              disabled={saving}
            />
            <div className='flex justify-end gap-2 border-t pt-4'>
              <Button
                variant='ghost'
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                {t('cancel')}
              </Button>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? <Loader2 className='size-4 animate-spin' /> : null}
                {t('save')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='secondary' className='font-normal'>
                {t(`modes.${set.mode}.badge`)}
              </Badge>
              <p className='text-muted-foreground text-xs'>
                {t(`modes.${set.mode}.description`)}
              </p>
            </div>
            {set.dispositions.length === 0 ? (
              <p className='text-muted-foreground text-sm'>{t('empty')}</p>
            ) : (
              <ol className='divide-y rounded-lg border'>
                {set.dispositions.map((d, index) => (
                  <li
                    key={d.id}
                    className='flex items-center gap-3 px-3 py-2 text-sm'
                  >
                    <span className='text-muted-foreground w-4 text-right font-mono text-[11px]'>
                      {index + 1}
                    </span>
                    <DispositionSwatch color={d.color} />
                    <span className='min-w-0 flex-1 truncate'>{d.label}</span>
                    <span className='text-muted-foreground shrink-0 text-xs'>
                      {d.canonicalOutcome
                        ? labels.outcome(d.canonicalOutcome)
                        : t('noOutcome')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
