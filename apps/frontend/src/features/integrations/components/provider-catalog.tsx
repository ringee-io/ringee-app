'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  RadioGroup,
  RadioGroupItem,
} from '@ringee/frontend-shared/components/ui/radio-group';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useOrganization } from '@clerk/nextjs';
import { Plus, Sparkles, Users, User } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import type { CrmProviderType } from '../types/crm';
import { PROVIDER_META } from '../types/crm';

interface Props {
  onConnect: (
    provider: CrmProviderType,
    scope: 'personal' | 'organization',
  ) => void;
  connectedProviders: CrmProviderType[];
}

export function ProviderCatalog({ onConnect, connectedProviders }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(Object.keys(PROVIDER_META) as CrmProviderType[]).map((provider) => {
        const meta = PROVIDER_META[provider];
        const alreadyConnected = connectedProviders.includes(provider);
        return (
          <div
            key={provider}
            className={cn(
              'relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors',
              meta.available && !alreadyConnected && 'hover:border-foreground/20',
              !meta.available && 'opacity-70',
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg border p-2',
                  meta.color,
                )}
              >
                <Image
                  src={meta.logo}
                  alt={`${meta.name} logo`}
                  width={24}
                  height={24}
                  className={cn(
                    'h-5 w-5 object-contain',
                    meta.logoDarkInvert && 'dark:invert',
                  )}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold">{meta.name}</h4>
                  {!meta.available && (
                    <Badge variant="outline" className="text-[10px]">
                      <Sparkles className="mr-0.5 h-2.5 w-2.5" /> Soon
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {meta.description}
            </p>
            <div className="mt-auto pt-2">
              {meta.available ? (
                <ConnectButton
                  provider={provider}
                  onConnect={onConnect}
                  alreadyConnected={alreadyConnected}
                />
              ) : (
                <Button variant="outline" size="sm" disabled className="w-full">
                  Notify me
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConnectButton({
  provider,
  onConnect,
  alreadyConnected,
}: {
  provider: CrmProviderType;
  onConnect: (
    provider: CrmProviderType,
    scope: 'personal' | 'organization',
  ) => void;
  alreadyConnected: boolean;
}) {
  const { organization } = useOrganization();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'personal' | 'organization'>(
    organization ? 'organization' : 'personal',
  );

  const meta = PROVIDER_META[provider];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={alreadyConnected ? 'outline' : 'default'}
          className="w-full"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {alreadyConnected ? 'Add another' : `Connect ${meta.name}`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {meta.name}</DialogTitle>
          <DialogDescription>
            Choose where this connection will live. Personal connections are
            private to you, while organization connections are shared with your
            whole team.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={scope}
          onValueChange={(v) => setScope(v as 'personal' | 'organization')}
          className="gap-2"
        >
          <Label
            htmlFor="scope-personal"
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              scope === 'personal' && 'border-primary bg-primary/5',
            )}
          >
            <RadioGroupItem value="personal" id="scope-personal" />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <User className="h-3.5 w-3.5" /> Personal workspace
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Only your calls are logged. Your token and data stay on your
                account.
              </p>
            </div>
          </Label>

          <Label
            htmlFor="scope-org"
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 transition-colors',
              !organization && 'cursor-not-allowed opacity-50',
              organization && 'cursor-pointer',
              scope === 'organization' && 'border-primary bg-primary/5',
            )}
          >
            <RadioGroupItem
              value="organization"
              id="scope-org"
              disabled={!organization}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-3.5 w-3.5" />
                {organization
                  ? organization.name
                  : 'Organization (no active team)'}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {organization
                  ? 'All teammates in this org share this connection. Calls from anyone in the org get logged.'
                  : 'Switch to an organization from the top-left to enable org-level sync.'}
              </p>
            </div>
          </Label>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              onConnect(provider, scope);
            }}
          >
            Continue to {meta.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
