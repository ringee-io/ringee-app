'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRightLeft, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import type { NumberPurchased } from './my.number.columns';

type TransferTarget = {
  organizationId: string | null;
  name: string;
  kind: 'personal' | 'organization';
};

const PERSONAL_VALUE = '__personal__';
const FALLBACK = {
  action: 'Move',
  title: 'Move number to another workspace',
  description:
    'Choose where {phone} should live. You must be an administrator of both organization workspaces.',
  placeholder: 'Select destination workspace',
  personal: 'Personal workspace',
  resetNotice:
    'Workspace-specific campaign, rotation and desk-phone assignments will be cleared. The existing Stripe subscription remains billed to the workspace that originally purchased the number.',
  noTargets: 'There are no other workspaces you administer.',
  cancel: 'Cancel',
  confirm: 'Move number',
  moving: 'Moving…',
  success: 'Number moved successfully.',
  error: 'Could not move the number.',
  loadError: 'Could not load your workspaces.'
};

export function NumberActionsCell({ data }: { data: NumberPurchased }) {
  const api = useApi();
  const router = useRouter();
  const t = useTranslations('settings.numbers.my');
  const tVerify = useTranslations('settings.numbers.verify');
  const tCommon = useTranslations('common');
  const copy = t.has('transfer')
    ? ({ ...FALLBACK, ...(t.raw('transfer') as object) } as typeof FALLBACK)
    : FALLBACK;
  const { canAccessAdminFeatures } = useOrgRole();
  const [open, setOpen] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [moving, setMoving] = useState(false);
  const [targets, setTargets] = useState<TransferTarget[]>([]);
  const [selected, setSelected] = useState('');
  const status = (data.status ?? '').toLowerCase();
  const canMove =
    canAccessAdminFeatures &&
    !['pending', 'rejected', 'expired', 'released'].includes(status);
  const canVerify = ['pending', 'rejected', 'expired'].includes(status);

  const showTransfer = async () => {
    setOpen(true);
    setLoadingTargets(true);
    setSelected('');
    try {
      const values = await api.get<TransferTarget[]>(
        '/telephony/phone-numbers/transfer-targets'
      );
      setTargets(
        values.filter(
          (target) =>
            (target.organizationId ?? null) !== (data.organizationId ?? null)
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.loadError);
      setOpen(false);
    } finally {
      setLoadingTargets(false);
    }
  };

  const transfer = async () => {
    if (!selected) return;
    setMoving(true);
    try {
      await api.patch(`/telephony/phone-numbers/${data.id}/workspace`, {
        organizationId: selected === PERSONAL_VALUE ? null : selected
      });
      toast.success(copy.success);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.error);
    } finally {
      setMoving(false);
    }
  };

  if (!canVerify && !canMove) {
    return <span className='text-muted-foreground'>-</span>;
  }

  return (
    <>
      <TableRowActions
        label={tCommon('openActions')}
        menuLabel={tCommon('actions')}
        loading={moving}
      >
        {canVerify ? (
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/buy-number/${data.id}/verification`}>
              <ShieldCheck className='size-4' />
              {status === 'rejected' || status === 'expired'
                ? tVerify('ctaFix')
                : tVerify('cta')}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canMove ? (
          <DropdownMenuItem onClick={() => void showTransfer()}>
            <ArrowRightLeft className='size-4' />
            {copy.action}
          </DropdownMenuItem>
        ) : null}
      </TableRowActions>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => !moving && setOpen(nextOpen)}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>
              {copy.description.replace('{phone}', data.phoneNumber)}
            </DialogDescription>
          </DialogHeader>

          {loadingTargets ? (
            <div className='flex h-24 items-center justify-center'>
              <Loader2 className='text-muted-foreground size-5 animate-spin' />
            </div>
          ) : targets.length === 0 ? (
            <div className='bg-muted/50 text-muted-foreground rounded-lg border p-4 text-sm'>
              {copy.noTargets}
            </div>
          ) : (
            <div className='space-y-3 py-2'>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={copy.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((target) => {
                    const value = target.organizationId ?? PERSONAL_VALUE;
                    return (
                      <SelectItem key={value} value={value}>
                        {target.kind === 'personal'
                          ? copy.personal
                          : target.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {copy.resetNotice}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant='outline'
              disabled={moving}
              onClick={() => setOpen(false)}
            >
              {copy.cancel}
            </Button>
            <Button
              disabled={!selected || moving || loadingTargets}
              onClick={() => void transfer()}
            >
              {moving && <Loader2 className='mr-2 size-4 animate-spin' />}
              {moving ? copy.moving : copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
