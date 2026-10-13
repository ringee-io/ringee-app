'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, CalendarPlus, Loader2, X } from 'lucide-react';
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
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { useOrgMembers } from '@ringee/frontend-shared/hooks/use-org-members';
import {
  ContactPicker,
  contactLabel,
  type PickableContact
} from '@/features/inbox/components/contact-picker';
import { AgentCostEstimate } from '../../components/agent-cost-estimate';
import {
  Field,
  controlClass,
  selectTriggerClass
} from '../../components/fields/field';
import { describeApiError } from '../../lib/api-error';
import { useAutomationApi } from '../api';
import type { AutomationCard } from '../types';

/**
 * "Call to schedule" (AGENT-018): the scheduling agent calls one lead to book
 * a meeting with one member. Everything the context already knows arrives
 * selected — the lead from a contact page, the member is whoever is asking —
 * and pressing the button is what spends, nothing before it.
 */
export function ScheduleCallDialog({
  open,
  onOpenChange,
  scheduling,
  contact
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduling: AutomationCard['scheduling'] | null;
  /** The lead, when the dialog opens from their contact page. */
  contact?: PickableContact;
}) {
  const t = useTranslations('aiVoiceAgents.automations.scheduleCall');
  const api = useAutomationApi();
  const { members, isLoaded } = useOrgMembers();
  const [lead, setLead] = useState<PickableContact | null>(contact ?? null);
  const [firstName, setFirstName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLead(contact ?? null);
    setError(null);
  }, [open, contact]);

  useEffect(() => {
    setFirstName(lead ? leadFirstName(lead) : '');
  }, [lead]);

  // The member defaults to whoever is asking.
  const member =
    memberId || members.find((candidate) => candidate.isCurrentUser)?.id || '';

  const start = async () => {
    if (!lead) return;
    setStarting(true);
    setError(null);
    try {
      await api.scheduleCall({
        contactId: lead.id,
        ...(member ? { responsibleUserId: member } : {}),
        ...(firstName.trim() ? { firstName: firstName.trim() } : {})
      });
      toast.success(t('calling', { name: contactLabel(lead) }));
      onOpenChange(false);
    } catch (failure) {
      // Out of credit (402), the lead on DNC, no number to call from: each
      // arrives with a sentence worth reading, so it stays on the dialog.
      setError(describeApiError(failure, t('error')));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-md'>
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

          <Field label={t('lead')} required>
            {lead ? (
              <div className='flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2'>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>
                    {contactLabel(lead)}
                  </p>
                  <p className='text-muted-foreground truncate text-xs'>
                    {lead.phoneNumber}
                  </p>
                </div>
                {!contact ? (
                  <Button
                    type='button'
                    size='icon'
                    variant='ghost'
                    className='size-11 shrink-0 md:size-8'
                    aria-label={t('changeLead')}
                    onClick={() => setLead(null)}
                  >
                    <X className='size-4' />
                  </Button>
                ) : null}
              </div>
            ) : (
              <ContactPicker autoFocus onPick={setLead} />
            )}
          </Field>

          {lead ? (
            <Field
              label={t('firstName')}
              htmlFor='schedule-first-name'
              required
              hint={t('firstNameHint')}
            >
              <Input
                id='schedule-first-name'
                value={firstName}
                maxLength={80}
                onChange={(event) => setFirstName(event.target.value)}
                className={controlClass}
              />
            </Field>
          ) : null}

          <Field label={t('member')} htmlFor='schedule-member' required>
            <Select value={member} onValueChange={setMemberId}>
              <SelectTrigger
                id='schedule-member'
                className={selectTriggerClass}
                disabled={!isLoaded}
              >
                <SelectValue placeholder={t('chooseMember')} />
              </SelectTrigger>
              <SelectContent>
                {members.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name ?? candidate.id}
                    {candidate.isCurrentUser ? ` ${t('you')}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className='bg-muted/40 space-y-1 rounded-lg px-3 py-2.5 text-xs'>
            {scheduling?.calendar ? (
              <p>{t('booksOn', { calendar: scheduling.calendar.name })}</p>
            ) : null}
            {scheduling?.callerNumber ? (
              <p>{t('callsFrom', { number: scheduling.callerNumber })}</p>
            ) : null}
            <p className='text-muted-foreground'>{t('onlyThisCall')}</p>
            <AgentCostEstimate />
          </div>
        </div>

        <DialogFooter className='shrink-0'>
          <Button
            className='h-11 rounded-lg md:h-10'
            disabled={!lead || !firstName.trim() || !member || starting}
            onClick={() => void start()}
          >
            {starting ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <CalendarPlus className='size-4' />
            )}
            {t('start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function leadFirstName(contact: PickableContact): string {
  if (contact.firstName?.trim()) return contact.firstName.trim();
  const whole = (contact.fullName ?? contact.name ?? '').trim();
  return whole ? whole.split(/\s+/)[0]! : '';
}
