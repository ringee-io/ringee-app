'use client';

import Link from 'next/link';
import { useState } from 'react';
import { InfraDialog } from './infra-dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconUserPlus, IconSearch } from '@tabler/icons-react';
import { toast } from 'sonner';
import { useInfraApi } from '../api';
import { useEntities } from '../lib/use-entities';
import type { OnResourceCreated } from '../lib/node-config';

/**
 * "Add team member" — select one or more existing workspace members to place on
 * the canvas (no backend invite endpoint exists, so inviting a brand-new member
 * is a CTA into the existing settings flow).
 */
export function CreateTeamMemberFlow({
  open,
  position,
  onClose,
  onCreated
}: {
  open: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onCreated: OnResourceCreated;
}) {
  const api = useInfraApi();
  const { byType, loading } = useEntities(open);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const q = query.trim().toLowerCase();
  const members = byType('TEAM_MEMBER').filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.referenceId.toLowerCase().includes(q)
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reset = () => {
    setSelected(new Set());
    setQuery('');
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const { resourceIds } = await api.addTeamMembers(
        Array.from(selected),
        position ?? undefined
      );
      toast.success(
        `Added ${resourceIds.length} member${resourceIds.length > 1 ? 's' : ''}.`
      );
      onCreated(resourceIds[0], { multiple: resourceIds.length > 1 });
      reset();
      onClose();
    } catch {
      toast.error('Could not add members.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <InfraDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      type='TEAM_MEMBER'
      title='Add team member'
      description='Place existing workspace members on the canvas.'
      footer={
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <Button asChild variant='ghost' size='sm'>
            <Link href='/dashboard/settings/overview'>
              <IconUserPlus className='size-4' />
              Invite new member
            </Link>
          </Button>
          <Button onClick={handleAdd} disabled={saving || selected.size === 0}>
            Add {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </div>
      }
    >
      <div className='space-y-3'>
        <div className='relative'>
          <IconSearch className='text-muted-foreground absolute top-2.5 left-2.5 size-4' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search members…'
            className='pl-8'
          />
        </div>

        <div className='max-h-72 space-y-1.5 overflow-y-auto'>
          {loading ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              Loading…
            </p>
          ) : members.length === 0 ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              No members found.
            </p>
          ) : (
            members.map((m) => {
              const checked = selected.has(m.referenceId);
              return (
                <button
                  key={m.referenceId}
                  type='button'
                  onClick={() => toggle(m.referenceId)}
                  className={cn(
                    'hover:bg-accent flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                    checked && 'border-primary bg-accent'
                  )}
                >
                  <Checkbox checked={checked} className='pointer-events-none' />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium'>{m.name}</p>
                    <p className='text-muted-foreground truncate text-xs'>
                      {m.status}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </InfraDialog>
  );
}
