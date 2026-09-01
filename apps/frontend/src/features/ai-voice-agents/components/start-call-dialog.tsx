'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, PhoneOutgoing } from 'lucide-react';
import {
  Alert,
  AlertDescription
} from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { useVoiceAgentApi } from '../api';
import { describeApiError } from '../lib/api-error';
import type { VoiceAgentCallerNumber, VoiceAgentVariable } from '../types';
import { CallerNumberSelect } from './caller-number-select';
import { Field, controlClass } from './fields/field';

interface Props {
  agentId: string;
  /**
   * The number assigned to the agent, if it has one. It is preselected here,
   * and an agent without one makes the choice part of triggering the call.
   */
  callerNumberId: string | null;
  /** The fields shown depend on the agent's type (§13). */
  variables: VoiceAgentVariable[];
  onStarted?: () => void;
}

/** Run the agent from Ringee Web (§13) — the same path the API uses. */
export function StartCallDialog({
  agentId,
  callerNumberId,
  variables,
  onStarted
}: Props) {
  const t = useTranslations('aiVoiceAgents.startCall');
  const api = useVoiceAgentApi();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<VoiceAgentCallerNumber[]>([]);
  const [fromNumberId, setFromNumberId] = useState('');

  /**
   * Which number this call goes out from. Loaded when the dialog opens rather
   * than with the screen, because the workspace's numbers can change between
   * one call and the next — and re-read every time so a number released in the
   * meantime is not offered.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api
      .listCallerNumbers()
      .then((list) => {
        if (cancelled) return;
        setNumbers(list);
        const assigned = list.some((n) => n.id === callerNumberId)
          ? callerNumberId!
          : '';
        // One number is not a choice; with several, an unassigned agent leaves
        // it empty on purpose so the user has to say which one.
        setFromNumberId(assigned || (list.length === 1 ? list[0]!.id : ''));
      })
      .catch(() => {
        if (!cancelled) setNumbers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, api, callerNumberId]);

  const missing = variables.filter((v) => v.required && !values[v.key]?.trim());

  const start = async () => {
    setError(null);
    if (!to.trim()) {
      setError(t('enterNumber'));
      return;
    }

    setStarting(true);
    try {
      await api.startCall(agentId, {
        to: to.trim(),
        ...(fromNumberId ? { from_number_id: fromNumberId } : {}),
        variables: values
      });
      toast.success(t('calling'));
      setOpen(false);
      setTo('');
      setValues({});
      onStarted?.();
    } catch (failure) {
      // 402 (out of credit), 409 (already on a call) and "not dialable" all
      // arrive here with a sentence worth reading, so it stays on the dialog
      // rather than vanishing with a toast.
      setError(describeApiError(failure, t('startError')));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button className='h-10 rounded-lg'>
          <PhoneOutgoing className='size-4' />
          <span className='hidden sm:inline'>{t('trigger')}</span>
          <span className='sm:hidden'>{t('triggerShort')}</span>
        </Button>
      </DialogTrigger>
      {/*
        The form grows with the agent type — a blueprint with several variables
        is taller than the screen on a laptop, and taller still on a phone. The
        dialog is capped and only its fields scroll, so the button that starts
        the call is on screen whatever the agent asks for.
      */}
      <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-h-[85vh]'>
        <DialogHeader className='shrink-0'>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('hint')}</DialogDescription>
        </DialogHeader>

        <div className='-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-1'>
          {error ? (
            <Alert variant='destructive' className='rounded-lg'>
              <AlertTriangle className='size-4' />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {numbers.length === 0 ? (
            <Alert className='rounded-lg'>
              <AlertTriangle className='size-4' />
              <AlertDescription className='flex flex-wrap items-center gap-2'>
                {t('noNumber')}
                <Button
                  asChild
                  variant='outline'
                  size='sm'
                  className='rounded-lg'
                >
                  <Link href='/dashboard/buy-number'>{t('getNumber')}</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Field
              label={t('from')}
              htmlFor='call-from'
              required
              hint={callerNumberId ? t('fromAssignedHint') : t('fromHint')}
            >
              <CallerNumberSelect
                id='call-from'
                numbers={numbers}
                value={fromNumberId}
                onChange={setFromNumberId}
                placeholder={t('chooseNumber')}
              />
            </Field>
          )}

          <Field
            label={t('phone')}
            htmlFor='call-to'
            required
            hint={t('phoneHint')}
          >
            <Input
              id='call-to'
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder='+13055550123'
              className={controlClass}
            />
          </Field>

          {variables.map((variable) => (
            <Field
              key={variable.key}
              label={variable.label}
              htmlFor={`var-${variable.key}`}
              required={variable.required}
              hint={variable.description}
            >
              <Input
                id={`var-${variable.key}`}
                value={values[variable.key] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [variable.key]: e.target.value
                  }))
                }
                className={controlClass}
              />
            </Field>
          ))}
        </div>

        <DialogFooter className='shrink-0'>
          <Button
            className='h-10 rounded-lg'
            onClick={() => void start()}
            disabled={
              starting || !to.trim() || !fromNumberId || missing.length > 0
            }
          >
            {starting ? <Loader2 className='size-4 animate-spin' /> : null}
            {t('trigger')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
