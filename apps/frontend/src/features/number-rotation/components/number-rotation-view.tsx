'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
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
import { useNumberRotation } from '../hooks/use-number-rotation';
import type { PoolMember, RotationStatus, RotationStrategy } from '../types';

const STATUS_VARIANT: Record<
  RotationStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  active: 'default',
  cooling: 'secondary',
  flagged: 'destructive',
  disabled: 'outline'
};

export function NumberRotationView() {
  const t = useTranslations('numberRotation');
  const {
    settings,
    pool,
    reporting,
    loading,
    saving,
    updateSettings,
    updateMember
  } = useNumberRotation();

  const onToggleEnabled = async (value: boolean) => {
    try {
      await updateSettings({ enabled: value });
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  };

  const onStrategyChange = async (value: RotationStrategy) => {
    try {
      await updateSettings({ strategy: value });
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  };

  const onDefaultCapBlur = async (value: number) => {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value === settings.defaultDailyCap
    )
      return;
    try {
      await updateSettings({ defaultDailyCap: value });
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  };

  return (
    <div className='space-y-6'>
      {/* What it does */}
      <Card>
        <CardHeader>
          <CardTitle>{t('explainer.title')}</CardTitle>
          <CardDescription>{t('explainer.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className='text-muted-foreground space-y-2 text-sm'>
          <p>{t('explainer.localPresence')}</p>
          <p>{t('explainer.reputation')}</p>
          <p className='text-foreground font-medium'>
            {t('explainer.compliance')}
          </p>
        </CardContent>
      </Card>

      {/* Master switch + config */}
      <Card>
        <CardHeader>
          <CardTitle>{t('master.title')}</CardTitle>
          <CardDescription>{t('master.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {loading ? (
            <Skeleton className='h-12 w-full' />
          ) : (
            <>
              <div className='flex items-center justify-between gap-4 rounded-lg border p-4'>
                <div className='space-y-0.5'>
                  <p className='text-sm font-medium'>
                    {settings.enabled
                      ? t('master.statusOn')
                      : t('master.statusOff')}
                  </p>
                  <p className='text-muted-foreground text-sm'>
                    {t('master.toggleHint')}
                  </p>
                </div>
                <Switch
                  checked={settings.enabled}
                  disabled={saving}
                  onCheckedChange={onToggleEnabled}
                />
              </div>

              {settings.enabled && (
                <div className='grid gap-6 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label>{t('config.strategy')}</Label>
                    <Select
                      value={settings.strategy}
                      onValueChange={(v) =>
                        onStrategyChange(v as RotationStrategy)
                      }
                      disabled={saving}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='local_presence'>
                          {t('config.strategyLocalPresence')}
                        </SelectItem>
                        <SelectItem value='balanced'>
                          {t('config.strategyBalanced')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className='text-muted-foreground text-xs'>
                      {settings.strategy === 'local_presence'
                        ? t('config.strategyLocalPresenceDesc')
                        : t('config.strategyBalancedDesc')}
                    </p>
                  </div>

                  <div className='space-y-2'>
                    <Label>{t('config.defaultCap')}</Label>
                    <Input
                      type='number'
                      min={0}
                      defaultValue={settings.defaultDailyCap}
                      disabled={saving}
                      onBlur={(e) =>
                        onDefaultCapBlur(parseInt(e.target.value, 10))
                      }
                    />
                    <p className='text-muted-foreground text-xs'>
                      {t('config.defaultCapDesc')}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Pool */}
      {settings.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>{t('pool.title')}</CardTitle>
            <CardDescription>{t('pool.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className='h-40 w-full' />
            ) : pool.length === 0 ? (
              <p className='text-muted-foreground text-sm'>{t('pool.empty')}</p>
            ) : (
              <PoolTable
                pool={pool}
                saving={saving}
                onUpdate={updateMember}
                errorLabel={t('errors.saveFailed')}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Reporting */}
      {settings.enabled && reporting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('reporting.title')}</CardTitle>
            <CardDescription>{t('reporting.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reporting.number')}</TableHead>
                  <TableHead>{t('reporting.country')}</TableHead>
                  <TableHead className='text-right'>
                    {t('reporting.calls')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('reporting.answerRate')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('reporting.score')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reporting.map((r) => (
                  <TableRow key={r.numberId}>
                    <TableCell className='font-mono text-xs'>
                      {r.phoneNumber}
                    </TableCell>
                    <TableCell>{r.isoCountry}</TableCell>
                    <TableCell className='text-right'>{r.calls}</TableCell>
                    <TableCell className='text-right'>
                      {Math.round(r.answerRate * 100)}%
                    </TableCell>
                    <TableCell className='text-right'>
                      {r.healthScore}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PoolTable({
  pool,
  saving,
  onUpdate,
  errorLabel
}: {
  pool: PoolMember[];
  saving: boolean;
  onUpdate: (
    numberId: string,
    patch: {
      participating?: boolean;
      dailyCap?: number | null;
      status?: 'active' | 'disabled';
    }
  ) => Promise<void>;
  errorLabel: string;
}) {
  const t = useTranslations('numberRotation');

  const handle = async (
    numberId: string,
    patch: Parameters<typeof onUpdate>[1]
  ) => {
    try {
      await onUpdate(numberId, patch);
    } catch {
      toast.error(errorLabel);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('pool.number')}</TableHead>
          <TableHead>{t('pool.country')}</TableHead>
          <TableHead>{t('pool.status')}</TableHead>
          <TableHead className='text-right'>{t('pool.usedToday')}</TableHead>
          <TableHead className='text-right'>{t('pool.cap')}</TableHead>
          <TableHead className='text-right'>{t('pool.health')}</TableHead>
          <TableHead className='text-right'>{t('pool.inRotation')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pool.map((m) => (
          <TableRow key={m.numberId}>
            <TableCell className='font-mono text-xs'>
              {m.phoneNumber}
              {m.areaCode ? (
                <span className='text-muted-foreground'> · {m.areaCode}</span>
              ) : null}
            </TableCell>
            <TableCell>{m.isoCountry}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[m.rotationStatus]}>
                {t(`status.${m.rotationStatus}`)}
              </Badge>
            </TableCell>
            <TableCell className='text-right'>{m.usedToday}</TableCell>
            <TableCell className='text-right'>
              <Input
                type='number'
                min={0}
                defaultValue={m.dailyCap}
                disabled={saving}
                className='ml-auto h-8 w-20 text-right'
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v) && v >= 0 && v !== m.dailyCap)
                    handle(m.numberId, { dailyCap: v });
                }}
              />
            </TableCell>
            <TableCell className='text-right'>{m.healthScore}</TableCell>
            <TableCell className='text-right'>
              <Switch
                checked={m.participating && m.rotationStatus !== 'disabled'}
                disabled={saving}
                onCheckedChange={(v) =>
                  handle(m.numberId, {
                    participating: v,
                    status: v ? 'active' : 'disabled'
                  })
                }
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
