'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import type { Disposition, DispositionCategory } from '../types/campaign.types';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { toast } from 'sonner';

const CATEGORY_COLORS: Record<DispositionCategory, string> = {
  positive: 'bg-green-100 text-green-700',
  neutral: 'bg-blue-100 text-blue-700',
  negative: 'bg-red-100 text-red-700',
  no_contact: 'bg-gray-100 text-gray-700'
};

interface Props {
  campaignId: string;
}

export function CampaignDispositionsTab({ campaignId }: Props) {
  const api = useApi();
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newDispo, setNewDispo] = useState({
    code: '',
    label: '',
    category: 'neutral' as DispositionCategory,
    color: '#3B82F6',
    triggersRetry: false,
    triggersCompletion: false,
    triggersDnc: false,
    triggersCallback: false
  });

  useEffect(() => {
    loadDispositions();
  }, [campaignId]);

  async function loadDispositions() {
    setLoading(true);
    try {
      const data = await api.get<Disposition[]>(
        `/campaigns/${campaignId}/dispositions`
      );
      setDispositions(data);
    } catch {
      // handled by api client
    } finally {
      setLoading(false);
    }
  }

  async function createDisposition(e: React.FormEvent) {
    e.preventDefault();
    if (!newDispo.code || !newDispo.label) return;

    setSaving(true);
    try {
      await api.post(`/campaigns/${campaignId}/dispositions`, newDispo);
      setDialogOpen(false);
      setNewDispo({
        code: '',
        label: '',
        category: 'neutral',
        color: '#3B82F6',
        triggersRetry: false,
        triggersCompletion: false,
        triggersDnc: false,
        triggersCallback: false
      });
      await loadDispositions();
      toast.success('Disposition created.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not create disposition.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDisposition(id: string) {
    try {
      await api.delete(`/campaigns/${campaignId}/dispositions/${id}`);
      await loadDispositions();
      toast.success('Disposition removed.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove disposition.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <CardTitle>Dispositions</CardTitle>
            <CardDescription>
              Configure outcome codes agents select after each call.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size='sm'>
                <Plus className='mr-2 h-4 w-4' />
                Add Disposition
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Disposition</DialogTitle>
                <DialogDescription>
                  Add a new call outcome disposition to this campaign.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createDisposition} className='space-y-4'>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label htmlFor='dispo-code'>Code</Label>
                    <Input
                      id='dispo-code'
                      placeholder='e.g. meeting_booked'
                      value={newDispo.code}
                      onChange={(e) =>
                        setNewDispo({ ...newDispo, code: e.target.value })
                      }
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='dispo-label'>Label</Label>
                    <Input
                      id='dispo-label'
                      placeholder='e.g. Meeting Booked'
                      value={newDispo.label}
                      onChange={(e) =>
                        setNewDispo({ ...newDispo, label: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label>Category</Label>
                    <Select
                      value={newDispo.category}
                      onValueChange={(v) =>
                        setNewDispo({
                          ...newDispo,
                          category: v as DispositionCategory
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='positive'>Positive</SelectItem>
                        <SelectItem value='neutral'>Neutral</SelectItem>
                        <SelectItem value='negative'>Negative</SelectItem>
                        <SelectItem value='no_contact'>No Contact</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='dispo-color'>Color</Label>
                    <Input
                      id='dispo-color'
                      type='color'
                      value={newDispo.color}
                      onChange={(e) =>
                        setNewDispo({ ...newDispo, color: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className='space-y-3'>
                  <Label>Workflow Triggers</Label>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={newDispo.triggersCompletion}
                        onCheckedChange={(v) =>
                          setNewDispo({ ...newDispo, triggersCompletion: !!v })
                        }
                      />
                      Marks lead as completed
                    </label>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={newDispo.triggersRetry}
                        onCheckedChange={(v) =>
                          setNewDispo({ ...newDispo, triggersRetry: !!v })
                        }
                      />
                      Triggers retry
                    </label>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={newDispo.triggersCallback}
                        onCheckedChange={(v) =>
                          setNewDispo({ ...newDispo, triggersCallback: !!v })
                        }
                      />
                      Schedules callback
                    </label>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={newDispo.triggersDnc}
                        onCheckedChange={(v) =>
                          setNewDispo({ ...newDispo, triggersDnc: !!v })
                        }
                      />
                      Adds to DNC list
                    </label>
                  </div>
                </div>
                <div className='flex justify-end gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type='submit' disabled={saving}>
                    {saving && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    Create
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        ) : dispositions.length === 0 ? (
          <div className='flex flex-col items-center py-12 text-center'>
            <h3 className='text-lg font-semibold'>
              No dispositions configured
            </h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              Dispositions are seeded automatically when you activate the
              campaign, or you can add them manually.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className='hidden md:table-cell'>Triggers</TableHead>
                <TableHead className='w-[60px]'></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispositions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className='font-mono text-sm'>{d.code}</TableCell>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      {d.color && (
                        <div
                          className='h-3 w-3 rounded-full'
                          style={{ backgroundColor: d.color }}
                        />
                      )}
                      {d.label}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant='secondary'
                      className={CATEGORY_COLORS[d.category]}
                    >
                      {d.category.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    <div className='flex flex-wrap gap-1'>
                      {d.triggersCompletion && (
                        <Badge variant='outline' className='text-xs'>
                          completion
                        </Badge>
                      )}
                      {d.triggersRetry && (
                        <Badge variant='outline' className='text-xs'>
                          retry
                        </Badge>
                      )}
                      {d.triggersCallback && (
                        <Badge variant='outline' className='text-xs'>
                          callback
                        </Badge>
                      )}
                      {d.triggersDnc && (
                        <Badge variant='outline' className='text-xs'>
                          DNC
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {!d.isSystem && (
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => deleteDisposition(d.id)}
                      >
                        <Trash2 className='text-muted-foreground h-4 w-4' />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
