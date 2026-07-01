'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconSearch } from '@tabler/icons-react';
import { toast } from 'sonner';
import { useInfraApi } from '../api';
import { RESOURCE_META, TONE_DOT, statusTone } from '../lib/node-config';
import type { InfraLinkableItem, InfrastructureResourceType } from '../types';

const ROW_GAP = 130;

/**
 * "Link existing resource" — search and place already-existing workspace
 * resources on the canvas (no new entities created). Multi-select; single picks
 * open the inspector, multiple just drop their nodes. Never duplicates a node.
 */
export function LinkExistingResourceModal({
  open,
  type,
  position,
  onClose,
  onLinked
}: {
  open: boolean;
  type: InfrastructureResourceType | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onLinked: (resourceIds: string[]) => void;
}) {
  const api = useInfraApi();
  const [items, setItems] = useState<InfraLinkableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api
      .listLinkable()
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && setItems([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, api]);

  const key = (i: InfraLinkableItem) => `${i.type}:${i.referenceId}`;
  const q = query.trim().toLowerCase();
  const visible = items
    .filter((i) => (type ? i.type === type : true))
    .filter(
      (i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        i.subtitle.toLowerCase().includes(q)
    );

  const toggle = (k: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const reset = () => {
    setSelected(new Set());
    setQuery('');
  };

  const handleLink = async () => {
    const chosen = visible.filter((i) => selected.has(key(i)));
    if (chosen.length === 0) return;
    setSaving(true);
    try {
      const ids: string[] = [];
      let i = 0;
      for (const item of chosen) {
        const pos = position
          ? { x: position.x, y: position.y + i * ROW_GAP }
          : undefined;
        const res = await api.link(item.type, item.referenceId, pos);
        ids.push(res.id);
        i++;
      }
      toast.success(
        `Linked ${ids.length} resource${ids.length > 1 ? 's' : ''}.`
      );
      onLinked(ids);
      reset();
      onClose();
    } catch {
      toast.error('Could not link those resources.');
    } finally {
      setSaving(false);
    }
  };

  const title = type
    ? `Link existing ${RESOURCE_META[type].label.toLowerCase()}`
    : 'Link existing resource';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Place resources that already exist in this workspace on the canvas.
          </DialogDescription>
        </DialogHeader>

        <div className='relative'>
          <IconSearch className='text-muted-foreground absolute top-2.5 left-2.5 size-4' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search resources…'
            className='pl-8'
          />
        </div>

        <div className='max-h-80 space-y-1 overflow-y-auto'>
          {loading ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              Loading…
            </p>
          ) : visible.length === 0 ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              Everything is already on the canvas.
            </p>
          ) : (
            visible.map((item) => {
              const k = key(item);
              const meta = RESOURCE_META[item.type];
              const Icon = meta.Icon;
              const checked = selected.has(k);
              return (
                <button
                  key={k}
                  type='button'
                  onClick={() => toggle(k)}
                  className={cn(
                    'hover:bg-accent flex w-full items-center gap-3 rounded-md border p-2 text-left',
                    checked && 'border-primary bg-accent'
                  )}
                >
                  <Checkbox checked={checked} className='pointer-events-none' />
                  <div
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md',
                      meta.badge
                    )}
                  >
                    <Icon className='size-4' />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium'>{item.name}</p>
                    <p className='text-muted-foreground truncate text-xs'>
                      {item.subtitle}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      TONE_DOT[statusTone(item.status)]
                    )}
                  />
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleLink}
            disabled={saving || selected.size === 0}
            className='w-full'
          >
            Link {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
