'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@ringee/frontend-shared/components/ui/select';
import { Smartphone, Phone } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  Rate as RateType,
  useRateStore
} from '@/features/rate/store/rate.store';

function getFlagEmoji(code: string) {
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((c) => 127397 + c.charCodeAt(0))
  );
}

export function RateClient({ initialRates }: { initialRates: RateType[] }) {
  const { setRates } = useRateStore();
  const [selected, setSelected] = useState<RateType | null>(initialRates[0]);
  const [type, setType] = useState<'mobile' | 'landline'>('mobile');

  useEffect(() => {
    if (initialRates?.length) setRates(initialRates);
  }, [initialRates, setRates]);

  const rate =
    type === 'mobile'
      ? (selected?.mobileAvgRatePerMinute ?? 0)
      : (selected?.landlineAvgRatePerMinute ?? 0);

  if (!selected) return null;

  return (
    <div className='mx-auto flex justify-center space-y-10 px-6 py-10'>
      <Card className='border-border/40 w-full max-w-3xl overflow-hidden border shadow-md backdrop-blur-2xl'>
        <CardContent className='flex flex-col items-center justify-between gap-10 p-10 md:flex-row'>
          {/* Left */}
          <div className='flex w-full flex-col gap-8'>
            <div className='space-y-3'>
              <h2 className='text-foreground text-xl font-semibold tracking-tight'>
                Call rate calculator
              </h2>
              <p className='text-muted-foreground text-sm leading-snug'>
                Check your real-time call rates powered by{' '}
                <span className='text-primary font-medium'>Ringee</span>.
              </p>
            </div>

            <div className='flex flex-col gap-4'>
              <div>
                <label className='text-muted-foreground text-sm font-medium'>
                  I’m calling
                </label>
                <Select
                  onValueChange={(code) =>
                    setSelected(
                      initialRates.find((r) => r.countryName === code)!
                    )
                  }
                  defaultValue={selected.countryName}
                >
                  <SelectTrigger className='bg-background border-border/60 focus:ring-primary focus:border-primary mt-2 w-full text-base font-medium transition-all focus:ring-2'>
                    <SelectValue>
                      <div className='flex items-center gap-2'>
                        <span className='text-xl'>
                          {getFlagEmoji(selected.countryCode)}
                        </span>
                        {selected.countryName}
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {initialRates.map((r) => (
                      <SelectItem key={r.countryName} value={r.countryName}>
                        <div className='flex items-center gap-2'>
                          <span className='text-lg'>
                            {getFlagEmoji(r.countryCode)}
                          </span>
                          {r.countryName}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Call type */}
              <div className='flex items-center gap-4'>
                <span className='text-muted-foreground text-sm font-medium'>
                  To a
                </span>
                <div className='flex items-center gap-2'>
                  <Button
                    size='lg'
                    className={`flex items-center gap-2 px-5 transition-all ${
                      type === 'mobile'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                    }`}
                    onClick={() => setType('mobile')}
                  >
                    <Smartphone className='h-4 w-4' /> Mobile
                  </Button>
                  <Button
                    size='lg'
                    className={`flex items-center gap-2 px-5 transition-all ${
                      type === 'landline'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                    }`}
                    onClick={() => setType('landline')}
                  >
                    <Phone className='h-4 w-4' /> Landline
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right */}
          <motion.div
            key={`${selected.countryCode}-${type}`}
            initial={{ opacity: 0, y: 15, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className='bg-card/50 border-border/50 relative flex w-full flex-col items-center justify-center border p-8 text-center shadow-inner backdrop-blur-xl md:w-[45%]'
          >
            <div className='from-primary/5 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent' />
            <p className='text-muted-foreground mb-1 text-sm'>
              Your call will cost
            </p>
            <h3 className='text-foreground text-4xl font-bold tracking-tight'>
              {selected.currency} ${rate.toFixed(3)}
            </h3>
            <p className='text-muted-foreground mt-1 text-sm'>per minute</p>
            {/* <p className='text-muted-foreground mt-3 text-xs tracking-wider uppercase'>
              Provider: {selected.provider}
            </p> */}
          </motion.div>
        </CardContent>
      </Card>
    </div>
  );
}
