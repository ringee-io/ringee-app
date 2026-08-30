'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, PhoneOutgoing } from 'lucide-react';
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
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { useVoiceAgentApi } from '../api';
import type { VoiceAgentVariable } from '../types';

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

  const start = async () => {
    setStarting(true);
    try {
      await api.startCall(agentId, { to: to.trim(), variables: values });
      toast.success('Calling now — the result appears here when it ends');
      setOpen(false);
      setTo('');
      setValues({});
      onStarted?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not start the call'
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PhoneOutgoing className='mr-2 size-4' />
          Start AI call
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
          <div className='space-y-2'>
            <Label htmlFor='call-to'>Phone number</Label>
            <Input
              id='call-to'
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder='+13055550123'
            />
          </div>

          {variables.map((variable) => (
            <div key={variable.key} className='space-y-2'>
              <Label htmlFor={`var-${variable.key}`}>
                {variable.label}
                {variable.required ? ' *' : ''}
              </Label>
              <Input
                id={`var-${variable.key}`}
                value={values[variable.key] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [variable.key]: e.target.value
                  }))
                }
                placeholder={variable.description}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            onClick={start}
            disabled={
              starting ||
              !to.trim() ||
              variables.some((v) => v.required && !values[v.key]?.trim())
            }
          >
            {starting && <Loader2 className='mr-2 size-4 animate-spin' />}
            Start AI call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
