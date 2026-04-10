'use client';

import { useDialerLeadStore } from '../store/dialer-lead.store';
import { useDialerAttemptStore } from '../store/dialer-attempt.store';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { User, Phone, Mail, Building2, Clock, Users } from 'lucide-react';

export function LeadPanel() {
  const currentLead = useDialerLeadStore((s) => s.currentLead);
  const callStatus = useDialerAttemptStore((s) => s.callStatus);

  if (!currentLead) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Users className="mb-3 h-10 w-10 text-muted-foreground" />
        <h3 className="font-semibold">Waiting for lead</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The dialer will assign the next lead automatically.
        </p>
      </div>
    );
  }

  const { contact, history, attempts } = currentLead;

  return (
    <div className="flex h-full flex-col p-4">
      {/* Contact Info */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white">
            {(contact.name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold">{contact.name || 'Unknown'}</h2>
            {callStatus && (
              <Badge variant="secondary" className="text-xs capitalize">
                {callStatus.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span>{contact.phoneNumber}</span>
          </div>
          {contact.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>{contact.email}</span>
            </div>
          )}
          {contact.company && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>{contact.company}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Attempt #{attempts + 1}</span>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Call History */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="mb-2 text-sm font-semibold">Previous Attempts</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No previous attempts</p>
        ) : (
          <div className="space-y-2">
            {history.map((h, i) => (
              <div
                key={i}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Attempt #{h.attemptNumber}</span>
                  {h.durationSec != null && (
                    <span className="text-xs text-muted-foreground">
                      {h.durationSec}s
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {h.dispositionCode
                    ? h.dispositionCode.replace(/_/g, ' ')
                    : 'No disposition'}
                  {h.endedAt && (
                    <> &middot; {new Date(h.endedAt).toLocaleDateString()}</>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
