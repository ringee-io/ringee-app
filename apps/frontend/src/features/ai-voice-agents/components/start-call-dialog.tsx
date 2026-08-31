'use client';

import { useState } from 'react';
import { toast } from 'sonner';
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
import type { VoiceAgentVariable } from '../types';
import { Field, controlClass } from './fields/field';

interface Props {
  agentId: string;
  /** The fields shown depend on the agent's type (§13). */
  variables: VoiceAgentVariable[];
  onStarted?: () => void;
}

/** Run the agent from Ringee Web (§13) — the same path the API uses. */
export function StartCallDialog({ agentId, variables, onStarted }: Props) {
  const api = useVoiceAgentApi();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = variables.filter((v) => v.required && !values[v.key]?.trim());

  const start = async () => {
    setError(null);
    if (!to.trim()) {
      setError('Enter the number to call.');
      return;
    }

    setStarting(true);
    try {
      await api.startCall(agentId, { to: to.trim(), variables: values });
      toast.success('Calling now — the result appears here when it ends');
      setOpen(false);
      setTo('');
      setValues({});
      onStarted?.();
    } catch (failure) {
      // 402 (out of credit), 409 (already on a call) and "not dialable" all
      // arrive here with a sentence worth reading, so it stays on the dialog
      // rather than vanishing with a toast.
      setError(describeApiError(failure, 'Could not start the call.'));
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
          <span className='hidden sm:inline'>Start AI call</span>
          <span className='sm:hidden'>Call</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start an AI call</DialogTitle>
          <DialogDescription>
            The agent places the call and holds the conversation. This is a
            real, billed call.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {error ? (
            <Alert variant='destructive' className='rounded-lg'>
              <AlertTriangle className='size-4' />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Field
            label='Phone number'
            htmlFor='call-to'
            required
            hint='International format, e.g. +13055550123.'
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

        <DialogFooter>
          <Button
            className='h-10 rounded-lg'
            onClick={() => void start()}
            disabled={starting || !to.trim() || missing.length > 0}
          >
            {starting ? <Loader2 className='size-4 animate-spin' /> : null}
            Start AI call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
