'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Radio } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface CallingNumber {
  id: string;
  phoneNumber: string;
}

const NONE = '__none';

/**
 * Picks a number on the workspace's own carrier (Bring Your Own Carrier) for
 * a campaign. Only numbers the workspace can call from right now are offered —
 * the same list as the dialer's. Renders nothing for a workspace without one,
 * unless the campaign already names a number that has since gone away.
 */
export function CampaignCarrierNumberField({
  value,
  onChange
}: {
  value: string | null;
  onChange: (externalNumberId: string | null) => void;
}) {
  const api = useApi();
  const tc = useTranslations('campaigns');
  const [numbers, setNumbers] = useState<CallingNumber[]>([]);

  useEffect(() => {
    api
      .get<CallingNumber[]>('/external-carriers/calling-numbers')
      .then((rows) => setNumbers(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [api]);

  if (numbers.length === 0 && !value) return null;
  const known = !value || numbers.some((n) => n.id === value);

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2'>
        <Radio className='text-muted-foreground h-4 w-4' />
        <Label>{tc('fields.externalCarrier')}</Label>
      </div>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>
            {tc('fields.externalCarrierNone')}
          </SelectItem>
          {numbers.map((num) => (
            <SelectItem key={num.id} value={num.id}>
              {num.phoneNumber}
            </SelectItem>
          ))}
          {!known && value && (
            <SelectItem value={value} disabled>
              {tc('fields.externalCarrierUnavailable')}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <p className='text-muted-foreground text-xs'>
        {value
          ? tc('fields.externalCarrierHint')
          : tc('fields.externalCarrierNoneHint')}
      </p>
    </div>
  );
}
