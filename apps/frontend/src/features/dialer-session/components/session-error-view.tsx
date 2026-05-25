'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
} from '@ringee/frontend-shared/components/ui/card';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Link2Off,
  Wallet,
} from 'lucide-react';
import type { CallSessionError } from '../use-call-session';

const ICONS = {
  expired: Clock,
  revoked: Link2Off,
  invalid: Link2Off,
  credits: Wallet,
  completed: CheckCircle2,
  generic: AlertTriangle,
} as const;

interface Props {
  error: CallSessionError;
  onRetry: () => void;
}

export function SessionErrorView({ error, onRetry }: Props) {
  const Icon = ICONS[error.variant];
  const isFatal = error.variant === 'invalid' || error.variant === 'revoked';
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Icon className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">{error.title}</h2>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            {error.message}
          </p>
          {!isFatal && (
            <Button variant="outline" className="mt-6" onClick={onRetry}>
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
