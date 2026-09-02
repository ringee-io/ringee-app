'use client';

import { IconShoppingCart } from '@tabler/icons-react';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AvailableNumber } from './buy.number.columns';
import { useTranslations } from 'next-intl';
import {
  PurchaseConfirmModal,
  PurchaseRequirement
} from '../purchase.confirm.modal';

interface RequirementsResponse {
  requirementsMet: boolean;
  requirements: PurchaseRequirement[];
}

export const CellActionBuy = ({ data }: { data: AvailableNumber }) => {
  const t = useTranslations('settings.numbers.buy');
  const tCommon = useTranslations('common');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [requirements, setRequirements] = useState<PurchaseRequirement[]>([]);
  const api = useApi();
  const router = useRouter();

  const goToCheckout = async () => {
    try {
      setConfirming(true);

      // Price is resolved server-side from the provider at checkout; the client
      // intentionally does NOT send an amount (sending one would be ignored).
      const { url } = await api.post<{ url: string }>(
        '/stripe/checkout/phone',
        {
          numberId: data.phoneNumber
        }
      );

      router.push(url);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? err.message : t('purchase.error')
      );
      setConfirming(false);
    }
  };

  const handleBuy = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (data.numberType) params.set('numberType', data.numberType);
      const query = params.toString();

      const res = await api.get<RequirementsResponse>(
        `/telephony/numbers/requirements/${data.countryCode}${query ? `?${query}` : ''}`
      );

      // No regulatory documents required -> go straight to Stripe.
      if (!res.requirements?.length) {
        await goToCheckout();
        return;
      }

      setRequirements(res.requirements);
      setModalOpen(true);
    } catch {
      // If requirements can't be resolved, don't block the sale — proceed to
      // checkout as before.
      await goToCheckout();
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || confirming;

  return (
    <>
      <TableRowActions
        label={tCommon('openActions')}
        menuLabel={tCommon('actions')}
        loading={busy}
      >
        <DropdownMenuItem disabled={busy} onClick={() => void handleBuy()}>
          <IconShoppingCart className='h-4 w-4' />
          {t('table.buy')}
        </DropdownMenuItem>
      </TableRowActions>

      <PurchaseConfirmModal
        open={modalOpen}
        onOpenChange={(open) => {
          if (!confirming) setModalOpen(open);
        }}
        phoneNumber={data.phoneNumber}
        countryCode={data.countryCode}
        requirements={requirements}
        confirming={confirming}
        onConfirm={goToCheckout}
      />
    </>
  );
};
