'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { InfraDialog } from './infra-dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconFileText,
  IconSearch
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { useInfraApi } from '../api';
import type { InfraNumberSearchItem } from '../types';

const COUNTRIES = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'MX', label: 'Mexico' },
  { code: 'BR', label: 'Brazil' }
];

const NUMBER_TYPES = [
  { value: 'local', label: 'Local' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'toll_free', label: 'Toll-free' }
];

const USE_CASES = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'team', label: 'Team member' },
  { value: 'sip', label: 'SIP device' },
  { value: 'unassigned', label: 'Unassigned' }
];

const PENDING_KEY = 'infra.pendingCheckout';

type Step = 'criteria' | 'select' | 'summary';

/**
 * "Add phone number" — pick country/type → search inventory → review → Stripe
 * Checkout. The purchase is provisioned by the existing subscription webhook;
 * the node appears when the canvas confirms the returning checkout.
 */
export function CreatePhoneNumberFlow({
  open,
  position,
  onClose
}: {
  open: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
}) {
  const api = useInfraApi();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>('criteria');
  const [country, setCountry] = useState('US');
  const [numberType, setNumberType] = useState<
    'local' | 'mobile' | 'toll_free'
  >('local');
  const [areaCode, setAreaCode] = useState('');
  const [useCase, setUseCase] = useState('unassigned');

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<InfraNumberSearchItem[]>([]);
  const [docsRequired, setDocsRequired] = useState(false);
  const [selected, setSelected] = useState<InfraNumberSearchItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep('criteria');
    setResults([]);
    setSelected(null);
    setDocsRequired(false);
    setAreaCode('');
    setUseCase('unassigned');
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSearch = async () => {
    setSearching(true);
    try {
      const res = await api.searchNumbers({
        country,
        numberType,
        areaCode: areaCode.trim() || undefined,
        limit: 20
      });
      setResults(res.numbers);
      setDocsRequired(res.documentsRequired);
      setStep('select');
    } catch {
      toast.error('Could not search numbers for that country.');
    } finally {
      setSearching(false);
    }
  };

  const handleCheckout = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      // Stash the intended canvas drop so we can place the node on return.
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({
          phoneNumber: selected.phoneNumber,
          x: position?.x,
          y: position?.y
        })
      );
      const { url } = await api.phoneCheckout(selected.phoneNumber);
      window.location.href = url;
    } catch {
      sessionStorage.removeItem(PENDING_KEY);
      toast.error('Could not start checkout.');
      setSubmitting(false);
    }
  };

  const stepIndex = step === 'criteria' ? 0 : step === 'select' ? 1 : 2;

  return (
    <InfraDialog
      open={open}
      onOpenChange={(o) => !o && close()}
      type='PHONE_NUMBER'
      title='Add a number to your call center'
      description={
        step === 'criteria'
          ? 'Where do you want to call from? Pick a country and number type.'
          : step === 'select'
            ? 'Choose the number you like best.'
            : 'Review the price, then pay to activate.'
      }
      footer={
        step === 'criteria' ? (
          <Button
            onClick={handleSearch}
            disabled={searching}
            className='w-full'
          >
            <IconSearch className='size-4' />
            {searching ? 'Searching…' : 'Search numbers'}
          </Button>
        ) : step === 'select' ? (
          <div className='flex w-full gap-2'>
            <Button variant='outline' onClick={() => setStep('criteria')}>
              <IconArrowLeft className='size-4' />
              Back
            </Button>
            <Button
              className='flex-1'
              disabled={!selected}
              onClick={() => setStep('summary')}
            >
              Continue
            </Button>
          </div>
        ) : (
          <div className='flex w-full gap-2'>
            <Button variant='outline' onClick={() => setStep('select')}>
              <IconArrowLeft className='size-4' />
              Back
            </Button>
            <Button
              className='flex-1'
              disabled={submitting}
              onClick={handleCheckout}
            >
              {submitting ? 'Redirecting…' : 'Pay & activate'}
            </Button>
          </div>
        )
      }
    >
      {/* Step indicator */}
      <div className='mb-4 flex items-center gap-1.5'>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i <= stepIndex ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>

      <motion.div
        key={step}
        initial={reduce ? false : { opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        {step === 'criteria' ? (
          <div className='space-y-3'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label>Number type</Label>
                <Select
                  value={numberType}
                  onValueChange={(v) =>
                    setNumberType(v as 'local' | 'mobile' | 'toll_free')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NUMBER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>Area / city code (optional)</Label>
                <Input
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  placeholder='415'
                />
              </div>
              <div className='space-y-1'>
                <Label>Use case (optional)</Label>
                <Select value={useCase} onValueChange={setUseCase}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USE_CASES.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}

        {step === 'select' ? (
          <div className='max-h-80 space-y-1 overflow-y-auto'>
            {docsRequired ? (
              <div className='mb-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400'>
                <IconFileText className='mt-0.5 size-4 shrink-0' />
                Numbers in this country need regulatory documents before
                activation. You can complete them after payment.
              </div>
            ) : null}
            {results.length === 0 ? (
              <p className='text-muted-foreground py-6 text-center text-sm'>
                No numbers available for those criteria.
              </p>
            ) : (
              results.map((n) => (
                <button
                  key={n.phoneNumber}
                  type='button'
                  onClick={() => setSelected(n)}
                  className={cn(
                    'hover:bg-accent flex w-full items-center justify-between gap-3 rounded-md border p-2 text-left',
                    selected?.phoneNumber === n.phoneNumber &&
                      'border-primary bg-accent'
                  )}
                >
                  <div className='min-w-0'>
                    <p className='font-mono text-sm font-medium'>
                      {n.phoneNumber}
                    </p>
                    <p className='text-muted-foreground truncate text-xs'>
                      {[n.countryCode, n.numberType, n.locality]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    {n.capabilities.voice ? (
                      <Badge variant='secondary' className='text-[10px]'>
                        voice
                      </Badge>
                    ) : null}
                    {n.capabilities.sms ? (
                      <Badge variant='secondary' className='text-[10px]'>
                        sms
                      </Badge>
                    ) : null}
                    <span className='text-sm font-medium tabular-nums'>
                      ${n.monthlyCost.toFixed(2)}/mo
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : null}

        {step === 'summary' && selected ? (
          <div className='space-y-3'>
            <div className='bg-muted/40 space-y-2 rounded-lg border p-3'>
              <Row label='Number' value={selected.phoneNumber} mono />
              <Row
                label='Country / type'
                value={`${selected.countryCode} · ${selected.numberType ?? numberType}`}
              />
              <Row
                label='Monthly price'
                value={`$${selected.monthlyCost.toFixed(2)} ${selected.currency}`}
              />
              {docsRequired ? (
                <Row label='Documents' value='Required after payment' />
              ) : null}
            </div>
            <p className='text-muted-foreground flex items-start gap-2 text-xs'>
              <IconAlertTriangle className='mt-0.5 size-3.5 shrink-0' />
              You&apos;ll be redirected to Stripe Checkout. The number is
              provisioned only after payment succeeds, then it appears on your
              canvas.
            </p>
          </div>
        ) : null}
      </motion.div>
    </InfraDialog>
  );
}

function Row({
  label,
  value,
  mono
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className='flex items-center justify-between gap-3 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className={cn('font-medium', mono && 'font-mono')}>{value}</span>
    </div>
  );
}
